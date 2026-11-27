// オンライン対戦（server/rooms.js）のスキル操作：任意スキル・見積もり・設定・発動ログ（最小限のスモーク）。
//   (a) 席の本人が自分の番に skillAction を使える
//   (b) 相手の番・ほかの席・CPU の席は拒否
//   (c) 不正な引数・大きすぎる入力は拒否（サーバーは落ちない・プロトタイプを汚さない）
//   (d) 相手に非公開の状態・相手の発動ログが届かない
//   (e) つなぎ直すと、回数・資源・発動ログが戻る
//   (f) スキルのない試合・ほかのモードは今までどおり
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Lobby } from '../server/rooms.js';
import { loadData, loadModeData } from '../server/server.js';
import { seededRng } from './helpers.js';

const BUILD = ['P01', 'P03', 'V01', 'V03', 'V05', 'V07'];
/** getState が本人にだけ出す skillState のキー（js/game/skills/Runtime.js の stateFor） */
const PRIVATE_KEYS = ['uses', 'scheduled', 'grave', 'peek', 'prefs', 'counters', 'actions', 'critStack', 'luckStack'];

/** 2人（人）のクラシックの部屋を作り、両方つないでマリガンまで終える */
function classicRoom(builds = [BUILD, BUILD], mode = 'classic') {
  let seed = 5;
  const lobby = new Lobby(loadData(), () => seededRng(seed++), { cpuDelayMs: 0, modeData: loadModeData() });
  const a = lobby.join(`osk-${mode}`, 'A', null, mode === 'kingdom' ? null : mode);
  const b = lobby.join(`osk-${mode}`, 'B', null, mode === 'kingdom' ? null : mode);
  const { room } = lobby.findSeat(a.token);
  const seats = [lobby.findSeat(a.token).seat, lobby.findSeat(b.token).seat];
  if (builds) seats.forEach((s, i) => assert.equal(room.setSeat(s, { skills: builds[i] }).ok, true));
  const inbox = new Map();
  const disconnect = new Map();
  for (const s of seats) {
    inbox.set(s, []);
    disconnect.set(s, room.connect(s, (msg) => inbox.get(s).push(JSON.parse(JSON.stringify(msg)))));
  }
  room.startGame();
  for (const s of seats) assert.equal(room.action(s, 'mulligan', [[]]).ok, true);
  const cur = seats.find((s) => s.playerId === room.game.currentPlayer);
  const other = seats.find((s) => s !== cur);
  return { lobby, room, cur, other, inbox, disconnect };
}
const lastState = (msgs) => msgs.filter((m) => m.type === 'state').at(-1);
const logsOf = (msgs) => msgs.filter((m) => m.type === 'skillLog').flatMap((m) => m.entries);

test('(a)(b) 任意スキル：本人が自分の番に使える。相手の番・相手の席からは使えない。一覧と見積もりは本人だけ', () => {
  const { room, cur, other, inbox } = classicRoom();
  const me = room.game.players[cur.playerId];
  me.mp = 5;
  me.coins = 3;
  // 相手の番の人は使えない（自分のスキルでも）。相手の席のスキルを名指しする方法もない（args に playerId を入れても席で決まる）
  assert.match(room.action(other, 'skillAction', ['P03']).reason, /あなたの番ではありません/);
  // 本人：P03（コイン1で MP+2）
  const r = room.action(cur, 'skillAction', ['P03', {}]);
  assert.deepEqual(r, { ok: true });
  assert.deepEqual([me.mp, me.coins], [7, 2]);
  // 回数の上限は Game が決める（2回目は理由つきで拒否）
  assert.equal(room.action(cur, 'skillAction', ['P03']).ok, false);
  // V07（MP3 で使い魔）。結果は { ok } だけ（兵士のオブジェクトなどは送らない）
  assert.deepEqual(room.action(cur, 'skillAction', ['V07']), { ok: true });
  assert.equal(me.mp, 4);
  assert.equal(me.soldiers.filter((s) => s.skillToken).length, 1);
  // 状態は本人に送り直される（回数が入っている）
  const st = lastState(inbox.get(cur)).state.players[cur.playerId].skillState;
  assert.ok(Object.values(st.uses.turn ?? {}).some((n) => n >= 1));
  // 一覧：自分の分だけ
  const list = room.action(cur, 'listSkillActions', []);
  assert.equal(list.ok, true);
  assert.deepEqual(list.actions.map((x) => x.actionId).sort(), ['P03', 'V05', 'V07']);
  assert.equal(list.actions.find((x) => x.actionId === 'P03').used, 1);
  const otherList = room.action(other, 'listSkillActions', [cur.playerId]); // 相手の ID を送っても自分の一覧
  assert.ok(otherList.actions.every((x) => x.ok === false && /あなたの番ではありません/.test(x.reason)));
  // 見積もり：手番の人の手札だけ。状態は送り直さない（読むだけ）
  const card = room.game.players[cur.playerId].hand[0].cardId;
  const before = inbox.get(cur).length;
  const pv = room.action(cur, 'previewSkillCost', [card, {}]);
  assert.equal(pv.ok, true);
  assert.deepEqual(Object.keys(pv.preview).sort(), ['hp', 'mp', 'ok', 'reason']);
  assert.equal(inbox.get(cur).length, before);
  assert.match(room.action(other, 'previewSkillCost', [card, {}]).reason, /あなたの番ではありません/);
  assert.match(room.action(cur, 'previewSkillCost', ['nope', {}]).reason, /手札にありません/);
  // 相手の番になれば、相手が使える
  assert.equal(room.action(cur, 'endTurn', []).ok, true);
  if (room.game.phase === 'discard') room.action(cur, 'discard', [room.game.players[cur.playerId].hand.slice(0, room.game.players[cur.playerId].hand.length - room.game.getState(cur.playerId).players[cur.playerId].maxHand).map((c) => c.cardId)]);
  assert.equal(room.game.currentPlayer, other.playerId);
  room.game.players[other.playerId].coins = 3;
  room.game.players[other.playerId].mp = 0; // 段階A1：MP回復が5になり、ターン開始で満タンになりうる（P03 は満タンでは使えない）
  assert.deepEqual(room.action(other, 'skillAction', ['P03']), { ok: true });
  assert.match(room.action(cur, 'skillAction', ['P03']).reason, /あなたの番ではありません/);
});

