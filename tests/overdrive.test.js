// 背水の陣（城HPが上限の overdriveHpRatio 以下で、兵士全員の攻撃が上がる）のテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { loadFixture, loadJson, seededRng, recordEvents } from './helpers.js';

function setup({ p1 = [], p2 = [], rules = {} } = {}) {
  const cards = loadFixture('cards-step2.json');
  const r = { ...loadFixture('rules.json'), castleMaxHp: 30, secondPlayerCastleBonus: 0, overdriveHpRatio: 1 / 3, overdriveAttack: 10, ...rules };
  const game = new Game({ cards, rules: r, rng: seededRng(1) });
  game.debugSetHand('p1', p1);
  game.debugSetHand('p2', p2);
  game.debugSetDeck(Array(40).fill('heal'));
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  return { game, log };
}
const idOf = (game, type) => {
  const pid = game.currentPlayer;
  return game.getState(pid).players[pid].hand.find((c) => c.type === type).cardId;
};

test('城HPが上限の1/3以下になると背水の陣（overdriveChanged）。回復して超えたら終わる', () => {
  const { game, log } = setup({ p2: ['fireball', 'fireball', 'fireball'], p1: ['heal'] });
  game.endTurn();
  game.debugSetCastleHp('p1', 18);
  log.length = 0;
  game.playCard(idOf(game, 'fireball')); // 18 → 10（上限30の1/3）
  const on = log.find((e) => e.event === 'overdriveChanged');
  assert.deepEqual(on, { event: 'overdriveChanged', playerId: 'p1', active: true, hp: 10, attack: 10 });
  assert.equal(log.findIndex((e) => e.event === 'overdriveChanged') > log.findIndex((e) => e.event === 'castleDamaged'), true);
  assert.equal(game.getState(null).players.p1.overdrive, true);
  game.endTurn();
  log.length = 0;
  game.playCard(idOf(game, 'heal')); // 10 → 20
  assert.deepEqual(log.find((e) => e.event === 'overdriveChanged'), { event: 'overdriveChanged', playerId: 'p1', active: false, hp: 20, attack: 10 });
  assert.equal(game.getState(null).players.p1.overdrive, false);
});

test('背水の陣のあいだ、自分の兵士の攻撃（戦い・城へのダメージ）が +10', () => {
  const { game, log } = setup({ p1: ['knight'], rules: { laneLength: 3 } });
  game.debugSetCastleHp('p1', 5);
  game.playCard(idOf(game, 'knight'));
  game.endTurn();
  game.endTurn(); // 騎士（攻撃5）が城に着く
  assert.equal(log.find((e) => e.event === 'castleDamaged' && e.playerId === 'p2').amount, 15);
});

test('overdriveAttack が0なら背水の陣にならない', () => {
  const { game, log } = setup({ p2: ['fireball'], rules: { overdriveAttack: 0 } });
  game.endTurn();
  game.debugSetCastleHp('p1', 9);
  game.playCard(idOf(game, 'fireball'));
  assert.equal(log.some((e) => e.event === 'overdriveChanged'), false);
  assert.equal(game.getState(null).players.p1.overdrive, false);
});

test('data/rules.json：上限の1/3（城HP60なら20）以下で、攻撃+10', () => {
  const r = loadJson('rules.json');
  assert.equal(Math.round(60 * r.overdriveHpRatio), 20);
  assert.equal(r.overdriveAttack, 10);
});
