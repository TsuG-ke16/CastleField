// 永続の毒（poisonEnemy）と解毒薬（curePoison）のテスト。固定データに、このテスト用のカードを足して使う。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { loadFixture, seededRng, recordEvents } from './helpers.js';

function setup({ p1 = [], p2 = [], extra = {}, rules = {} } = {}) {
  const cards = {
    ...loadFixture('cards-step2.json'),
    toxin1: { name: '毒1', kind: 'spell', effect: 'poisonEnemy', amount: 1, count: 0 },
    toxin5: { name: '毒5', kind: 'spell', effect: 'poisonEnemy', amount: 5, count: 0 },
    antidote: { name: '解毒薬', kind: 'spell', effect: 'curePoison', count: 0 },
    ...extra,
  };
  const game = new Game({ cards, rules: { ...loadFixture('rules.json'), ...rules }, rng: seededRng(1) });
  game.debugSetHand('p1', p1);
  game.debugSetHand('p2', p2);
  game.debugSetDeck(Array(30).fill('heal'));
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  return { game, log };
}
const idOf = (game, type) => {
  const pid = game.currentPlayer;
  return game.getState(pid).players[pid].hand.find((c) => c.type === type).cardId;
};
const play = (game, type, target) => game.playCard(idOf(game, type), target);
const castleHp = (game, pid) => game.getState(null).players[pid].castleHp;

test('毒は相手の城を永続の毒にし、相手のターンの始めに毎回ダメージ（城壁は効かない）', () => {
  const { game, log } = setup({ p1: ['toxin1'], p2: ['wall'] });
  assert.equal(play(game, 'toxin1').ok, true);
  assert.equal(game.getState('p1').players.p2.castlePoison, 1);
  assert.ok(log.some((e) => e.event === 'castlePoisoned' && e.playerId === 'p2' && e.amount === 1));
  const hp = castleHp(game, 'p2');
  game.endTurn(); // p2 のターンの始めに 1 ダメージ
  assert.equal(castleHp(game, 'p2'), hp - 1);
  const hit = log.filter((e) => e.event === 'castleDamaged' && e.source.kind === 'poison');
  assert.equal(hit.length, 1);
  assert.equal(hit[0].blocked, 0);
  game.endTurn(); game.endTurn(); // 次の p2 のターンにも（永続）
  assert.equal(castleHp(game, 'p2'), hp - 2);
});

test('毒は相手の兵士全員も永続の毒にする（ターン数で治らず、毎ターン進軍の前にダメージ）', () => {
  const { game } = setup({ p1: ['infantry'], p2: ['toxin5'] });
  game.playCard(idOf(game, 'infantry'));
  game.endTurn();
  assert.equal(play(game, 'toxin5').ok, true);
  const before = game.getState('p2').players.p1.soldiers[0];
  assert.deepEqual(before.statuses.poison, { amount: 5, turns: null });
  game.endTurn(); // p1 のターン：進軍の前に毒 5（歩兵 HP5 は倒れる）
  assert.equal(game.getState('p1').players.p1.soldiers.length, 0);
});

test('重ねがけは強い毒の方になる。同じかそれ以上の毒の相手には出せない', () => {
  const { game } = setup({ p1: ['toxin1', 'toxin5', 'toxin1'] });
  assert.equal(play(game, 'toxin1').ok, true);
  // メインは1ターン1枚
  game.endTurn(); game.endTurn();
  assert.equal(play(game, 'toxin5').ok, true);
  assert.equal(game.getState('p1').players.p2.castlePoison, 5);
  game.endTurn(); game.endTurn();
  assert.equal(game.canPlayCard(idOf(game, 'toxin1')).ok, false);
});

test('解毒薬は自分の毒（城・兵士）をすべて治す。メインを使わない', () => {
  const { game, log } = setup({ p1: ['toxin1', 'infantry'], p2: ['antidote', 'infantry'] });
  play(game, 'infantry');
  play(game, 'toxin1'); // p2 の城が毒に
  game.endTurn();
  play(game, 'infantry');
  game.endTurn();
  game.endTurn();
  // p2 の城は毒、p2 の兵士（あれば）も毒。解毒薬で全部治る
  assert.equal(game.getState('p2').players.p2.castlePoison, 1);
  assert.equal(play(game, 'antidote').ok, true);
  assert.equal(game.getState('p2').players.p2.castlePoison, null);
  assert.ok(log.some((e) => e.event === 'castleCured' && e.playerId === 'p2'));
  assert.equal(game.getState('p2').players.p2.playedThisTurn, false);
});

test('解毒薬は、毒にかかっていないと出せない', () => {
  const { game } = setup({ p1: ['antidote'] });
  const r = game.canPlayCard(idOf(game, 'antidote'));
  assert.equal(r.ok, false);
  assert.equal(r.reason, '毒にかかっているものがありません');
});

test('毒で城が落ちたら、そこで決着する', () => {
  const { game } = setup({ p1: ['toxin5'] });
  play(game, 'toxin5');
  game.debugSetCastleHp('p2', 5);
  game.endTurn();
  assert.equal(game.getState(null).phase, 'gameOver');
  assert.equal(game.getState(null).winner, 'p1');
});
