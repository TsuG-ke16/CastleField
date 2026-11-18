// 兵士の体力ゲージ用の maxHp（HP の上限）のテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/Game.js';
import { loadFixture, seededRng } from './helpers.js';

const UPGRADES = { fortify: { name: '鍛錬', effect: 'fortifyArmy', amount: 2, cost: 1 } };

function setup() {
  const game = new Game({ cards: loadFixture('cards-step2.json'), rules: loadFixture('rules.json'), rng: seededRng(1), upgrades: UPGRADES });
  game.debugSetHand('p1', ['infantry', 'infantry']);
  game.start();
  return game;
}
const soldiers = (g) => g.getState(null).players.p1.soldiers;

test('maxHp：出した兵士の maxHp は出した時点の HP。ダメージを受けても変わらない', () => {
  const g = setup();
  const id = g.getState('p1').players.p1.hand[0].cardId;
  g.playCard(id, { playerId: 'p2' });
  const s = soldiers(g)[0];
  assert.equal(s.maxHp, s.hp);
  const raw = g.players.p1.soldiers[0];
  raw.takeDamage(2);
  assert.equal(soldiers(g)[0].maxHp, s.hp);
  assert.equal(soldiers(g)[0].hp, s.hp - 2);
});

test('maxHp：鍛錬で HP が増えると、いる兵士とこれから出す兵士の maxHp も増える', () => {
  const g = setup();
  g.players.p1.coins = 10;
  const [a, b] = g.getState('p1').players.p1.hand.map((c) => c.cardId);
  g.playCard(a, { playerId: 'p2' });
  const before = soldiers(g)[0].maxHp;
  assert.equal(g.buyUpgrade('fortify').ok, true);
  assert.equal(soldiers(g)[0].maxHp, before + 2);
  g.players.p1.soldiersPlayedThisTurn = 0;
  g.playCard(b, { playerId: 'p2' });
  assert.equal(soldiers(g)[1].maxHp, before + 2);
  assert.equal(soldiers(g)[1].hp, before + 2);
});
