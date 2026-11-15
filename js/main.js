// 起動と、Game と画面のつなぎ役。
// - data/ の JSON を読む（monsters.json・upgrades.json は、なければ省略：魔物が出ず、強化も買えない）
// - 同じ端末：new Game(...) を作り、LocalSession で包む。オンライン：OnlineClient（サーバーの Game を操作する）
// - Game のイベントをキューにため、届いた順に Animations で演出する
// - 演出中は操作を受け付けない（画面タップで演出を飛ばせる）
// UI はゲームの状態を直接書き換えない。セッション（js/ui/Session.js）のメソッドだけを使う。

import { Game, EVENT_TYPES } from './game/Game.js';
import { Renderer } from './ui/Renderer.js';
import { HandView } from './ui/HandView.js';
import { Animations } from './ui/Animations.js';
import { DebugPanel } from './ui/DebugPanel.js';
import { UpgradePanel } from './ui/UpgradePanel.js';
import { Targeting } from './ui/Targeting.js';
import { LocalSession } from './ui/Session.js';
import { OnlineClient } from './ui/OnlineClient.js';
import { checkSync } from './ui/syncCheck.js';
import { UI_CONFIG } from './ui/config.js';
import { sound } from './ui/Sound.js';
import { castleArt, unitArt, icon, colorOf } from './ui/art.js';
import { playerName, setPlayerNames, reasonText, soldierInfo, monsterInfo, GAME_OVER_TEXT, GAME_OVER_TEXT_LOST } from './ui/text.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const URL_SEED = params.has('seed') ? Number(params.get('seed')) >>> 0 : null;

const $ = (id) => document.getElementById(id);
const el = {
  app: $('app'),
  message: $('message'),
  endTurn: $('end-turn'),
  toast: $('toast'),
  netStatus: $('net-status'),
  handover: $('handover'),
  handoverTurn: document.querySelector('#handover .handover-turn'),
  handoverTitle: document.querySelector('#handover .handover-title'),
  handoverPic: document.querySelector('#handover .handover-pic'),
  result: $('result'),
  resultTitle: document.querySelector('#result .result-title'),
  resultSub: document.querySelector('#result .result-sub'),
  resultPic: document.querySelector('#result .result-pic'),
  confetti: document.querySelector('#result .confetti'),
  rematch: $('rematch'),
  resultTitleBtn: $('result-title-btn'),
  error: $('error'),
  upgradeOpen: $('upgrade-open'),
  menu: $('menu'),
  menuOpen: $('menu-open'),
  menuSound: $('menu-sound'),
  help: $('help'),
  title: $('title'),
  titleMain: $('title-main'),
  titleForm: $('title-form'),
  titleName: $('title-name'),
  titlePass: $('title-pass'),
  titleStatus: $('title-status'),
  titleJoin: $('title-join'),
};

let cards;
let rules;
let monsters = null;  // data/monsters.json（読めなければ null：魔物は出ない）
let upgrades = null;  // data/upgrades.json（読めなければ null：強化は買えない）
let renderer;
let handView;
let anim;
let upgradePanel = null;
let targeting = null;      // 対象を選ぶ（js/ui/Targeting.js）

let game = null;           // 同じ端末のときの Game（オンラインでは null）
let session = null;        // ゲームを操作する窓口（LocalSession か OnlineClient）
let seed = 0;
let viewerId = null;       // 画面を見ているプレイヤー（最初の目隠しを開けるまでは null）
let model = null;          // 表示用の状態（演出の進みに合わせて進む）
let queue = [];            // まだ演出していないイベント
let busy = true;           // 演出中・交代画面中は true
let sending = false;       // オンライン：操作を送って、返事を待っているあいだ true
let knownCards = new Map(); // cardId → { cardId, type }（viewer の手札の中身）
let lastCastleHit = null;  // 最後に城を削ったもの（"monster" なら魔物の攻撃）。決着の文に使う
let upgradeCounts = {};    // playerId → { upgradeId: 買った回数 }（getState にないので、イベントから数える）
const listeners = [];

// オンライン
let room = null;           // サーバーから届いた部屋の状態
let batches = [];          // 届いた「イベントの列 + 状態」。順番に見せる
let pumping = false;
let rematchSent = false;
let connected = true;
let gen = 0;                // 試合の通し番号。前の試合の演出が、新しい試合のイベントを食べないようにする
let cancelHandover = null;  // 交代の画面を出しているあいだ、その待ちをやめる関数

