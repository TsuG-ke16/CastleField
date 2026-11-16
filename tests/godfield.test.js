// ゴッドフィールド風の変更：5枚まで補充（drawUntilHand）、反射・身代わり・天の恵み・神頼み・盗賊。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { loadFixture, seededRng, recordEvents } from './helpers.js';

const EXTRA = {
  reflect: { name: '反射', kind: 'defense', effect: 'reflectSpell', count: 1 },
  decoy: { name: '身代わり', kind: 'defense', effect: 'nullifySoldier', count: 1, exhaust: true },
  blessing: { name: '天の恵み', kind: 'spell', effect: 'redrawHand', count: 1 },
  prayer: { name: '神頼み', kind: 'spell', effect: 'randomEffect', count: 1 },
  thief: { name: '盗賊', kind: 'spell', effect: 'stealCard', count: 1, exhaust: true },
};

function setup({ p1 = [], p2 = [], deck = Array(30).fill('heal'), rules = {} } = {}) {
  const cards = { ...loadFixture('cards-step2.json'), ...EXTRA };
  const r = { ...loadFixture('rules.json'), defenseReaction: true, ...rules };
  const game = new Game({ cards, rules: r, rng: seededRng(1) });
  game.debugSetHand('p1', p1);
  game.debugSetHand('p2', p2);
  game.debugSetDeck(deck);
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  return { game, log };
}
const hand = (game, pid) => game.getState(pid).players[pid].hand;
const handId = (game, pid, type) => hand(game, pid).find((c) => c.type === type).cardId;

test('drawUntilHand：手札が足りないぶんだけ引く。多ければ drawPerTurn（1枚）', () => {
  const { game } = setup({ p1: [], p2: ['heal', 'heal', 'heal', 'heal', 'heal', 'heal'], rules: { drawUntilHand: 5 } });
  assert.equal(hand(game, 'p1').length, 5); // 0枚 → 5枚
  game.endTurn();
  assert.equal(hand(game, 'p2').length, 7); // 6枚 → 最低1枚引く
});

test('drawUntilHand を書かなければ、これまでどおり毎ターン drawPerTurn 枚', () => {
  const { game } = setup({ p1: [] });
  assert.equal(hand(game, 'p1').length, 1);
});

test('天の恵み：手札を全部捨てて、同じ枚数を引き直す', () => {
  const { game, log } = setup({ p1: ['blessing', 'infantry', 'knight'], deck: Array(30).fill('thunder') });
  const before = hand(game, 'p1').length; // 4（ドローぶん込み）
  assert.equal(game.playCard(handId(game, 'p1', 'blessing')).ok, true);
  const h = hand(game, 'p1');
  assert.equal(h.length, before - 1);
  assert.ok(h.every((c) => c.type === 'thunder'));
  assert.ok(log.some((e) => e.event === 'cardDiscarded' && e.playerId === 'p1'));
});

test('天の恵み：ほかに手札がなければ出せない', () => {
  const { game } = setup({ p1: ['blessing'], deck: Array(30).fill('thunder'), rules: {} });
  // ドローで1枚増えているので、いったん手札を blessing だけにする
  game.debugSetHand('p1', ['blessing']);
  assert.equal(game.canPlayCard(handId(game, 'p1', 'blessing')).reason, '引き直す手札がありません');
});

test('盗賊：相手の手札から1枚奪う。相手の手札が空なら出せない', () => {
  const { game, log } = setup({ p1: ['thief'], p2: ['fireball'] });
  assert.equal(game.getState('p1').players.p2.hand, null); // 相手の手札は見えない
  const p2count = game.getState('p2').players.p2.handCount;
  assert.equal(game.playCard(handId(game, 'p1', 'thief')).ok, true);
  assert.equal(game.getState('p2').players.p2.handCount, p2count - 1);
  const ev = log.find((e) => e.event === 'cardStolen');
  assert.deepEqual([ev.playerId, ev.victimId], ['p1', 'p2']);
  assert.ok(hand(game, 'p1').some((c) => c.cardId === ev.cardId));

  const t = setup({ p1: ['thief'], p2: [] });
  t.game.debugSetHand('p2', []);
  assert.equal(t.game.canPlayCard(handId(t.game, 'p1', 'thief')).reason, '手札を持っている相手がいません');
});

