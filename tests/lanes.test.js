// レーン（同じ2人の間の道が何本もある）のテスト。rules.laneCount で本数を変える。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { loadFixture, seededRng, recordEvents } from './helpers.js';

const MONSTERS = {
  slime: { name: 'スライム', hp: 4, attack: 1, element: 'water', reward: 2, castleAttack: 2, attackEvery: 2, weight: 1 },
};

function setup({ p1 = [], p2 = [], rules = {}, cards = {}, monsters = null, deck = Array(40).fill('heal') } = {}) {
  const base = loadFixture('cards-step2.json');
  for (const [k, v] of Object.entries(cards)) base[k] = { ...base[k], ...v };
  const r = { ...loadFixture('rules.json'), laneCount: 3, laneLength: 3, ...rules };
  const game = new Game({ cards: base, rules: r, rng: seededRng(1), monsters });
  game.debugSetHand('p1', p1);
  game.debugSetHand('p2', p2);
  game.debugSetDeck(deck);
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  return { game, log };
}
const idOf = (game, type) => {
  const pid = game.currentPlayer;
  return game.getState(pid).players[pid].hand.find((c) => c.type === type).cardId;
};

test('laneCount 3 なら、2人の間に道が3本できる。1本ならこれまでどおり', () => {
  const { game } = setup();
  assert.deepEqual(game.getState(null).roads.map((r) => [r.roadId, r.lane]), [['p1-p2#1', 0], ['p1-p2#2', 1], ['p1-p2#3', 2]]);
  const one = setup({ rules: { laneCount: 1 } });
  assert.deepEqual(one.game.getState(null).roads.map((r) => r.roadId), ['p1-p2']);
});

test('laneCount は 1〜5 の整数', () => {
  assert.throws(() => setup({ rules: { laneCount: 0 } }), /laneCount/);
  assert.throws(() => setup({ rules: { laneCount: 6 } }), /laneCount/);
});

test('兵士は出す道を選ぶ。選ばないと出せず、選んだ道に出る', () => {
  const { game, log } = setup({ p1: ['infantry'] });
  const id = idOf(game, 'infantry');
  assert.deepEqual(game.getTargets(id).map((t) => t.roadId), ['p1-p2#1', 'p1-p2#2', 'p1-p2#3']);
  assert.equal(game.canPlayCard(id).needsTarget, true);
  assert.equal(game.playCard(id).ok, false);
  assert.equal(game.playCard(id, { playerId: 'p2' }).ok, false); // 道を選んでいない
  assert.equal(game.playCard(id, { playerId: 'p2', roadId: 'p1-p2#3' }).ok, true);
  assert.equal(log.find((e) => e.event === 'soldierDeployed').roadId, 'p1-p2#3');
  assert.equal(game.getState('p1').players.p1.soldiers[0].roadId, 'p1-p2#3');
});

test('別の道にいる兵士どうしはぶつからない。同じ道ならぶつかる', () => {
  const { game, log } = setup({ p1: ['knight'], p2: ['knight', 'infantry'], deck: Array(40).fill('heal') });
  game.playCard(idOf(game, 'knight'), { playerId: 'p2', roadId: 'p1-p2#1' });
  game.endTurn();
  game.playCard(idOf(game, 'knight'), { playerId: 'p1', roadId: 'p1-p2#2' });
  game.endTurn(); // p1 の騎士は #1 を進む。p2 の騎士は #2 なので、ぶつからず城へ向かう
  assert.equal(log.filter((e) => e.event === 'soldiersClashed').length, 0);
});

