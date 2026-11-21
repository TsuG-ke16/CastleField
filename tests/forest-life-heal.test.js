// 森の生命回復（healCastleAndSoldier）：城と、傷ついた自分の兵士1体を同時に回復する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/Game.js';
import { buildData, loadJson, seededRng, recordEvents, PLAIN_START } from './helpers.js';

function make(hand) {
  const { cards, rules } = buildData({ rules: { ...PLAIN_START, drawUntilHand: 0, defenseReaction: false } });
  const g = new Game({ cards, rules, rng: seededRng(3), rarities: loadJson('rarities.json') });
  g.debugSetHand('p1', hand);
  g.start();
  return g;
}
const idOf = (g, type) => g.getState('p1').players.p1.hand.find((c) => c.type === type).cardId;
/** 兵士を出してから、HP を決める */
function deploy(g, hp) {
  const id = idOf(g, 'infantry');
  const t = g.getTargets(id)[0];
  assert.equal(g.playCard(id, t).ok, true);
  const s = g.players.p1.soldiers.at(-1);
  s.hp = hp;
  return s;
}

test('cards.json：生命回復5枚は実装済みで、城/兵士 4/2・8/3・14/5・24/8・40/12', () => {
  const c = loadJson('cards.json');
  const want = [[4, 2], [8, 3], [14, 5], [24, 8], [40, 12]];
  ['common', 'uncommon', 'rare', 'epic', 'legendary'].forEach((r, i) => {
    const d = c[`forest_life_heal_${r}`];
    assert.equal(d.effect, 'healCastleAndSoldier');
    assert.notEqual(d.implemented, false);
    assert.deepEqual([d.amount, d.soldierHeal], want[i]);
  });
});

test('城と、HPの割合がいちばん低い兵士が回復する。maxHp は超えない', () => {
  const g = make(['infantry', 'infantry', 'forest_life_heal_uncommon']);
  const a = deploy(g, 3);
  const b = deploy(g, 1); // 割合がいちばん低い
  g.players.p1.castle.hp -= 20;
  const hpBefore = g.players.p1.castle.hp;
  const log = recordEvents(g, ['castleHealed', 'soldierHealed']);
  assert.equal(g.playCard(idOf(g, 'forest_life_heal_uncommon')).ok, true);
  assert.equal(g.players.p1.castle.hp, hpBefore + 8);
  assert.equal(b.hp, 4); // 1 + 3
  assert.equal(a.hp, 3);
  assert.deepEqual(log.map((e) => e.event), ['castleHealed', 'soldierHealed']);
  assert.equal(log[1].soldierId, b.soldierId);
  assert.equal(log[1].amount, 3);
  assert.equal(log[1].hp, 4);
});

test('兵士の回復は maxHp で止まり、amount は実際に増えた量', () => {
  const g = make(['infantry', 'forest_life_heal_legendary']);
  const s = deploy(g, 1);
  s.hp = s.maxHp - 1;
  g.players.p1.castle.hp -= 5;
  const log = recordEvents(g, ['soldierHealed']);
  assert.equal(g.playCard(idOf(g, 'forest_life_heal_legendary')).ok, true);
  assert.equal(s.hp, s.maxHp);
  assert.equal(log[0].amount, 1);
});

test('兵士がいなくても、城が傷ついていれば城だけ回復する（soldierHealed は出ない）', () => {
  const g = make(['forest_life_heal_common']);
  g.players.p1.castle.hp -= 10;
  const log = recordEvents(g, ['castleHealed', 'soldierHealed']);
  assert.equal(g.playCard(idOf(g, 'forest_life_heal_common')).ok, true);
  assert.deepEqual(log.map((e) => e.event), ['castleHealed']);
});

test('城満タンで傷ついた兵士もいなければ出せない。兵士だけ傷ついていれば出せる', () => {
  const g = make(['infantry', 'forest_life_heal_common']);
  const id = idOf(g, 'forest_life_heal_common');
  assert.deepEqual([g.canPlayCard(id).ok, g.canPlayCard(id).reason], [false, '回復するものがありません']);
  const s = deploy(g, 2);
  assert.equal(g.canPlayCard(id).ok, true);
  assert.equal(g.playCard(id).ok, true);
  assert.equal(s.hp, 4);
});