test('(b) CPU の席・メイン行動以外（マリガン中）は拒否', () => {
  let seed = 9;
  const lobby = new Lobby(loadData(), () => seededRng(seed++), { cpuDelayMs: 0, modeData: loadModeData() });
  const a = lobby.join('osk-cpu', 'A', null, 'classic');
  const { room, seat } = lobby.findSeat(a.token);
  room.setSeat(seat, { skills: BUILD });
  room.addCpu(seat, 'hard');
  room.startGame();
  const cpuSeat = room.seats.find((s) => s.cpu);
  assert.match(room.action(cpuSeat, 'skillAction', ['P03']).reason, /CPU の席/);
  assert.equal(room.game.phase, 'mulligan'); // 人がまだ選んでいない
  assert.match(room.action(seat, 'skillAction', ['P03']).reason, room.game.currentPlayer === seat.playerId ? /メイン行動中/ : /あなたの番ではありません/);
});

test('(c) 不正な引数・大きすぎる入力は拒否する（落ちない・プロトタイプを汚さない）', () => {
  const { room, cur } = classicRoom();
  const card = room.game.players[cur.playerId].hand[0].cardId;
  const proto = JSON.parse('{"__proto__": {"polluted": 1}}');
  const deep = JSON.parse('{"a":{"b":{"c":{"d":{"e":1}}}}}');
  const bad = [
    ['skillAction', [123]],
    ['skillAction', ['__proto__']],
    ['skillAction', ['constructor']],
    ['skillAction', ['P03', [1, 2]]],
    ['skillAction', ['P03', proto]],
    ['skillAction', ['P03', JSON.parse('{"constructor": 1}')]],
    ['skillAction', ['P03', deep]],
    ['skillAction', ['P03', { s: 'x'.repeat(65) }]],
    ['skillAction', ['P03', { a: Array.from({ length: 17 }, () => 1) }]],
    ['skillAction', ['P03', Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`k${i}`, i]))]],
    ['skillAction', ['P03', 'text']],
    ['skillAction', ['NOPE']],
    ['playCard', [card, null, { evil: 1 }]],
    ['playCard', [card, null, { hpForMp: 'all' }]],
    ['playCard', [card, null, { hpForMp: -1 }]],
    ['playCard', [card, null, { diceChoice: 'max' }]],
    ['playCard', [card, null, proto]],
    ['playCard', [card, null, [1]]],
    ['playCard', [card, null, 'x']],
    ['previewSkillCost', [card, { bloodBlade: 'yes' }]],
    ['previewSkillCost', [card, proto]],
    ['setSkillPrefs', [null]],
    ['setSkillPrefs', [{}]],
    ['setSkillPrefs', [proto]],
    ['setSkillPrefs', [{ X35: proto }]],
    ['setSkillPrefs', [{ X35: { autoDefer: { x: 1 } } }]],
    ['setSkillPrefs', [{ X35: { autoDefer: true } }]], // 取っていないノード（Game が拒否）
  ];
  const mp = room.game.players[cur.playerId].mp;
  for (const [method, args] of bad) {
    const r = room.action(cur, method, args);
    assert.equal(r.ok, false, `${method} ${JSON.stringify(args)}`);
    assert.equal(typeof r.reason, 'string');
  }
  assert.equal(room.game.players[cur.playerId].mp, mp); // 何も払っていない
  assert.equal(({}).polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
  // 正しい skillOptions は Game に渡る（スキルの選択のない札でも、今までどおり出せる・出せないが決まる）
  const r = room.action(cur, 'playCard', [card, null, { hpForMp: 0, diceChoice: 'high' }]);
  assert.equal(typeof r.ok, 'boolean');
});

