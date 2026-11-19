// バランス調整：城壁の永続（上限）・毒の期限と上限・コインカードの回数・王の財宝のデッキ上限
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { checkCostDeck } from '../js/game/Setup.js';
import { loadFixture, loadJson, seededRng } from './helpers.js';

function setup({ p1 = [], p2 = [], rules = {} } = {}) {
  const cards = {
    ...loadFixture('cards-step2.json'),
    toxin4: { name: '毒4', kind: 'spell', effect: 'poisonEnemy', amount: 4, count: 0 },
    coin1: { name: '小銭', kind: 'spell', effect: 'gainCoins', amount: 1, count: 0 },
    bigWall: { name: '大城壁', kind: 'defense', effect: 'armorCastle', amount: 30, count: 0 },
  };
  const game = new Game({ cards, rules: { ...loadFixture('rules.json'), ...rules }, rng: seededRng(1) });
  game.debugSetHand('p1', p1);
  game.debugSetHand('p2', p2);
  game.debugSetDeck(Array(30).fill('heal'));
  game.start();
  return game;
}
const idOf = (game, type) => {
  const pid = game.currentPlayer;
  return game.getState(pid).players[pid].hand.find((c) => c.type === type).cardId;
};
const play = (game, type) => game.playCard(idOf(game, type));
const me = (game, pid) => game.getState(pid).players[pid];

test('armorMax：城壁は次のターンも残り、足し算で、上限で止まる', () => {
  const game = setup({ p1: ['bigWall', 'bigWall', 'bigWall'], rules: { armorMax: 40 } });
  assert.equal(play(game, 'bigWall').ok, true);
  assert.equal(me(game, 'p1').armor, 30);
  assert.equal(play(game, 'bigWall').ok, true);
  assert.equal(me(game, 'p1').armor, 40);
  const r = play(game, 'bigWall');
  assert.equal(r.ok, false);
  game.endTurn(); game.endTurn();
  assert.equal(me(game, 'p1').armor, 40); // 自分のターンが来ても消えない
});

test('armorMax なしなら、従来どおり次のターンで消える', () => {
  const game = setup({ p1: ['bigWall'] });
  play(game, 'bigWall');
  game.endTurn(); game.endTurn();
  assert.equal(me(game, 'p1').armor, 0);
});

test('毒：量は poisonMax で止まる（城・兵士）', () => {
  const game = setup({ p1: ['toxin4', 'toxin4', 'toxin4'], rules: { poisonTurns: 5, poisonMax: 10 } });
  play(game, 'toxin4');
  game.endTurn(); game.endTurn();
  play(game, 'toxin4'); // 4 + 4 = 8
  assert.equal(me(game, 'p2').castlePoison, 8);
  game.endTurn(); game.endTurn();
  play(game, 'toxin4'); // 12 → 10
  assert.equal(me(game, 'p2').castlePoison, 10);
  assert.equal(me(game, 'p2').castlePoisonTurns, 5); // 重ねがけで残りターンも5に戻る
});

test('毒：poisonTurns 回ダメージしたら治る（城）', () => {
  const game = setup({ p1: ['toxin4'], rules: { poisonTurns: 5, poisonMax: 10 } });
  play(game, 'toxin4');
  let ticks = 0;
  for (let i = 0; i < 12 && me(game, 'p2').castlePoison; i++) {
    const before = me(game, 'p2').castleHp;
    game.endTurn(); // p2 のターンの始めに毒
    if (me(game, 'p2').castleHp < before) ticks += 1;
    game.debugSetHand(game.currentPlayer, ['heal']); // 手札上限の捨て札フェーズを避ける
    game.endTurn();
  }
  assert.equal(ticks, 5);
  assert.equal(me(game, 'p2').castlePoison, null);
});

test('coinCardsPerTurn：コインのカードは1ターンに1枚まで', () => {
  const game = setup({ p1: ['coin1', 'coin1'], rules: { coinCardsPerTurn: 1 } });
  assert.equal(play(game, 'coin1').ok, true);
  const r = play(game, 'coin1');
  assert.equal(r.ok, false);
  assert.match(r.reason, /1ターンに1枚/);
  game.endTurn(); game.endTurn();
  assert.equal(play(game, 'coin1').ok, true); // 次のターンは出せる
});

test('王の財宝はデッキ編成で1枚まで', () => {
  const cards = loadJson('cards.json');
  const rarities = loadJson('rarities.json');
  const rules = loadJson('rules.json');
  const two = checkCostDeck({ kingTreasure: 2, infantry: 10 }, cards, rarities, rules);
  assert.ok(two.problems.some((p) => p.includes('王の財宝') && p.includes('1枚まで')));
  const one = checkCostDeck({ kingTreasure: 1 }, cards, rarities, rules);
  assert.ok(!one.problems.some((p) => p.includes('王の財宝')));
});
