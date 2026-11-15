// 降参（Game.surrender）と、オンラインの部屋の「降参」「部屋を出る」のテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { Lobby } from '../server/rooms.js';
import { STRATEGIES } from '../js/game/strategies.js';
import { loadFixture, seededRng, recordEvents } from './helpers.js';

function newGame(rules = {}) {
  return new Game({ cards: loadFixture('cards.json'), rules: { ...loadFixture('rules.json'), ...rules }, rng: seededRng(1) });
}

test('降参：相手の勝ちで、すぐ終わる（自分の番でなくてもできる）', () => {
  const game = newGame();
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  assert.equal(game.getState(null).currentPlayer, 'p1');
  assert.deepEqual(game.surrender('p2'), { ok: true });
  const st = game.getState(null);
  assert.equal(st.phase, 'gameOver');
  assert.equal(st.winner, 'p1');
  assert.deepEqual(log.at(-1), { event: 'gameOver', winner: 'p1', reason: 'surrender' });
  assert.equal(game.endTurn().ok, false);
});

test('降参：始まる前・終わったあと・知らない人はできない', () => {
  const game = newGame();
  assert.equal(game.surrender('p1').ok, false);
  game.start();
  assert.equal(game.surrender('p9').ok, false);
  assert.equal(game.surrender('p1').ok, true);
  assert.equal(game.surrender('p2').ok, false);
  assert.equal(game.getState(null).winner, 'p2');
});

test('降参：3人以上のときはできない（まだ決めていない）', () => {
  const game = newGame({ playerCount: 3 });
  game.start();
  const res = game.surrender('p1');
  assert.equal(res.ok, false);
  assert.equal(game.getState(null).phase, 'main');
});

function newLobby() {
  const data = { cards: loadFixture('cards.json'), rules: loadFixture('rules.json'), monsters: null, upgrades: null };
  return new Lobby(data, () => seededRng(1));
}

test('部屋：自分の番でない人も降参できる', () => {
  const lobby = newLobby();
  lobby.join('abc', 'A');
  const b = lobby.join('abc', 'B');
  const { room, seat } = lobby.findSeat(b.token);
  assert.equal(room.game.currentPlayer, 'p1');
  assert.deepEqual(room.action(seat, 'surrender', []), { ok: true });
  assert.equal(room.game.getState(null).winner, 'p1');
});

test('部屋：出た人がいると、もう1回はできず、同じ合言葉は新しい部屋になる', () => {
  const lobby = newLobby();
  const a = lobby.join('abc', 'A');
  const b = lobby.join('abc', 'B');
  const fa = lobby.findSeat(a.token);
  const fb = lobby.findSeat(b.token);
  const seen = [];
  fa.room.connect(fa.seat, (msg) => seen.push(msg));
  assert.deepEqual(fb.room.action(fb.seat, 'leave', []), { ok: true });
  const last = seen.filter((m) => m.type === 'room').at(-1);
  assert.equal(last.players.find((p) => p.playerId === 'p2').left, true);
  assert.equal(last.players.find((p) => p.playerId === 'p1').left, false);
  fa.room.action(fa.seat, 'surrender', []);
  assert.equal(fa.room.action(fa.seat, 'rematch', []).ok, false);
  const c = lobby.join('abc', 'C');
  assert.equal(c.ok, true);
  assert.equal(c.playerId, 'p1');
  assert.notEqual(c.roomId, a.roomId);
});

test('戦い方：js/game/strategies.js から読める（CPU 用）。CPU 同士で最後まで進む', () => {
  const cards = loadFixture('cards.json');
  const rules = loadFixture('rules.json');
  const game = new Game({ cards, rules, rng: seededRng(3) });
  const ctx = { cards, rules, upgrades: {}, discardCount: 0 };
  game.on('discardRequired', (e) => { ctx.discardCount = e.count; });
  const rng = seededRng(4);
  game.start();
  for (let i = 0; i < 5000 && game.getState(null).phase !== 'gameOver'; i++) {
    const st = game.getState(null);
    const cpu = STRATEGIES[st.currentPlayer === 'p1' ? 'smart' : 'random'];
    if (st.phase === 'discard') game.discard(cpu.chooseDiscard(game, st.currentPlayer, rng, ctx));
    else {
      cpu.takeTurn(game, st.currentPlayer, rng, ctx);
      if (game.getState(null).phase !== 'gameOver') game.endTurn();
    }
  }
  assert.equal(game.getState(null).phase, 'gameOver');
});

