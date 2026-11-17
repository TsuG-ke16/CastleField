// 真ん中の広場を通る道（rules.roadLayout: "plaza"、3人以上）のテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES, PLAZA } from '../js/game/Game.js';
import { STRATEGIES } from '../js/game/strategies.js';
import { loadFixture, seededRng, recordEvents, buildData, loadOptionalData } from './helpers.js';

const SLIME = { slime: { name: 'スライム', hp: 4, attack: 1, castleAttack: 2, attackEvery: 1, weight: 1, reward: 1 } };

function newGame({ players = 4, rules = {}, monsters = null, seed = 1 } = {}) {
  const game = new Game({
    cards: loadFixture('cards.json'),
    rules: { ...loadFixture('rules.json'), laneLength: 3, laneCount: 3, roadLayout: 'plaza', playerCount: players, ...rules },
    monsters,
    rng: seededRng(seed),
  });
  const log = recordEvents(game, EVENT_TYPES);
  return { game, log };
}

/** playerId の兵士を1体、targetId に向けて置く（position を指定） */
function place(game, playerId, targetId, position) {
  game.debugSetHand(playerId, ['infantry']);
  const saved = game.currentPlayer;
  game.currentPlayer = playerId;
  const card = game.players[playerId].hand[0];
  const r = game.playCard(card.cardId, { playerId: targetId });
  assert.equal(r.ok, true, r.reason);
  game.players[playerId].playedThisTurn = false;
  game.players[playerId].soldiersPlayedThisTurn = 0;
  game.currentPlayer = saved;
  const s = game.players[playerId].soldiers.at(-1);
  s.position = position;
  return s;
}

test('広場：だれにでも兵士を送れ、道（レーン）は1本。2人なら今までどおり', () => {
  const { game } = newGame();
  game.start();
  const st = game.getState('p1');
  assert.equal(st.layout, 'plaza');
  assert.equal(game.rules.laneCount, 1);
  game.debugSetHand('p1', ['infantry']);
  const targets = game.getTargets(game.players.p1.hand[0].cardId);
  assert.deepEqual(targets, [{ playerId: 'p2' }, { playerId: 'p3' }, { playerId: 'p4' }]);
  // 2人なら広場にしない（道は laneCount 本のまま）
  const two = newGame({ players: 2 }).game;
  assert.equal(two.getState(null).layout, 'lanes');
  assert.equal(two.getState(null).roads.length, 3);
});

test('広場：兵士の場所（place）は 自分の道 → 広場 → 相手の道', () => {
  const { game } = newGame();
  game.start();
  const s = place(game, 'p1', 'p3', 0);
  const where = () => game.getState(null).players.p1.soldiers[0].place;
  assert.deepEqual(where(), { at: 'spoke', playerId: 'p1', square: 0 });
  s.position = 1;
  assert.deepEqual(where(), { at: 'plaza' });
  s.position = 2;
  assert.deepEqual(where(), { at: 'spoke', playerId: 'p3', square: 0 });
});

test('広場：自分の方に向かってくる兵士とは戦い、関係ない兵士とはすれちがう', () => {
  const { game } = newGame();
  game.start();
  const a = place(game, 'p1', 'p2', 1); // 広場
  // p3 → p2：どちらも p2 を狙っているだけなので、同じ広場にいても戦わない
  const c = place(game, 'p3', 'p2', 1);
  assert.equal(game.findClashTarget(a, game.players.p1), null);
  assert.equal(game.findClashTarget(c, game.players.p3), null);
  // p4 → p1：p1 の方に向かってくるので戦う（どちらから見ても）
  const d = place(game, 'p4', 'p1', 1);
  assert.equal(game.findClashTarget(a, game.players.p1).soldier, d);
  assert.equal(game.findClashTarget(d, game.players.p4).soldier, a);
  // p2 の兵士（p2 → p3）：p1 は p2 を狙っているので、p2 の兵士とは戦う
  game.players.p4.soldiers = [];
  const b = place(game, 'p2', 'p3', 1);
  assert.equal(game.findClashTarget(a, game.players.p1).soldier, b);
  // c（p3 → p2）から見ると、b（p2 → p3）は自分の方に向かってくる
  assert.equal(game.findClashTarget(c, game.players.p3).soldier, b);
});

