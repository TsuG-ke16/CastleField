// 起動と、Game と画面のつなぎ役。
// - data/ の JSON を読み、new Game({ cards, rules, rng }) を作る
// - Game のイベントをキューにため、届いた順に Animations で演出する
// - 演出中は操作を受け付けない（画面タップで演出を飛ばせる）
// UI はゲームの状態を直接書き換えない。getState / playCard / discard / endTurn / on / off と、
// 開始の start()、出せるかを前もって調べる canPlayCard()（読むだけ）を使う。

import { Game } from './game/Game.js';
import { Renderer } from './ui/Renderer.js';
import { HandView } from './ui/HandView.js';
import { Animations } from './ui/Animations.js';
import { DebugPanel } from './ui/DebugPanel.js';
import { OnlineClient } from './ui/OnlineClient.js';
import { UI_CONFIG } from './ui/config.js';
import { playerName, reasonText } from './ui/text.js';

const EVENT_TYPES = [
  'turnStarted', 'cardDrawn', 'deckShuffled', 'cardPlayed', 'discardRequired', 'cardDiscarded',
  'soldierDeployed', 'soldierMoved', 'soldierDamaged', 'soldierDestroyed', 'spellCast',
  'castleDamaged', 'castleHealed', 'gameOver',
];

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const URL_SEED = params.has('seed') ? Number(params.get('seed')) >>> 0 : null;

const $ = (id) => document.getElementById(id);
const el = {
  app: $('app'),
  message: $('message'),
  endTurn: $('end-turn'),
  toast: $('toast'),
  handover: $('handover'),
  handoverTurn: document.querySelector('#handover .handover-turn'),
  handoverTitle: document.querySelector('#handover .handover-title'),
  result: $('result'),
  resultTitle: document.querySelector('#result .result-title'),
  resultSub: document.querySelector('#result .result-sub'),
  confetti: document.querySelector('#result .confetti'),
  rematch: $('rematch'),
  error: $('error'),
  lobby: $('lobby'),
  lobbyLocal: $('lobby-local'),
  lobbyForm: $('lobby-form'),
  lobbyName: $('lobby-name'),
  lobbyPass: $('lobby-pass'),
  lobbyStatus: $('lobby-status'),
  lobbyJoin: $('lobby-join'),
};

let cards;
let rules;
let monsterDefs = null;
let upgradeDefs = null;
let lastUpgrades = {};
let renderer;
let handView;
let anim;

let game = null;
let seed = 0;
let viewerId = null;       // 画面を見ているプレイヤー（最初の目隠しを開けるまでは null）
let model = null;          // 表示用の状態（演出の進みに合わせて進む）
let queue = [];            // まだ演出していないイベント
let busy = true;           // 演出中・交代画面中は true
let knownCards = new Map(); // cardId → { cardId, type }（viewer の手札の中身）
let online = null;         // オンライン対戦のときの OnlineClient（同じ端末のときは null）
let onlineState = null;    // オンライン：サーバーから届いた最新の getState(自分)
let onlineChain = Promise.resolve(); // オンライン：届いたまとまりを順番に処理する
let rematchSent = false;
const listeners = [];

// ---------- 起動 ----------

