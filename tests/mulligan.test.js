// マリガン（初期手札の引き直し）：start() の前に1人1回。選んだカードを山札に戻して、同じ枚数を引き直す。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/Game.js';
import { loadFixture, seededRng } from './helpers.js';

function setup({ p1 = ['infantry', 'infantry', 'fireball'], deck = ['heal', 'heal', 'thunder', 'knight'] } = {}) {
  const game = new Game({ cards: loadFixture('cards.json'), rules: loadFixture('rules.json'), rng: seededRng(1) });
  game.debugSetHand('p1', p1);
  game.debugSetDeck(deck, 'p1');
  return game;
}
const hand = (game, pid = 'p1') => game.getState(pid).players[pid].hand;
const ids = (game, type) => hand(game).filter((c) => c.type === type).map((c) => c.cardId);

test('選んだカードを戻し、山札の上から同じ枚数を引く（戻したカードは引かない）', () => {
  const game = setup();
  const back = ids(game, 'infantry');
  assert.deepEqual(game.mulligan('p1', back), { ok: true });
  const after = hand(game);
  assert.equal(after.length, 3);
  assert.deepEqual(after.map((c) => c.type).sort(), ['fireball', 'heal', 'heal']);
  assert.ok(back.every((id) => !after.some((c) => c.cardId === id)));
  const state = game.getState('p1');
  assert.equal(state.players.p1.mulliganUsed, true);
  assert.equal(state.deckCount, 4); // 2枚引いて2枚戻した
});

test('1人1回だけ。空の配列でも「引き直さない」と決めたことになる', () => {
  const game = setup();
  assert.equal(game.mulligan('p1', []).ok, true);
  assert.equal(game.mulligan('p1', ids(game, 'fireball')).ok, false);
  assert.equal(game.mulligan('p2', []).ok, true);
});

test('start() のあとは使えない', () => {
  const game = setup();
  game.start();
  const r = game.mulligan('p1', ids(game, 'fireball'));
  assert.equal(r.ok, false);
  assert.match(r.reason, /始まる前/);
});

test('手札にないカード・重複・配列でないものは断る（手札は変わらない）', () => {
  const game = setup();
  const before = hand(game).map((c) => c.cardId);
  const [a] = ids(game, 'infantry');
  assert.equal(game.mulligan('p1', [a, a]).ok, false);
  assert.equal(game.mulligan('p1', ['nope']).ok, false);
  assert.equal(game.mulligan('p1', 'x').ok, false);
  assert.equal(game.mulligan('p9', []).ok, false);
  assert.deepEqual(hand(game).map((c) => c.cardId), before);
  assert.equal(game.getState('p1').players.p1.mulliganUsed, false);
});

test('山札が戻す枚数より少なくても、同じ枚数を持って終わる', () => {
  const game = setup({ deck: ['heal'] });
  assert.equal(game.mulligan('p1', hand(game).map((c) => c.cardId)).ok, true);
  assert.equal(hand(game).length, 3);
  assert.equal(game.getState('p1').deckCount, 1);
});