test('広場：自分の道の上で、向かってくる兵士とぶつかる（1つ先のマス）', () => {
  const { game, log } = newGame();
  game.start();
  const mine = place(game, 'p1', 'p2', 0); // p1 の道
  const foe = place(game, 'p3', 'p1', 1); // 広場（p1 から見て1つ先）
  assert.equal(game.findClashTarget(mine, game.players.p1).soldier, foe);
  // p3 の進軍で、foe は p1 の道に入る手前（同じマスの1つ先に mine）で止まって戦う
  game.currentPlayer = 'p3';
  game.advanceSoldiers(game.players.p3);
  const clash = log.find((e) => e.event === 'soldiersClashed');
  assert.deepEqual(clash.attacker, { playerId: 'p3', soldierId: foe.soldierId });
  assert.deepEqual(clash.defender, { playerId: 'p1', soldierId: mine.soldierId });
});

test('広場の魔物：1体だけ・HP は人数に比例・だれからでも狙える・人数の半分の城を攻める', () => {
  const { game, log } = newGame({ monsters: SLIME, rules: { monsterFirstRound: 1, monsterSpawnChance: 1 } });
  game.start();
  assert.equal(game.monsters.length, 1);
  const m = game.getState(null).monsters[0];
  assert.equal(m.roadId, PLAZA);
  assert.equal(m.square, 1);
  assert.equal(m.hp, 8); // 4 × 4人 ÷ 2
  for (const pid of ['p1']) {
    game.debugSetHand(pid, ['fireball']);
    assert.ok(game.getTargets(game.players[pid].hand[0].cardId).some((t) => t.monsterId === m.monsterId));
  }
  // 自分の城の前の兵士は、広場の魔物に止められて戦う
  const s = place(game, 'p2', 'p4', 0);
  assert.equal(game.findMonsterInRange(s, game.players.p2), game.monsters[0]);
  // 周回が変わると、4人の半分＝2つの城を攻める
  for (let i = 0; i < 4; i++) game.endTurn();
  const hits = log.filter((e) => e.event === 'monsterAttackedCastle');
  assert.equal(hits.length, 2);
  assert.notEqual(hits[0].playerId, hits[1].playerId);
  assert.ok(hits.every((h) => h.amount === 2));
});

test('広場：バトルロイヤルで抜けた人への通り道は消える（新しい道はできない）', () => {
  const { game, log } = newGame({ players: 3, rules: { winCondition: 'lastStanding' } });
  game.start();
  assert.equal(game.getState(null).roads.length, 3); // p1-p2・p1-p3・p2-p3
  const toP3 = place(game, 'p2', 'p3', 2);
  const toP1 = place(game, 'p2', 'p1', 0);
  game.debugSetCastleHp('p3', 1);
  game.players.p3.castle.takeDamage(1);
  game.checkGameOver();
  assert.deepEqual(game.getState(null).roads.map((r) => r.roadId), ['p1-p2']);
  assert.equal(log.filter((e) => e.event === 'roadOpened').length, 0);
  assert.ok(!game.players.p2.soldiers.includes(toP3));
  assert.ok(game.players.p2.soldiers.includes(toP1));
});

test('広場：8人の CPU 同士で、どの勝ち方でも最後まで進む', () => {
  const { rules, cards } = buildData({ rules: { roadLayout: 'plaza', playerCount: 8 } });
  for (const winCondition of ['firstDestroy', 'lastStanding']) {
    const game = new Game({ cards, rules: { ...rules, winCondition }, ...loadOptionalData(), rng: seededRng(9) });
    const ctx = { cards, rules: game.rules, upgrades: loadOptionalData().upgrades, discardCount: 0 };
    const rng = seededRng(10);
    const settle = () => {
      for (let i = 0; i < 50 && game.getState(null).phase === 'defend'; i++) {
        const d = game.getState(null).defense.defenderId;
        STRATEGIES.smart.respond(game, d, rng, ctx);
      }
    };
    ctx.onDefense = settle;
    game.on('discardRequired', (e) => { ctx.discardCount = e.count; });
    game.start();
    for (let i = 0; i < 20000 && game.getState(null).phase !== 'gameOver'; i++) {
      const st = game.getState(null);
      if (st.phase === 'defend') { settle(); continue; }
      const strat = STRATEGIES[i % 3 === 0 ? 'random' : 'smart'];
      if (st.phase === 'discard') game.discard(strat.chooseDiscard(game, st.currentPlayer, rng, ctx));
      else {
        strat.takeTurn(game, st.currentPlayer, rng, ctx);
        if (game.getState(null).phase === 'main') game.endTurn();
      }
    }
    assert.equal(game.getState(null).phase, 'gameOver', winCondition);
  }
});
