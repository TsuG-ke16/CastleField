import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/Game.js';
import { dropRates, validateRarities } from '../js/game/Setup.js';
import { filterEventFor } from '../js/game/visibility.js';
import { buildData, loadJson, loadOptionalData, recordEvents, seededRng } from './helpers.js';

const rarities = loadJson('rarities.json');
const make = (extra = {}) => {
  const { cards, rules } = buildData();
  return new Game({ cards, rules, rng: seededRng(3), ...loadOptionalData(), ...extra });
};

test('レアリティ：data の全カードに rarity があり、合成先は1つ上のレアリティ（レジェンドは合成先なし）', () => {
  const cards = loadJson('cards.json');
  const order = Object.keys(rarities);
  for (const [t, d] of Object.entries(cards)) {
    const i = order.indexOf(d.rarity);
    assert.ok(i >= 0, t);
    if (i === order.length - 1) assert.equal(d.fuseTo, undefined, t);
    else assert.equal(cards[d.fuseTo].rarity, order[i + 1], t);
  }
  for (const r of order) assert.ok(Object.values(cards).some((d) => d.rarity === r), `${r} のカードがある`);
});

test('排出率：カードごとの合計が100%、レアリティごとの合計が dropRate と一致する', () => {
  const cards = loadJson('cards.json');
  const rates = dropRates(cards, rarities);
  assert.ok(Math.abs(Object.values(rates).reduce((a, b) => a + b, 0) - 100) < 1e-9);
  for (const [id, r] of Object.entries(rarities)) {
    const sum = Object.entries(cards).filter(([, d]) => d.rarity === id).reduce((n, [t]) => n + rates[t], 0);
    assert.ok(Math.abs(sum - r.dropRate) < 1e-9, id);
  }
});

test('排出率：dropRate の合計が100でないと例外', () => {
  assert.throws(() => validateRarities({ a: { name: 'A', dropRate: 60 }, b: { name: 'B', dropRate: 60 } }), /100/);
});

test('山札：rules.deckSize 枚を排出率で作る（rarities なしなら count どおり）', () => {
  const g = make();
  const pile = g.pileOf('p1');
  assert.equal(pile.deck.length + 10, 100); // 初期手札5枚ずつ
  const { cards, rules } = buildData();
  const old = new Game({ cards, rules, rng: seededRng(3) });
  assert.equal(old.pileOf('p1').deck.length + 10, Object.values(cards).reduce((n, d) => n + d.count, 0));
});

test('合成：手札の同じカード2枚が、1つ上のレアリティの1枚になる', () => {
  const g = make();
  g.debugSetHand('p1', ['infantry', 'infantry', 'fireball']);
  g.start();
  const log = recordEvents(g, ['cardsFused']);
  const [a, b] = g.getState('p1').players.p1.hand.filter((c) => c.type === 'infantry').map((c) => c.cardId);
  assert.deepEqual(g.canFuse(a, b).ok, true);
  assert.equal(g.fuse(a, b).ok, true);
  const hand = g.getState('p1').players.p1.hand;
  assert.equal(hand.filter((c) => c.type === 'infantry').length, 0);
  assert.equal(hand.filter((c) => c.type === 'heavy').length, 1);
  assert.equal(log[0].from, 'infantry');
  assert.equal(log[0].to, 'heavy');
  assert.equal(g.getState('p1').players.p1.playedThisTurn, false); // メインの1枚には数えない
});

test('合成：違う種類・レジェンド・手札にないカード・相手の番は合成できない', () => {
  const g = make();
  g.debugSetHand('p1', ['infantry', 'fireball', 'hero', 'hero']);
  g.start();
  const h = g.getState('p1').players.p1.hand;
  const id = (t, n = 0) => h.filter((c) => c.type === t)[n].cardId;
  assert.match(g.fuse(id('infantry'), id('fireball')).reason, /同じ種類/);
  assert.match(g.fuse(id('hero', 0), id('hero', 1)).reason, /レジェンド/);
  assert.match(g.fuse(id('infantry'), 'c999').reason, /手札にありません/);
  assert.equal(g.fuse(id('infantry'), id('infantry')).ok, false);
});

test('合成：本人以外にはカードの中身を送らない', () => {
  const p = { playerId: 'p1', cardIds: ['c01', 'c02'], cardId: 'c03', from: 'infantry', to: 'heavy' };
  assert.deepEqual(filterEventFor('cardsFused', p, 'p2'), { playerId: 'p1' });
  assert.deepEqual(filterEventFor('cardsFused', p, 'p1'), p);
});
