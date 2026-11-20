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

test('降参：3人以上のときは、城が壊れて抜け、残りの試合を見守れる', () => {
  const game = newGame({ playerCount: 3 });
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  assert.deepEqual(game.surrender('p3'), { ok: true }); // 自分の番でなくてもできる
  const st = game.getState(null);
  assert.equal(st.phase, 'main');
  assert.equal(st.players.p3.eliminated, true);
  assert.equal(st.players.p3.castleHp, 0);
  assert.equal(st.currentPlayer, 'p1');
  const hit = log.find((e) => e.event === 'castleDamaged');
  assert.deepEqual([hit.playerId, hit.hp, hit.source], ['p3', 0, { kind: 'surrender' }]);
  assert.ok(log.some((e) => e.event === 'playerEliminated' && e.playerId === 'p3'));
  assert.equal(game.surrender('p3').ok, false); // 抜けた人はもう降参できない
});

test('降参：自分の番で降参したら、次の人の番になる。最後の2人になったら、そのあとは1人の降参で終わる', () => {
  const game = newGame({ playerCount: 3 });
  game.start();
  assert.equal(game.surrender('p1').ok, true);
  assert.equal(game.getState(null).currentPlayer, 'p2');
  assert.equal(game.getState(null).phase, 'main');
  assert.equal(game.surrender('p2').ok, true);
  const st = game.getState(null);
  assert.equal(st.phase, 'gameOver');
  assert.equal(st.winner, 'p3');
});

test('降参：3人のとき、抜けた人は手番が来ない（見守るだけ）', () => {
  const game = newGame({ playerCount: 3 });
  game.start();
  game.surrender('p2');
  game.endTurn(); // p1 → p3
  assert.equal(game.getState(null).currentPlayer, 'p3');
  game.endTurn();
  assert.equal(game.getState(null).currentPlayer, 'p1');
});

function newLobby() {
  const data = { cards: loadFixture('cards.json'), rules: loadFixture('rules.json'), monsters: null, upgrades: null };
  return new Lobby(data, () => seededRng(1), { cpuDelayMs: 0 });
}

test('部屋：自分の番でない人も降参できる', () => {
  const lobby = newLobby();
  const a = lobby.join('abc', 'A');
  const b = lobby.join('abc', 'B');
  const { room } = lobby.findSeat(b.token);
  room.action(lobby.findSeat(a.token).seat, 'start', []);
  for (const t of [a.token, b.token]) room.action(lobby.findSeat(t).seat, 'mulligan', [[]]);
  // 先攻はコイントスで決まる。先攻でない人が降参する
  const first = room.game.currentPlayer;
  const other = [a, b].map((x) => lobby.findSeat(x.token).seat).find((s) => s.playerId !== first);
  assert.deepEqual(room.action(other, 'surrender', []), { ok: true });
  assert.equal(room.game.getState(null).winner, first);
});

test('部屋：出た人がいると、もう1回はできず、同じ合言葉は新しい部屋になる', () => {
  const lobby = newLobby();
  const a = lobby.join('abc', 'A');
  const b = lobby.join('abc', 'B');
  const fa = lobby.findSeat(a.token);
  const fb = lobby.findSeat(b.token);
  fa.room.action(fa.seat, 'start', []);
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