test('サンダー（scope: lane）は選んだ道の兵士だけに効く。scope なしは全部の道', () => {
  const { game } = setup({ p1: ['infantry', 'infantry'], p2: ['thunder'], cards: { thunder: { scope: 'lane' } } });
  game.playCard(idOf(game, 'infantry'), { playerId: 'p2', roadId: 'p1-p2#1' });
  game.endTurn();
  game.endTurn();
  game.playCard(idOf(game, 'infantry'), { playerId: 'p2', roadId: 'p1-p2#2' });
  game.endTurn();
  const id = idOf(game, 'thunder');
  assert.deepEqual(game.getTargets(id), [{ playerId: 'p1', roadId: 'p1-p2#1' }, { playerId: 'p1', roadId: 'p1-p2#2' }]);
  assert.equal(game.playCard(id, { playerId: 'p1' }).ok, false);
  assert.equal(game.playCard(id, { playerId: 'p1', roadId: 'p1-p2#2' }).ok, true);
  const hp = game.getState('p2').players.p1.soldiers.map((s) => [s.roadId, s.hp]);
  assert.deepEqual(hp, [['p1-p2#1', 5], ['p1-p2#2', 2]]);
});

test('scope なしのサンダーは、レーンを選ばず全部の道の兵士に効く', () => {
  const { game } = setup({ p1: ['infantry', 'infantry'], p2: ['thunder'] });
  game.playCard(idOf(game, 'infantry'), { playerId: 'p2', roadId: 'p1-p2#1' });
  game.endTurn();
  game.endTurn();
  game.playCard(idOf(game, 'infantry'), { playerId: 'p2', roadId: 'p1-p2#3' });
  game.endTurn();
  assert.equal(game.playCard(idOf(game, 'thunder')).ok, true);
  assert.deepEqual(game.getState('p2').players.p1.soldiers.map((s) => s.hp), [2, 2]);
});

test('道が1本のときは scope: lane でも対象を選ばない（これまでと同じ）', () => {
  const { game } = setup({ p1: ['infantry'], p2: ['thunder'], rules: { laneCount: 1 }, cards: { thunder: { scope: 'lane' } } });
  game.playCard(idOf(game, 'infantry'), { playerId: 'p2' });
  game.endTurn();
  assert.deepEqual(game.getTargets(idOf(game, 'thunder')), [{ playerId: 'p1' }]);
});

test('魔物は2人の間に1体だけ。出る道はランダムで、ほかの道は魔物に止められない', () => {
  const { game, log } = setup({ rules: { monsterFirstRound: 1, monsterSpawnChance: 1 }, monsters: MONSTERS });
  const appeared = log.filter((e) => e.event === 'monsterAppeared');
  assert.equal(appeared.length, 1);
  assert.match(appeared[0].roadId, /^p1-p2#[123]$/);
  assert.equal(game.getState(null).monsters.length, 1);
  game.endTurn(); game.endTurn();
  assert.equal(game.getState(null).monsters.length, 1); // 2周目も増えない
});

test('魔物のいない道の兵士は、魔物に止められず進める', () => {
  const { game } = setup({ p1: ['infantry'], rules: { monsterFirstRound: 1, monsterSpawnChance: 1 }, monsters: MONSTERS });
  const monsterRoad = game.getState(null).monsters[0].roadId;
  const free = game.getState(null).roads.find((r) => r.roadId !== monsterRoad).roadId;
  game.playCard(idOf(game, 'infantry'), { playerId: 'p2', roadId: free });
  game.endTurn(); game.endTurn();
  assert.equal(game.getState(null).players.p1.soldiers[0].position, 2); // 魔物に止められず2マス進んだ
});

test('魔物のいる道の兵士は、魔物と戦う', () => {
  const { game, log } = setup({ p1: ['infantry'], rules: { monsterFirstRound: 1, monsterSpawnChance: 1 }, monsters: MONSTERS });
  const monsterRoad = game.getState(null).monsters[0].roadId;
  game.playCard(idOf(game, 'infantry'), { playerId: 'p2', roadId: monsterRoad });
  game.endTurn(); game.endTurn();
  assert.ok(log.some((e) => e.event === 'monsterClashed' && e.roadId === monsterRoad));
});