// ---------- 起動 ----------

async function loadJson(path) {
  // JSON を直してリロードするだけで反映されるよう、キャッシュを使わない
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} を読み込めませんでした（${res.status}）`);
  return res.json();
}

/** なくてもよい JSON。ファイルがない（404）ときだけ null。壊れているときは cards.json と同じく止める */
async function loadOptionalJson(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (res.status === 404) {
    console.warn(`${path} がないので、なしで始めます`);
    return null;
  }
  if (!res.ok) throw new Error(`${path} を読み込めませんでした（${res.status}）`);
  try {
    return await res.json();
  } catch (err) {
    throw new Error(`${path} の書き方がまちがっています（${err.message}）`);
  }
}

async function boot() {
  try {
    [cards, rules, monsters, upgrades] = await Promise.all([
      loadJson('data/cards.json'), loadJson('data/rules.json'),
      loadOptionalJson('data/monsters.json'), loadOptionalJson('data/upgrades.json'),
    ]);
  } catch (err) {
    console.error(err);
    showError(`起動できませんでした：${err.message}\n` +
      'リポジトリのルートで「python3 -m http.server」（Windows は「python -m http.server」）を実行し、' +
      'http://localhost:8000 を開いてください。');
    return;
  }

  // デバッグ：URL の rules={"monsterFirstRound":1,...} で、ルールの一部だけ変えて試せる（data/ は書き換えない）
  if (DEBUG && params.has('rules')) {
    try {
      const override = JSON.parse(params.get('rules'));
      // rules.json にあるキーだけ取りこむ（__proto__ などで rules のしくみを変えないように）
      for (const k of Object.keys(override ?? {})) {
        if (Object.hasOwn(rules, k)) rules[k] = override[k];
        else console.warn(`URL の rules：rules.json にないキー "${k}" は使いません`);
      }
    } catch (err) {
      console.error('URL の rules を読めませんでした', err);
    }
  }

  renderer = new Renderer({
    cards, rules, monsters,
    showCoins: Boolean(monsters || upgrades), // コインは魔物か強化があるときだけ出す（自分も相手も同じ）
    onSoldierTap: (s) => toast(soldierInfo(s, { cards, rules, viewerId }), 'info'),
    onMonsterTap: (m) => toast(monsterInfo(m, { monsters }), 'info'),
    onTargetTap: (target) => { if (!busy) targeting.tap(target); },
  });
  handView = new HandView({
    cards, rules, textOpts: { monsters: Boolean(monsters) },
    onPlay: playCard, onDiscard: discard, onNotice: toast,
  });
  anim = new Animations({ renderer, handView, cards, rules, monsters, upgrades });
  targeting = new Targeting({ renderer, handView, onChoose: (cardId, target) => doPlay(cardId, target) });
  if (upgrades && Object.keys(upgrades).length) {
    upgradePanel = new UpgradePanel({ upgrades, onBuy: buyUpgrade, onOpen: refreshUpgrades, onDenied: (r) => toast(r, 'info') });
  } else {
    // 強化のデータがないときも、コインのボタンを押したら理由を出す
    el.upgradeOpen.addEventListener('click', (e) => {
      e.stopPropagation();
      toast('強化のデータ（data/upgrades.json）がないので、強化は買えません', 'info');
    });
  }
  $('help-monster').hidden = !monsters;

  el.endTurn.addEventListener('click', endTurn);
  el.rematch.addEventListener('click', (e) => { e.stopPropagation(); rematch(); });
  el.resultTitleBtn.addEventListener('click', (e) => { e.stopPropagation(); showTitle(); });
  // 最初のタップで音を出せるようにする。演出中に画面をタップしたら飛ばす（重ねて出す画面の上は除く）
  el.app.addEventListener('pointerdown', (e) => {
    sound.unlock();
    if (busy && !e.target.closest('.screen, #debug-panel, #debug-toggle, #menu-open')) anim.skip();
  }, true);

  setupMenu();
  setupTitle();

  if (DEBUG) {
    new DebugPanel({
      cards,
      getGame: () => game,
      getSeed: () => seed,
      getViewerId: () => viewerId,
      onRestart: (s) => startLocal(s),
      onChanged: () => {
        cancelTargeting();
        if (!busy) settleSafely();
      },
      onConfigChanged: () => { anim.applyCssTiming(); handView.updateDetail(); },
      notify: toast,
    });
    // コンソールから Game を触れるようにする（デバッグのときだけ）
    window.castlefield = { game: () => game, seed: () => seed, renderer: () => renderer };
  }

  // デバッグ・シード指定のときは、同じ端末ですぐ始める。そうでなければタイトルを出す
  if (DEBUG || URL_SEED !== null || params.get('local') === '1') startLocal();
  else showTitle();
}

// ---------- タイトル・メニュー ----------

function setupTitle() {
  document.querySelector('#title .title-pic').innerHTML =
    `<div class="title-castle left">${castleArt('blue')}</div><div class="title-unit left">${unitArt('knight', 'blue')}</div>` +
    `<div class="title-unit right">${unitArt('infantry', 'orange')}</div><div class="title-castle right">${castleArt('orange')}</div>`;
  $('title-local').addEventListener('click', () => { sound.play('tap'); startLocal(); });
  $('title-online').addEventListener('click', () => {
    sound.play('tap');
    el.titleMain.hidden = true;
    el.titleForm.hidden = false;
    setTitleWaiting(false);
    el.titleStatus.textContent = '同じ合言葉を入れた人と対戦します';
    (el.titleName.value ? el.titlePass : el.titleName).focus({ preventScroll: true });
  });
  $('title-help').addEventListener('click', () => openHelp());
  $('title-back').addEventListener('click', () => {
    leaveOnline();
    el.titleForm.hidden = true;
    el.titleMain.hidden = false;
  });
  el.titleForm.addEventListener('submit', (e) => { e.preventDefault(); joinOnline(); });
  try {
    el.titleName.value = localStorage.getItem('cf-name') ?? '';
    el.titlePass.value = localStorage.getItem('cf-pass') ?? '';
  } catch { /* 覚えられなくても困らない */ }
}

/** タイトルへ戻る（遊んでいた試合はやめる） */
function showTitle() {
  gen += 1;
  cancelHandover?.();
  leaveOnline();
  stopLocal();
  anim.skip();
  anim.endSkip();
  queue = [];
  cancelTargeting();
  upgradePanel?.close();
  el.result.hidden = true;
  el.handover.hidden = true;
  el.menu.hidden = true;
  el.confetti.innerHTML = '';
  setBusy(true);
  el.titleForm.hidden = true;
  el.titleMain.hidden = false;
  el.title.hidden = false;
}

function setTitleWaiting(waiting) {
  el.titleName.disabled = el.titlePass.disabled = waiting;
  el.titleJoin.hidden = waiting;
  el.titleForm.classList.toggle('waiting', waiting);
}

function setupMenu() {
  const drawSound = () => {
    el.menuSound.innerHTML = `${icon(sound.muted ? 'mute' : 'sound')}<span>${sound.muted ? '音：なし' : '音：あり'}</span>`;
  };
  drawSound();
  el.menuOpen.addEventListener('click', (e) => { e.stopPropagation(); el.menu.hidden = false; });
  $('menu-close').addEventListener('click', () => { el.menu.hidden = true; });
  el.menu.addEventListener('click', (e) => { if (e.target === el.menu) el.menu.hidden = true; });
  el.menuSound.addEventListener('click', () => {
    sound.setMuted(!sound.muted);
    drawSound();
    sound.play('tap');
  });
  $('menu-help').addEventListener('click', () => { el.menu.hidden = true; openHelp(); });
  $('menu-title-btn').addEventListener('click', () => showTitle());
  $('help-close').addEventListener('click', () => { el.help.hidden = true; });
  el.help.addEventListener('click', (e) => { if (e.target === el.help) el.help.hidden = true; });
}

function openHelp() {
  sound.play('tap');
  el.help.hidden = false;
}

// ---------- 同じ端末 ----------

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

function stopLocal() {
  for (const [type, h] of listeners.splice(0)) game?.off(type, h);
  game = null;
  if (session && !session.online) session = null;
}

/** 新しい試合の前に、画面の持ちものを空にする */
function resetForNewGame() {
  gen += 1;
  cancelHandover?.();
  anim.skip();
  anim.endSkip();
  queue = [];
  cancelTargeting();
  upgradePanel?.close();
  upgradeCounts = {};
  lastCastleHit = null;
  el.result.hidden = true;
  el.confetti.innerHTML = '';
  el.rematch.textContent = 'もう1回';
  el.rematch.disabled = false;
  rematchSent = false;
  knownCards = new Map();
  model = null; // 前の試合の値（捨てる枚数・決着の理由）を持ちこさない
}

function startLocal(seedOverride) {
  leaveOnline();
  stopLocal();
  setPlayerNames({});
  resetForNewGame();
  el.title.hidden = true;

  seed = seedOverride ?? URL_SEED ?? Math.floor(Math.random() * 2 ** 32);
  try {
    const opts = { cards: structuredClone(cards), rules: structuredClone(rules), rng: mulberry32(seed) };
    if (monsters) opts.monsters = structuredClone(monsters);
    if (upgrades) opts.upgrades = structuredClone(upgrades);
    game = new Game(opts);
  } catch (err) {
    console.error(err);
    showError(`ゲームを始められませんでした：${err.message}`);
    return;
  }
  session = new LocalSession(game);
  // Game が出すイベントは全部受け取る（演出がないものは Animations が何もしない）
  for (const type of EVENT_TYPES) {
    const h = (payload) => enqueue({ type, payload });
    game.on(type, h);
    listeners.push([type, h]);
  }

  // 開始前の状態を表示用に覚えてから start() する。p1 の turnStarted で最初の目隠しが出る
  viewerId = null;
  model = modelFromState(game.getState(null));
  setBusy(true);
  const res = game.start();
  if (!res?.ok) {
    showError(`ゲームを始められませんでした：${reasonText(res?.reason)}`);
    return;
  }
  drainAndSettle();
}

/** イベントをキューに入れる。getState にない値（買った回数・最後に城を削ったもの）はここで覚える */
function enqueue(ev) {
  const p = ev.payload ?? {};
  if (ev.type === 'castleDamaged') lastCastleHit = 'castle';
  if (ev.type === 'monsterAttackedCastle') lastCastleHit = 'monster';
  if (ev.type === 'upgradeBought') {
    const counts = (upgradeCounts[p.playerId] ??= {});
    counts[p.upgradeId] = (counts[p.upgradeId] ?? 0) + 1;
  }
  queue.push(ev);
}

// ---------- オンライン ----------

async function joinOnline() {
  if (session?.online) return;
  const name = el.titleName.value.trim();
  const pass = el.titlePass.value.trim();
  if (!name || !pass) {
    el.titleStatus.textContent = '名前と合言葉を入れてください';
    sound.play('deny');
    return;
  }
  try {
    localStorage.setItem('cf-name', name);
    localStorage.setItem('cf-pass', pass);
  } catch { /* 覚えられなくても困らない */ }
  stopLocal();
  el.titleJoin.disabled = true;
  el.titleStatus.textContent = 'つないでいます…';
  const client = new OnlineClient({
    onRoom: (r) => { if (session === client) onRoom(r); },
    onBatch: (batch) => {
      if (session !== client) return;
      batches.push(batch);
      pump();
    },
    onConnection: (ok, info) => { if (session === client) onConnection(ok, info); },
  });
  session = client;
  batches = [];
  room = null;
  connected = true;
  const res = await client.join(pass, name);
  el.titleJoin.disabled = false;
  if (session !== client) return; // 待っているあいだに「もどる」を押した
  if (!res.ok) {
    client.close();
    session = null;
    el.titleStatus.textContent = res.reason ?? '入れませんでした';
    sound.play('deny');
    return;
  }
  viewerId = res.playerId;
  setTitleWaiting(true);
  if (!room?.started) el.titleStatus.textContent = '相手を待っています… 同じ合言葉を入れてもらってください';
}

function leaveOnline() {
  if (session?.online) {
    session.close();
    session = null;
  }
  batches = [];
  room = null;
  sending = false;
  setPlayerNames({});
  el.netStatus.hidden = true;
  setTitleWaiting(false);
}

function onRoom(r) {
  room = r;
  setPlayerNames(Object.fromEntries(r.players.map((p) => [p.playerId, p.name])));
  if (!r.started) {
    el.titleStatus.textContent = `相手を待っています…（${r.players.length}/${r.capacity}人）同じ合言葉を入れてもらってください`;
  }
  updateNetStatus();
  // もう1回：自分が押したら相手を待つ。相手が先に押していたら知らせる
  const votes = r.rematchVotes ?? [];
  if (!el.result.hidden) {
    if (votes.includes(viewerId)) {
      el.rematch.textContent = '相手を待っています…';
      el.rematch.disabled = true;
    } else if (votes.length) {
      el.rematch.textContent = 'もう1回（相手は準備OK）';
    }
  }
}

function onConnection(ok, { fatal }) {
  connected = ok;
  if (fatal) {
    // サーバーが部屋を忘れた（再起動など）。つなぎ直せないので、タイトルへ戻る
    showTitle();
    toast('サーバーとの接続が切れました。もう一度、合言葉から入ってください');
    return;
  }
  updateNetStatus();
}

function updateNetStatus() {
  let text = '';
  if (session?.online) {
    const away = (room?.players ?? []).filter((p) => p.playerId !== viewerId && !p.connected);
    if (!connected) text = 'サーバーにつなぎ直しています…';
    else if (room?.started && away.length) text = `${away.map((p) => p.name).join('・')}さんの接続が切れています。戻るのを待っています…`;
  }
  el.netStatus.textContent = text;
  el.netStatus.hidden = !text;
}

/** 届いたまとまりを、順番に見せる */
async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (batches.length && session?.online) {
      const batch = batches.shift();
      if (batches.length > 1) anim.skip(); // たまっているとき（画面を閉じていた など）は早送りで追いつく
      await showBatch(batch);
    }
  } catch (err) {
    recover(err);
  } finally {
    pumping = false;
  }
}

async function showBatch(batch) {
  const client = session;
  const st = batch.state;
  client.commit(batch);
  sending = false;
  for (const c of st.players[viewerId]?.hand ?? []) knownCards.set(c.cardId, { ...c });

  const newGame = !model || !el.title.hidden || st.turn < model.turn ||
    (model.phase === 'gameOver' && st.phase !== 'gameOver');
  if (newGame) {
    // 試合の始まり（入ったとき・もう1回）：状態から描く
    resetForNewGame();
    for (const c of st.players[viewerId]?.hand ?? []) knownCards.set(c.cardId, { ...c });
    el.title.hidden = true;
    renderer.setViewer(viewerId);
    handView.setColor(colorOf(viewerId));
    model = modelFromState(st);
    renderer.renderAll(model);
    renderer.setCurrentPlayer(st.currentPlayer);
    handView.render(model.hand);
    setBusy(true);
    if (st.turn <= 1 && st.phase !== 'gameOver') {
      sound.play('turn');
      anim.banner(st.currentPlayer === viewerId ? '対戦開始！ あなたが先攻' : '対戦開始！ 相手が先攻', 1100);
      await anim.delay(900);
    }
  } else {
    for (const ev of batch.events) enqueue(ev);
    if (!(await drainEvents())) return;
  }
  if (session !== client) return;
  await settle({ check: false });
}

// ---------- 表示用の状態 ----------

function modelFromState(st) {
  const players = {};
  for (const id of st.playerOrder) {
    const p = st.players[id];
    players[id] = {
      castleHp: p.castleHp,
      castleMaxHp: p.castleMaxHp,
      armor: p.armor ?? 0,
      coins: p.coins ?? 0,
      handCount: p.handCount,
      playedThisTurn: p.playedThisTurn,
      cardsPlayedThisTurn: p.cardsPlayedThisTurn ?? 0,
      soldiers: p.soldiers.map((s) => structuredClone(s)),
    };
  }
  return {
    playerOrder: [...st.playerOrder],
    turn: st.turn,
    round: st.round ?? 0,
    currentPlayer: st.currentPlayer,
    phase: st.phase,
    winner: st.winner,
    gameOverReason: model?.gameOverReason ?? null,
    deckCount: st.deckCount,
    discardCount: st.discardCount,
    discardRequired: model?.discardRequired ?? 0,
    monsters: (st.monsters ?? []).map((m) => ({ ...m })),
    players,
    hand: (st.players[viewerId]?.hand ?? []).map((c) => ({ ...c })),
  };
}

/** viewer の手札の中身を覚えておく（引いたカードの種類を知るため） */
function readState() {
  const st = session.getState(viewerId);
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
    cancelTargeting();
    upgradePanel?.setEnabled(false, { reason: upgradeOffReason(session?.getState(viewerId)) });
    el.endTurn.disabled = true;
    el.endTurn.classList.remove('ready', 'off');
    setMessage('');
  }
}

async function drainEvents() {
  const g = gen;
  setBusy(true);
  while (queue.length && g === gen) {
    const ev = queue.shift();
    try {
      if (ev.type === 'turnStarted' && !session.online && ev.payload.playerId !== viewerId) {
        await anim.play(ev, queue, model, { viewerId, lookupCard });
        await handover(ev.payload.playerId, ev.payload.turn);
        continue;
      }
      if (queue.length) setMessage('タップで早送り');
      await anim.play(ev, queue, model, { viewerId, lookupCard });
      if (ev.type === 'turnStarted' && session.online) {
        // オンラインは交代の画面がないので、だれの番かを帯で知らせる
        const mine = ev.payload.playerId === viewerId;
        if (mine) sound.play('turn');
        anim.banner(mine ? 'あなたの番！' : `${playerName(ev.payload.playerId)}の番`, 700, mine ? 'turn mine' : 'turn');
        await anim.delay(mine ? 420 : 260);
      }
    } catch (err) {
      console.error(`イベント ${ev.type} の演出に失敗しました`, err);
    }
  }
  if (g !== gen) return false; // 途中で別の試合が始まった
  anim.endSkip();
  return true;
}

async function drainAndSettle() {
  try {
    if (await drainEvents()) await settle();
  } catch (err) {
    recover(err);
  }
}

/** デバッグパネルで状態を変えたあと（演出なしで変わるので、ずれの確認はしない） */
function settleSafely() {
  settle({ check: false }).catch(recover);
}

/** 演出や画面合わせで例外が出たとき：知らせて、操作できる状態に戻す（何を押しても反応しない、を作らない） */
function recover(err) {
  console.error('画面の更新に失敗しました', err);
  anim.endSkip();
  toast(`画面の更新でエラーが起きました：${err?.message ?? err}`);
  setBusy(false);
  el.endTurn.disabled = false;
}

/** 演出が終わったら、本当の状態（getState）で画面を合わせ、次の操作を待つ */
async function settle({ check = true } = {}) {
  if (!session) return;
  const online = session.online;
  const st = readState();
  if (!online && st.phase !== 'gameOver' && st.phase !== 'ready' && st.currentPlayer !== viewerId) {
    // 手番が変わったのに turnStarted が来なかった場合の保険
    await handover(st.currentPlayer, st.turn);
    return settle({ check });
  }
  // デバッグ：演出で進めた値と本当の状態がずれていないか（ずれていたら console.warn('[sync]', ...)）
  if (DEBUG && check && st.phase !== 'gameOver') checkSync(model, st);
  if (model.gameOverReason === 'castleDestroyed' && lastCastleHit === 'monster') model.gameOverReason = 'monsterDestroyed';
  model = modelFromState(st);
  renderer.renderAll(model);
  renderer.setCurrentPlayer(st.phase === 'gameOver' ? null : st.currentPlayer);
  const me = st.players[viewerId];
  const sameHand = me.hand.length === handView.hand.length &&
    me.hand.every((c, i) => c.cardId === handView.hand[i].cardId);
  if (!sameHand) handView.render(me.hand);
  const blocked = playability(st);
  handView.setPlayability(blocked);

  if (st.phase === 'gameOver') {
    showResult(st.winner);
    return;
  }

  setBusy(false);
  refreshUpgrades();
  const myTurn = st.currentPlayer === viewerId;
  if (!myTurn) {
    // オンラインの相手の番：見るだけ。手札は説明だけ読める
    handView.exitDiscard();
    el.endTurn.disabled = false;
    el.endTurn.classList.add('off');
    setMessage(st.phase === 'discard' ? `${playerName(st.currentPlayer)}が手札を捨てています…` : `${playerName(st.currentPlayer)}の番です…`);
    return;
  }
  el.endTurn.classList.remove('off');
  if (st.phase === 'discard') {
    const maxHand = me.maxHand ?? rules.maxHand;
    const count = model.discardRequired || Math.max(1, me.handCount - maxHand);
    handView.enterDiscard(count, maxHand);
    el.endTurn.disabled = true;
    setMessage('捨てるカードを選んでください');
    return;
  }
  handView.exitDiscard();
  el.endTurn.disabled = false;
  const anyPlayable = me.hand.some((c) => !blocked.has(c.cardId));
  el.endTurn.classList.toggle('ready', !anyPlayable);
  if (!me.playedThisTurn && anyPlayable) setMessage('カードを選んで出そう（メインは1枚。武器・防御は何枚でも）');
  else if (!me.playedThisTurn) setMessage('出せるカードがありません。「ターン終了」を押そう');
  else if (anyPlayable) setMessage('武器・防御はまだ出せます。終わったら「ターン終了」');
  else setMessage('「ターン終了」で交代します');
}

/** 手札の各カードが出せないなら、その理由（canPlayCard の結果。付加・防御はメインのあとも出せる） */
function playability(st) {
  const blocked = new Map();
  const me = st.players[viewerId];
  if (st.phase !== 'main') return blocked;
  for (const c of me.hand) {
    const res = session.canPlayCard(c.cardId);
    if (res && !res.ok) blocked.set(c.cardId, reasonText(res.reason));
  }
  return blocked;
}

// ---------- 操作 ----------

/**
 * 操作を送る。同じ端末ならすぐ結果のイベントを演出する。
 * オンラインなら、結果のイベントが届いたときに演出する（showBatch）。返事を待つあいだは二度押しできない。
 * @param {() => Promise<{ok: boolean, reason?: string}>} send
 * @returns {Promise<object|null>} 送れなかったら null
 */
async function act(send) {
  if (busy || sending || !session) return null;
  const s = session;
  if (s.online) {
    sending = true;
    el.app.classList.add('sending');
  }
  let res;
  try {
    res = await send();
  } catch (err) {
    console.error(err);
    res = { ok: false, reason: '操作に失敗しました' };
  }
  el.app.classList.remove('sending');
  if (s !== session) return null;
  if (s.online) {
    if (!res?.ok) sending = false; // 成功したときは、結果のまとまりが届いたら false に戻る（showBatch）
  } else if (res?.ok) {
    drainAndSettle();
  }
  return res;
}

function playCard(cardId) {
  if (busy || sending || !session) return;
  targeting.cancel();
  upgradePanel?.close();
  const check = session.canPlayCard(cardId);
  if (check?.ok && check.needsTarget) {
    startTargeting(cardId);
    return;
  }
  doPlay(cardId);
}

/** カードを出す（target を省略すると、対象が1つのときだけ出せる） */
async function doPlay(cardId, target) {
  const res = await act(() => session.playCard(cardId, target));
  if (!res) return;
  if (!res.ok) {
    if (res.needsTarget) {
      startTargeting(cardId);
      return;
    }
    targeting.cancel();
    handView.deny(cardId);
    toast(reasonText(res.reason));
    return;
  }
  targeting.cancel();
}

/** 対象が2つ以上あるカード：盤面の対象を光らせて選んでもらう */
function startTargeting(cardId) {
  const targets = session.getTargets(cardId);
  if (targets.length === 0) {
    targeting.cancel();
    handView.deny(cardId);
    toast(reasonText(session.canPlayCard(cardId)?.reason)); // 出せない理由を Game から出してもらう
    return;
  }
  const type = knownCards.get(cardId)?.type;
  targeting.start(cardId, targets, cards[type]?.name ?? 'カード');
}

function cancelTargeting() {
  targeting?.cancel();
}

// ---------- 強化 ----------

/** 強化のボタンとパネルを、今の状態に合わせる */
function refreshUpgrades() {
  if (!upgradePanel || !session) return;
  const st = session.getState(viewerId);
  if (!st) return;
  const me = st.players[viewerId];
  const myTurn = !busy && st.phase === 'main' && st.currentPlayer === viewerId;
  const why = upgradeOffReason(st);
  const status = {};
  for (const id of Object.keys(upgrades)) status[id] = myTurn ? session.canBuyUpgrade(id) : { ok: false, reason: why };
  const anyOk = Object.values(status).some((x) => x.ok);
  upgradePanel.setEnabled(myTurn, { highlight: anyOk, reason: why });
  // オンラインでは、つなぎ直すと買った回数が分からないので、残りの回数は出さない
  if (me) upgradePanel.refresh(me.coins ?? 0, status, session.online ? null : (upgradeCounts[viewerId] ?? {}));
}

/** 強化を買えない場面の理由 */
function upgradeOffReason(st) {
  if (st?.phase === 'gameOver') return 'ゲームは終わっています';
  if (st && viewerId && st.currentPlayer !== viewerId) return '強化は自分の番に買えます';
  if (st?.phase === 'discard') return '先に手札を捨ててください';
  if (busy) return '演出が終わってから買えます';
  return '強化は自分の番のメインで買えます';
}

async function buyUpgrade(upgradeId) {
  cancelTargeting();
  const res = await act(() => session.buyUpgrade(upgradeId));
  if (!res) return;
  if (!res.ok) {
    sound.play('deny');
    toast(reasonText(res.reason));
    return;
  }
  upgradePanel.close();
}

async function endTurn() {
  if (busy || sending || !session) return;
  if (el.endTurn.classList.contains('off')) {
    toast('いまは相手の番です', 'info');
    return;
  }
  cancelTargeting();
  upgradePanel?.close();
  sound.play('tap');
  const res = await act(() => session.endTurn());
  if (res && !res.ok) toast(reasonText(res.reason));
}

async function discard(cardIds) {
  const res = await act(() => session.discard(cardIds));
  if (res && !res.ok) toast(reasonText(res.reason));
}

async function rematch() {
  sound.play('tap');
  if (!session?.online) {
    startLocal();
    return;
  }
  if (rematchSent) return;
  rematchSent = true;
  el.rematch.textContent = '相手を待っています…';
  el.rematch.disabled = true;
  const res = await session.rematch();
  if (!res?.ok) {
    rematchSent = false;
    el.rematch.textContent = 'もう1回';
    el.rematch.disabled = false;
    toast(reasonText(res?.reason));
  }
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
  el.handoverPic.innerHTML = castleArt(colorOf(playerId));
  el.handover.hidden = false;

  return new Promise((resolve) => {
    const stop = () => {
      el.handover.removeEventListener('click', open);
      window.removeEventListener('keydown', open);
      cancelHandover = null;
    };
    cancelHandover = stop; // タイトルへ戻る・最初からやり直すときは、待ちをやめる（resolve しない）
    const open = (e) => {
      if (e.type === 'keydown' && !['Enter', ' '].includes(e.key)) return;
      stop();
      sound.play('turn');
      viewerId = playerId;
      renderer.setViewer(viewerId);
      handView.setColor(colorOf(viewerId));
      // 手札は「これから引くカード」を除いて出し、引く演出で1枚ずつ加える
      const st = readState();
      const willDraw = new Set(queue
        .filter((ev) => ev.type === 'cardDrawn' && ev.payload.playerId === viewerId)
        .flatMap((ev) => ev.payload.cardIds));
      model.hand = st.players[viewerId].hand.filter((c) => !willDraw.has(c.cardId));
      renderer.renderAll(model);
      renderer.setCurrentPlayer(playerId);
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
  const s = session;
  await anim.delay(UI_CONFIG.timing.gameOverDelay);
  if (s !== session) return; // 待っているあいだにタイトルへ戻った
  const online = Boolean(session?.online);
  const won = !online || winner === viewerId;
  el.result.dataset.player = winner;
  el.result.classList.toggle('lost', !won);
  el.resultTitle.textContent = online ? (won ? 'あなたの勝ち！' : '負けてしまった…') : `${playerName(winner)}の勝ち！`;
  const how = (won ? GAME_OVER_TEXT : GAME_OVER_TEXT_LOST)[model.gameOverReason] ?? '';
  el.resultSub.textContent = `${how ? `${how}　` : ''}${model.turn}ターンで決着`;
  el.resultPic.innerHTML = castleArt(colorOf(winner)) + unitArt('knight', colorOf(winner));
  const colors = winner === 'p1'
    ? ['#4da3e8', '#bfe3fb', '#ffd93b', '#ffffff']
    : ['#f5923e', '#ffd9b0', '#ffd93b', '#ffffff'];
  if (won) anim.confetti(el.confetti, colors);
  else el.confetti.innerHTML = '';
  el.result.hidden = false;
  sound.enabled = true;
  sound.play(won ? 'win' : 'lose');
  if (!rematchSent) {
    el.rematch.disabled = false;
    const votes = room?.rematchVotes ?? [];
    el.rematch.textContent = online && votes.length ? 'もう1回（相手は準備OK）' : 'もう1回';
  }
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

function showError(text) {
  el.error.textContent = text;
  el.error.hidden = false;
}

boot();