test('反射：城に当たる魔法を、撃った人の城に返す', () => {
  const { game, log } = setup({ p1: ['fireball'], p2: ['reflect'] });
  const s0 = game.getState(null).players;
  game.playCard(handId(game, 'p1', 'fireball'));
  assert.equal(game.getState(null).phase, 'defend');
  assert.equal(game.defend(handId(game, 'p2', 'reflect')).ok, true);
  const s = game.getState(null);
  assert.equal(s.phase, 'main');
  assert.equal(s.players.p2.castleHp, s0.p2.castleHp); // 受けた側は無傷
  assert.equal(s.players.p1.castleHp, s0.p1.castleHp - 8); // 撃った側が受ける
  assert.ok(log.some((e) => e.event === 'spellReflected'));
});

test('反射：兵士が城に着いたときには使えない', () => {
  const { game } = setup({ p1: [], p2: ['reflect'] });
  // 兵士を城の目の前まで送る
  game.debugSetHand('p1', ['knight']);
  game.playCard(handId(game, 'p1', 'knight'));
  for (let i = 0; i < 6 && game.getState(null).phase === 'main'; i++) {
    game.endTurn();
    if (game.getState(null).phase === 'defend') break;
    game.endTurn();
  }
  const s = game.getState(null);
  if (s.phase === 'defend') assert.equal(game.canDefend(handId(game, 'p2', 'reflect')).ok, false);
});

test('身代わり：城に着いた兵士のダメージを無効にする（兵士は消える）', () => {
  const { game, log } = setup({ p1: ['knight'], p2: ['decoy'], rules: { drawUntilHand: 0 } });
  game.playCard(handId(game, 'p1', 'knight'));
  const hp0 = game.getState(null).players.p2.castleHp;
  for (let i = 0; i < 8 && game.getState(null).phase !== 'defend'; i++) game.endTurn();
  assert.equal(game.getState(null).phase, 'defend');
  assert.equal(game.getState(null).defense.kind, 'castle');
  assert.equal(game.defend(handId(game, 'p2', 'decoy')).ok, true);
  const s = game.getState(null);
  assert.equal(s.players.p2.castleHp, hp0);
  assert.equal(s.players.p1.soldiers.length, 0);
  assert.ok(log.some((e) => e.event === 'soldierDecoyed'));
  assert.ok(log.some((e) => e.event === 'soldierDestroyed' && e.reason === 'reachedCastle'));
});

test('身代わり・反射は、自分のターンには出せない（理由つき）', () => {
  const { game } = setup({ p1: ['reflect', 'decoy'] });
  assert.equal(game.canPlayCard(handId(game, 'p1', 'reflect')).reason, '攻撃を受けたときにだけ使えます');
  assert.equal(game.canPlayCard(handId(game, 'p1', 'decoy')).reason, '攻撃を受けたときにだけ使えます');
});

test('神頼み：山の上の1枚をタダで出す（出せないカードは捨てるだけ）', () => {
  const { game, log } = setup({ p1: ['prayer'], deck: ['fireball', ...Array(30).fill('heal')] });
  // ドローで先頭の fireball は手札に入るので、並べ直す
  game.debugSetDeck(['fireball', 'heal']);
  const hp0 = game.getState(null).players.p2.castleHp;
  assert.equal(game.playCard(handId(game, 'p1', 'prayer')).ok, true);
  const free = log.find((e) => e.event === 'cardPlayed' && e.free);
  assert.equal(free.type, 'fireball');
  assert.ok(game.getState(null).players.p2.castleHp < hp0);
  assert.equal(game.getState(null).players.p1.playedThisTurn, true); // 神頼み自体がメインの1枚
});
