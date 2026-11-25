// 魔族（4陣営モード）の CPU（smart）の選び方のテスト（CLAUDE.md「4陣営モード」の「魔族の CPU」）。
//   魂の欠片を出す／MP が足りなければ出さない／相手の城を落とせるときは先に出す／
//   種類（キー）が fac_demon_ で始まらないカードの動きは変えない（通常モードの吸血など）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/Game.js';
import { STRATEGIES } from '../js/game/strategies.js';
import { seededRng, buildData, loadOptionalData, PLAIN_START } from './helpers.js';

const SHARD = 'fac_demon_soul_shard';

function demonGame(rulesPatch = {}) {
  const { rules, cards } = buildData({ mode: 'factions', rules: { ...PLAIN_START, ...rulesPatch } });
  const opts = loadOptionalData('factions');
  const game = new Game({ cards, rules, rng: seededRng(5), ...opts, setup: { decks: ['demon', 'kingdom'] } });
  game.start();
  // 相手（王国）の手札は空にする（防御カードを引いていると防御待ちで止まる。魔族のカードが増えて山札の並びが変わったため）
  game.debugSetHand('p2', []);
  return { game, cards, rules };
}

const ctxOf = (cards, rules) => ({ cards, rules, discardCount: 0, upgrades: {}, onDefense: undefined });
const playedTypes = (game) => {
  const out = [];
  game.on('cardPlayed', (e) => out.push(e.type));
  return out;
};

test('魔族の CPU：魂の欠片を出す（敵城にダメージ、自城を回復）', () => {
  const { game, cards, rules } = demonGame();
  game.debugSetHand('p1', [SHARD]);
  game.debugSetCastleHp('p1', 40);
  const before = game.getState('p1').players;
  const played = playedTypes(game);
  STRATEGIES.smart.takeTurn(game, 'p1', seededRng(1), ctxOf(cards, rules));
  const after = game.getState('p1').players;
  assert.deepEqual(played, [SHARD]);
  assert.ok(after.p2.castleHp < before.p2.castleHp, '敵城が減る');
  assert.ok(after.p1.castleHp > before.p1.castleHp, '自城が増える');
});

test('魔族の CPU：MP が足りなければ魂の欠片を出さない', () => {
  const { game, cards, rules } = demonGame({ initialMp: 0, mpPerTurn: 0, secondPlayerMp: 0 });
  game.debugSetHand('p1', [SHARD]);
  const played = playedTypes(game);
  STRATEGIES.smart.takeTurn(game, 'p1', seededRng(1), ctxOf(cards, rules));
  assert.deepEqual(played, []);
});

test('魔族の CPU：相手の城を落とせるときは、ほかのカードより先に魂の欠片を出して勝つ', () => {
  const { game, cards, rules } = demonGame();
  game.debugSetHand('p1', ['fac_demon_poison_mist', 'fac_demon_curse_mark', SHARD]);
  game.debugSetCastleHp('p2', 3);
  const played = playedTypes(game);
  STRATEGIES.smart.takeTurn(game, 'p1', seededRng(1), ctxOf(cards, rules));
  assert.equal(played[0], SHARD);
  assert.equal(game.getState(null).winner, 'p1');
});

test('魔族の CPU：相手の城を落とせないときは、兵士を出してから魂の欠片（MP とメインの枠を先に食わない）', () => {
  const { game, cards, rules } = demonGame();
  game.debugSetHand('p1', [SHARD, 'fac_demon_imp']);
  const played = playedTypes(game);
  STRATEGIES.smart.takeTurn(game, 'p1', seededRng(1), ctxOf(cards, rules));
  assert.ok(played.includes('fac_demon_imp'), '兵士は出す');
  assert.ok(played.includes(SHARD));
  assert.ok(played.indexOf('fac_demon_imp') < played.indexOf(SHARD), '兵士が先');
});

test('魔族以外：通常モードの吸血（beast_vampire。同じ damageCastleAndHeal）を smart は今までどおり選ばない', () => {
  const { rules, cards } = buildData({ rules: PLAIN_START });
  const opts = loadOptionalData(null);
  const game = new Game({ cards, rules, rng: seededRng(5), ...opts });
  game.start();
  assert.equal(cards.beast_vampire.effect, 'damageCastleAndHeal');
  game.debugSetHand('p1', ['beast_vampire']);
  const played = playedTypes(game);
  STRATEGIES.smart.takeTurn(game, 'p1', seededRng(1), { cards, rules, discardCount: 0, upgrades: opts.upgrades ?? {} });
  assert.deepEqual(played, []);
});