// ---- 防御（リアクション）の、サーバー側の決まり ----

function reactionRoom({ timeoutMs = 0 } = {}) {
  const cards = loadFixture('cards-step6.json');
  const rules = { ...loadFixture('rules.json'), laneLength: 3, castleMaxHp: 40, soldierCastleDamageMultiplier: 3, reactionMaxCards: 2 };
  const lobby = new Lobby({ cards, rules, monsters: null, upgrades: null, reactionTimeoutMs: timeoutMs }, () => seededRng(1));
  const a = lobby.join('r', 'A');
  const b = lobby.join('r', 'B');
  const fa = lobby.findSeat(a.token);
  const fb = lobby.findSeat(b.token);
  const game = fa.room.game;
  game.debugSetHand('p1', ['knight']);
  game.debugSetHand('p2', ['guard', 'heal']);
  game.debugSetDeck(Array(40).fill('heal'));
  const idOf = (pid, type) => game.getState(pid).players[pid].hand.find((c) => c.type === type).cardId;
  assert.equal(fa.room.action(fa.seat, 'playCard', [idOf('p1', 'knight')]).ok, true);
  fa.room.action(fa.seat, 'endTurn', []);
  fb.room.action(fb.seat, 'endTurn', []);
  return { room: fa.room, A: fa.seat, B: fb.seat, game, idOf };
}

test('部屋：防御の場面では、防御される側だけが react を送れる。ほかの操作はだれもできない', () => {
  const { room, A, B, game, idOf } = reactionRoom();
  assert.equal(game.phase, 'reaction');
  assert.equal(room.action(A, 'react', [[]]).reason, 'あなたが防御する場面ではありません');
  assert.equal(room.action(A, 'endTurn', []).ok, false);
  assert.equal(room.action(B, 'endTurn', []).ok, false);
  assert.equal(room.action(B, 'react', [['c999']]).reason, 'そのカードは手札にありません');
  assert.equal(game.phase, 'reaction');
  // 防御する人には、使える防御カードが分かる。攻撃した人には「待って」と伝わる
  const forB = room.stateFor('p2');
  assert.equal(forB.playable.find((p) => p.cardId === idOf('p2', 'guard')).reaction.ok, true);
  assert.equal(forB.playable.find((p) => p.cardId === idOf('p2', 'heal')).reaction.ok, false);
  assert.equal(room.stateFor('p1').playable.every((p) => p.reaction?.ok === false || p.reaction === undefined), true);
  assert.deepEqual(room.stateFor('p1').state.reaction, room.stateFor('p2').state.reaction);
  assert.equal(room.action(B, 'react', [[idOf('p2', 'guard')]]).ok, true);
  assert.equal(game.phase, 'main');
  assert.equal(room.action(B, 'react', [[]]).reason, 'いまは防御する場面ではありません');
});

test('部屋：防御の待ち時間が過ぎたら、防御せずに受ける（勝ち負けは決めない）', async () => {
  const { room, game } = reactionRoom({ timeoutMs: 40 });
  assert.equal(game.phase, 'reaction');
  assert.ok(room.stateFor('p2').reactionDeadlineIn > 0);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(game.phase, 'main');
  assert.equal(game.getState(null).players.p2.castleHp, 42 - 15);
  assert.equal(room.stateFor('p2').reactionDeadlineIn, null);
  assert.equal(room.reactionTimer, null);
});

test('部屋：防御して時間内に決めたら、待ち時間は止まる', async () => {
  const { room, B, game, idOf } = reactionRoom({ timeoutMs: 60 });
  room.action(B, 'react', [[idOf('p2', 'guard')]]);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(game.getState(null).players.p2.castleHp, 42 - 10); // 時間切れの「受ける」は起きていない
});