async function loadJson(path) {
  // JSON を直してリロードするだけで反映されるよう、キャッシュを使わない
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} を読み込めませんでした（${res.status}）`);
  return res.json();
}

async function boot() {
  try {
    [cards, rules] = await Promise.all([loadJson('data/cards.json'), loadJson('data/rules.json')]);
  } catch (err) {
    console.error(err);
    showError(`起動できませんでした：${err.message}\n` +
      'リポジトリのルートで「python3 -m http.server」（Windows は「python -m http.server」）を実行し、' +
      'http://localhost:8000 を開いてください。');
    return;
  }

  // 魔物と強化の定義は、オンラインの画面に出すためだけに読む（なければ出さない）
  [monsterDefs, upgradeDefs] = await Promise.all([loadJson('data/monsters.json').catch(() => null), loadJson('data/upgrades.json').catch(() => null)]);
  renderer = new Renderer({ cards, rules, onSoldierTap: showSoldierInfo });
  handView = new HandView({ cards, rules, onPlay: playCard, onDiscard: discard, onNotice: toast });
  renderer.monsterNames = Object.fromEntries(Object.entries(monsterDefs ?? {}).map(([k, v]) => [k, v.name]));
  anim = new Animations({ renderer, handView, cards, rules });

  el.endTurn.addEventListener('click', endTurn);
  el.rematch.addEventListener('click', (e) => { e.stopPropagation(); rematch(); });
  el.lobbyLocal.addEventListener('click', () => { el.lobby.hidden = true; newGame(); });
  el.lobbyForm.addEventListener('submit', (e) => { e.preventDefault(); joinOnline(); });
  try {
    el.lobbyName.value = localStorage.getItem('cf-name') ?? '';
    el.lobbyPass.value = localStorage.getItem('cf-pass') ?? '';
  } catch { /* 保存できなくても困らない */ }
  // 演出中に画面をタップしたら飛ばす（交代画面・勝敗画面は除く）
  el.app.addEventListener('pointerdown', (e) => {
    if (busy && el.handover.hidden && el.result.hidden && !e.target.closest('#debug-panel, #debug-toggle')) anim.skip();
  }, true);

  if (DEBUG) {
    new DebugPanel({
      cards,
      getGame: () => game,
      getSeed: () => seed,
      getViewerId: () => viewerId,
      onRestart: (s) => newGame(s),
      onChanged: () => { if (!busy) settle(); },
      onConfigChanged: () => { anim.applyCssTiming(); handView.updateDetail(); },
      notify: toast,
    });
  }

  // デバッグ・シード指定のときは、これまでどおり同じ端末ですぐ始める。そうでなければ入口の画面を出す
  if (DEBUG || URL_SEED !== null || params.get('local') === '1') {
    el.lobby.hidden = true;
    newGame();
  } else {
    setBusy(true);
    el.lobby.hidden = false;
  }
}

// ---------- オンライン ----------

async function joinOnline() {
  const name = el.lobbyName.value.trim();
  const pass = el.lobbyPass.value.trim();
  if (!name || !pass) {
    el.lobbyStatus.textContent = '名前と合言葉を入れてください';
    return;
  }
  try {
    localStorage.setItem('cf-name', name);
    localStorage.setItem('cf-pass', pass);
  } catch { /* 保存できなくても困らない */ }
  el.lobbyJoin.disabled = true;
  el.lobbyStatus.textContent = 'つないでいます…';
  online = new OnlineClient({
    onRoom: (room) => {
      if (!room.started) {
        el.lobbyStatus.textContent = `相手を待っています（${room.players.length}/${room.capacity}）。同じ合言葉を入れてもらってください`;
      }
      const others = room.players.filter((p) => p.playerId !== online.playerId);
      if (room.started && others.some((p) => !p.connected)) toast('相手の接続が切れています', 'info');
      if (room.rematchVotes?.includes(online.playerId) && !el.result.hidden) {
        el.rematch.textContent = '相手を待っています…';
      }
    },
    onBatch: (batch) => { onlineChain = onlineChain.then(() => handleBatch(batch)).catch((err) => console.error(err)); },
    onConnection: (ok) => { if (!ok && !el.lobby.hidden) el.lobbyStatus.textContent = 'つなぎ直しています…'; },
  });
  const res = await online.join(pass, name);
  if (!res.ok) {
    online = null;
    el.lobbyJoin.disabled = false;
    el.lobbyStatus.textContent = res.reason ?? '入れませんでした';
    return;
  }
  viewerId = res.playerId;
  el.lobbyStatus.textContent = '相手を待っています…';
}

/** サーバーから「イベントの列 + 状態」が届いたとき */
async function handleBatch({ events, state, upgrades }) {
  onlineState = state;
  lastUpgrades = upgrades ?? {};
  viewerId = online.playerId;
  for (const c of state.players[viewerId]?.hand ?? []) knownCards.set(c.cardId, { ...c });
  const fresh = !model || events.length === 0 || (model.phase === 'gameOver' && state.phase !== 'gameOver');
  el.lobby.hidden = true;
  if (fresh) {
    // つないだとき・つなぎ直したとき・新しい試合：状態から描き直す
    anim.skip();
    anim.endSkip();
    queue = [];
    el.result.hidden = true;
    el.confetti.innerHTML = '';
    el.rematch.textContent = 'もう1回';
    rematchSent = false;
    knownCards = new Map((state.players[viewerId]?.hand ?? []).map((c) => [c.cardId, { ...c }]));
    renderer.setViewer(viewerId);
    model = modelFromState(state);
    renderer.renderAll(model);
    handView.render(model.hand);
    await settle();
    return;
  }
  queue.push(...events);
  await drainEvents();
  await settle();
}

/** 乱数（シードが同じなら同じ順番になる） */
function mulberry32(a) {
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function newGame(seedOverride) {
  online = null;
  for (const [type, h] of listeners.splice(0)) game?.off(type, h);
  anim.skip();
  anim.endSkip();

  seed = seedOverride ?? URL_SEED ?? Math.floor(Math.random() * 2 ** 32);
  queue = [];
  try {
    game = new Game({ cards: structuredClone(cards), rules: structuredClone(rules), rng: mulberry32(seed) });
  } catch (err) {
    console.error(err);
    showError(`ゲームを始められませんでした：${err.message}`);
    return;
  }
  for (const type of EVENT_TYPES) {
    const h = (payload) => queue.push({ type, payload });
    game.on(type, h);
    listeners.push([type, h]);
  }

  el.result.hidden = true;
  el.confetti.innerHTML = '';
  // 開始前の状態を表示用に覚えてから start() する。p1 の turnStarted で最初の目隠しが出る
  viewerId = null;
  knownCards = new Map();
  model = modelFromState(game.getState(null));
  setBusy(true);
  const res = typeof game.start === 'function' ? game.start() : { ok: true };
  if (!res?.ok) {
    showError(`ゲームを始められませんでした：${reasonText(res?.reason)}`);
    return;
  }
  drainAndSettle();
}

// ---------- 表示用の状態 ----------

function modelFromState(st) {
  const players = {};
  for (const id of ['p1', 'p2']) {
    const p = st.players[id];
    players[id] = {
      castleHp: p.castleHp,
      handCount: p.handCount,
      playedThisTurn: p.playedThisTurn,
      coins: p.coins ?? 0,
      armor: p.armor ?? 0,
      soldiers: p.soldiers.map((s) => ({ ...s })),
    };
  }
  return {
    turn: st.turn,
    currentPlayer: st.currentPlayer,
    phase: st.phase,
    winner: st.winner,
    deckCount: st.deckCount,
    discardCount: st.discardCount,
    monsters: (st.monsters ?? []).map((m) => ({ ...m, castleAttack: monsterDefs?.[m.type]?.castleAttack })),
    discardRequired: model?.discardRequired ?? 0,
    players,
    hand: (st.players[viewerId]?.hand ?? []).map((c) => ({ ...c })),
  };
}

/** viewer の手札の中身を覚えておく（引いたカードの種類を知るため） */
function readState() {
  const st = online ? onlineState : game.getState(viewerId);
  for (const c of st.players[viewerId]?.hand ?? []) knownCards.set(c.cardId, { ...c });
  return st;
}

function lookupCard(cardId) {
  if (!knownCards.has(cardId)) readState();
  return knownCards.get(cardId) ?? null;
}

// ---------- イベントの再生 ----------

function setBusy(value) {
  busy = value;
  el.app.classList.toggle('busy', value);
  handView.setLocked(value);
  if (value) {
    el.endTurn.disabled = true;
    el.endTurn.classList.remove('ready');
    setMessage('');
  }
}

async function drainEvents() {
  setBusy(true);
  while (queue.length) {
    const ev = queue.shift();
    try {
      if (!online && ev.type === 'turnStarted' && ev.payload.playerId !== viewerId) {
        await anim.play(ev, queue, model, { viewerId, lookupCard });
        await handover(ev.payload.playerId, ev.payload.turn);
        continue;
      }
      if (queue.length) setMessage('タップで早送り');
      await anim.play(ev, queue, model, { viewerId, lookupCard });
    } catch (err) {
      console.error(`イベント ${ev.type} の演出に失敗しました`, err);
    }
  }
  anim.endSkip();
}

async function drainAndSettle() {
  await drainEvents();
  await settle();
}

/** 演出が終わったら、本当の状態（getState）で画面を合わせ、次の操作を待つ */
async function settle() {
  const st = readState();
  if (!online && st.phase !== 'gameOver' && st.phase !== 'ready' && st.currentPlayer !== viewerId) {
    // 手番が変わったのに turnStarted が来なかった場合の保険
    await handover(st.currentPlayer, st.turn);
    return settle();
  }
  const discardRequired = model.discardRequired;
  model = modelFromState(st);
  model.discardRequired = discardRequired;
  renderer.renderAll(model);
  const me = st.players[viewerId];
  const sameHand = me.hand.length === handView.hand.length &&
    me.hand.every((c, i) => c.cardId === handView.hand[i].cardId);
  if (!sameHand) handView.render(me.hand);
  handView.setPlayability(playability(st));

  if (st.phase === 'gameOver') {
    showResult(st.winner);
    return;
  }

  setBusy(false);
  renderUpgrades(st);
  if (online && st.currentPlayer !== viewerId) {
    // 相手の番：見るだけ。手札は出せない理由つきで暗くしておく
    handView.exitDiscard();
    el.endTurn.disabled = true;
    el.endTurn.classList.remove('ready');
    setMessage(st.phase === 'discard' ? '相手が手札を捨てています…' : '相手の番です');
    return;
  }
  if (st.phase === 'discard') {
    const count = model.discardRequired || Math.max(1, me.handCount - rules.maxHand);
    handView.enterDiscard(count);
    el.endTurn.disabled = true;
    setMessage('捨てるカードを選んでください');
    return;
  }
  handView.exitDiscard();
  el.endTurn.disabled = false;
  el.endTurn.classList.toggle('ready', me.playedThisTurn);
  setMessage(me.playedThisTurn
    ? 'カードを出しました。「ターン終了」で交代します'
    : 'カードを1枚出せます（出さずに終えてもOK）');
}

/** 手札の各カードが出せないなら、その理由（canPlayCard がなければ「もう出した」だけ見る） */
function playability(st) {
  const blocked = new Map();
  const me = st.players[viewerId];
  if (st.phase !== 'main') return blocked;
  for (const c of me.hand) {
    if (online) {
      const res = online.canPlayCard(c.cardId);
      if (!res.ok) blocked.set(c.cardId, reasonText(res.reason));
    } else if (typeof game.canPlayCard === 'function') {
      const res = game.canPlayCard(c.cardId);
      if (res && !res.ok) blocked.set(c.cardId, reasonText(res.reason));
    } else if (me.playedThisTurn) {
      blocked.set(c.cardId, '');
    }
  }
  return blocked;
}

// ---------- 操作 ----------

async function playCard(cardId) {
  if (busy || !(game || online)) return;
  const res = online ? await online.playCard(cardId) : game.playCard(cardId);
  if (!res?.ok) {
    handView.deny(cardId);
    toast(reasonText(res?.reason));
    return;
  }
  // オンラインでは、結果のイベントが届いたときに演出する（handleBatch）
  if (!online) drainAndSettle();
}

async function endTurn() {
  if (busy || !(game || online)) return;
  const res = online ? await online.endTurn() : game.endTurn();
  if (!res?.ok) {
    toast(reasonText(res?.reason));
    return;
  }
  if (!online) drainAndSettle();
}

/** コインで買える強化のボタン（オンラインのみ。自分の番で、コインがあるときだけ出す） */
function renderUpgrades(st) {
  const bar = $('upgrade-bar');
  const me = st.players[viewerId];
  bar.textContent = '';
  const show = online && upgradeDefs && me?.coins > 0 && st.phase === 'main' && st.currentPlayer === viewerId;
  bar.hidden = !show;
  if (!show) return;
  for (const [id, def] of Object.entries(upgradeDefs)) {
    const info = lastUpgrades[id] ?? { ok: false };
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${def.name} 🪙${def.cost}`;
    b.disabled = !info.ok;
    b.title = info.ok ? '' : reasonText(info.reason);
    b.addEventListener('click', async () => {
      if (busy) return;
      const res = await online.buyUpgrade(id);
      if (!res?.ok) toast(reasonText(res?.reason));
    });
    bar.appendChild(b);
  }
}