test('(d)(e) 相手には非公開の状態・発動ログが届かない。つなぎ直すと回数・資源・ログが戻る', () => {
  const { room, cur, other, inbox, disconnect } = classicRoom();
  const me = room.game.players[cur.playerId];
  me.coins = 3;
  me.mp = 5;
  assert.equal(room.action(cur, 'skillAction', ['P03']).ok, true);
  assert.equal(room.action(cur, 'skillAction', ['V07']).ok, true);
  // 本人：発動ログ（P03・V07）が届く。中身は表示に使うキーだけ
  const mine = logsOf(inbox.get(cur));
  assert.ok(mine.some((e) => e.kind === 'trigger' && e.skillId === 'P03'));
  assert.ok(mine.some((e) => e.kind === 'trigger' && e.skillId === 'V07'));
  for (const e of mine) {
    assert.equal(e.playerId, cur.playerId);
    assert.ok(Object.keys(e).every((k) => ['kind', 'turn', 'playerId', 'skillId', 'count', 'code'].includes(k)), JSON.stringify(e));
  }
  // 相手：本人の発動ログは来ない。状態の skillState は公開部分だけ
  assert.ok(logsOf(inbox.get(other)).every((e) => e.playerId === other.playerId));
  const seen = lastState(inbox.get(other)).state.players[cur.playerId];
  assert.ok(seen.skillState);
  for (const k of PRIVATE_KEYS) assert.equal(seen.skillState[k], undefined, k);
  assert.equal(seen.hand ?? null, null); // 相手の手札の中身は来ない
  assert.deepEqual(seen.skills, BUILD); // 取ったスキルは相手にも見せる（部屋の決まり）
  // 本人には本人用の部分がある
  const own = lastState(inbox.get(cur)).state.players[cur.playerId].skillState;
  for (const k of ['uses', 'actions', 'prefs', 'counters']) assert.ok(own[k] !== undefined, k);

  // つなぎ直し：前の接続を切って、新しくつなぐ
  disconnect.get(cur)();
  const fresh = [];
  room.connect(cur, (msg) => fresh.push(JSON.parse(JSON.stringify(msg))));
  const restored = lastState(fresh).state.players[cur.playerId];
  assert.deepEqual(restored.skillState.uses, own.uses);
  assert.deepEqual(restored.skillState.resources, own.resources);
  assert.equal(restored.skillState.actions.find((a) => a.actionId === 'P03').used, 1);
  const resent = fresh.filter((m) => m.type === 'skillLog');
  assert.equal(resent.length, 1);
  assert.equal(resent[0].replace, true);
  assert.ok(resent[0].entries.some((e) => e.skillId === 'P03'));
  // つなぎ直したあとも、上限は残っている
  assert.equal(room.action(cur, 'skillAction', ['P03']).ok, false);
});

test('(f) スキルのない試合（クラシックの空ビルド・通常モード）：今までどおり。スキルの操作は理由つきで断るだけ', () => {
  for (const mode of ['classic', 'kingdom']) {
    const { room, cur, inbox } = classicRoom(mode === 'classic' ? [[], []] : null, mode);
    assert.equal(room.game.skillRt, null);
    assert.equal(logsOf(inbox.get(cur)).length, 0);
    assert.equal(inbox.get(cur).some((m) => m.type === 'skillLog'), false);
    assert.match(room.action(cur, 'skillAction', ['P03']).reason, /スキルがありません/);
    assert.deepEqual(room.action(cur, 'listSkillActions', []), { ok: true, actions: [] });
    const card = room.game.players[cur.playerId].hand[0].cardId;
    assert.deepEqual(room.action(cur, 'previewSkillCost', [card, {}]), { ok: true, preview: null });
    assert.match(room.action(cur, 'setSkillPrefs', [{ X35: { autoDefer: true } }]).reason, /スキルがありません/);
    // 第3引数なし・null は今までと同じ呼び方
    const st = room.game.getState(cur.playerId);
    assert.equal(st.players[cur.playerId].skillState, undefined);
  }
});

test('(b) 降参して観戦中の席は使えない（3人のバトルロイヤル）', () => {
  let seed = 21;
  const lobby = new Lobby(loadData(), () => seededRng(seed++), { cpuDelayMs: 0, modeData: loadModeData() });
  const a = lobby.join('osk-watch', 'A', null, 'classic');
  const b = lobby.join('osk-watch', 'B', null, 'classic');
  const { room, seat: sa } = lobby.findSeat(a.token);
  const sb = lobby.findSeat(b.token).seat;
  for (const s of [sa, sb]) room.setSeat(s, { skills: BUILD });
  assert.equal(room.setRules(sa, { winCondition: 'lastStanding' }).ok, true);
  room.addCpu(sa, 'easy');
  room.startGame();
  for (const s of [sa, sb]) room.action(s, 'mulligan', [[]]);
  // 手番でない方の人が降参して観戦になる
  const watcher = room.game.currentPlayer === sa.playerId ? sb : sa;
  assert.equal(room.action(watcher, 'surrender', []).ok, true);
  assert.notEqual(room.game.phase, 'gameOver');
  room.game.players[watcher.playerId].coins = 3;
  assert.equal(room.action(watcher, 'skillAction', ['P03']).ok, false);
  assert.ok(room.action(watcher, 'listSkillActions', []).actions.every((x) => !x.ok));
});