async function rematch() {
  if (!online) {
    newGame();
    return;
  }
  if (rematchSent) return;
  const res = await online.rematch();
  if (!res?.ok) {
    toast(reasonText(res?.reason));
    return;
  }
  rematchSent = true;
  el.rematch.textContent = '相手を待っています…';
}

async function discard(cardIds) {
  if (busy || !(game || online)) return;
  const turnBefore = model.turn;
  const res = online ? await online.discard(cardIds) : game.discard(cardIds);
  if (!res?.ok) {
    toast(reasonText(res?.reason));
    return;
  }
  if (online) return; // 続きは、結果のイベントが届いたときに演出する（handleBatch）
  await drainEvents();
  // 捨て終わっても次の人の番にならなかったら、こちらでターンを終える
  const st = readState();
  if (st.phase === 'main' && st.currentPlayer === viewerId && model.turn === turnBefore) {
    const again = game.endTurn();
    if (!again?.ok) toast(reasonText(again?.reason));
    await drainEvents();
  }
  await settle();
}

// ---------- 交代・勝敗 ----------

/** 画面を隠して「プレイヤー2の番です」を出し、タップされたら新しい視点で表示する */
function handover(playerId, turn) {
  anim.endSkip();
  handView.clear();
  setBusy(true);
  el.handover.dataset.player = playerId;
  el.handoverTurn.textContent = `ターン ${turn}`;
  el.handoverTitle.textContent = `${playerName(playerId)}の番です`;
  el.handover.hidden = false;

  return new Promise((resolve) => {
    const open = (e) => {
      if (e.type === 'keydown' && !['Enter', ' '].includes(e.key)) return;
      el.handover.removeEventListener('click', open);
      window.removeEventListener('keydown', open);
      viewerId = playerId;
      renderer.setViewer(viewerId);
      // 手札は「これから引くカード」を除いて出し、引く演出で1枚ずつ加える
      const st = readState();
      const willDraw = new Set(queue
        .filter((ev) => ev.type === 'cardDrawn' && ev.payload.playerId === viewerId)
        .flatMap((ev) => ev.payload.cardIds));
      model.hand = st.players[viewerId].hand.filter((c) => !willDraw.has(c.cardId));
      renderer.renderAll(model);
      handView.render(model.hand);
      handView.setPlayability(new Map());
      el.handover.hidden = true;
      anim.delay(UI_CONFIG.timing.afterTurnStart).then(resolve);
    };
    el.handover.addEventListener('click', open);
    window.addEventListener('keydown', open);
  });
}

async function showResult(winner) {
  setBusy(true);
  await anim.delay(UI_CONFIG.timing.gameOverDelay);
  el.result.dataset.player = winner;
  el.resultTitle.textContent = online
    ? (winner === viewerId ? 'あなたの勝ち！' : '負けました…')
    : `${playerName(winner)}の勝ち！`;
  el.resultSub.textContent = `${model.turn}ターンで決着`;
  const colors = winner === 'p1'
    ? ['#3b82f6', '#93c5fd', '#fbbf24', '#ffffff']
    : ['#ef4444', '#fca5a5', '#fbbf24', '#ffffff'];
  anim.confetti(el.confetti, colors);
  el.result.hidden = false;
  el.rematch.focus({ preventScroll: true });
}

// ---------- 小物 ----------

function setMessage(text) {
  el.message.textContent = text;
}

let toastTimer = 0;
function toast(text, kind = 'error') {
  el.toast.textContent = text;
  el.toast.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.className = kind; }, UI_CONFIG.timing.toast);
}

function showSoldierInfo(s) {
  const owner = s.playerId === viewerId ? 'あなた' : playerName(s.playerId);
  toast(`${s.name}（${owner}）HP${s.hp}・攻撃${s.attack}・位置${s.position}/${rules.laneLength}`, 'info');
}

function showError(text) {
  el.error.textContent = text;
  el.error.hidden = false;
}

boot();
