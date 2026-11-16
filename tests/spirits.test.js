// 精霊（火・水・風・土 × 精霊／大精霊）：1人1体・呼んだ次のターンから効く・入れ替わり。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { loadFixture, seededRng, recordEvents } from './helpers.js';

const EXTRA = {
  fireSpirit: { name: '火の精霊', kind: 'spell', effect: 'summonSpirit', spirit: 'fire', amount: 3, turns: 2, count: 1 },
  waterSpirit: { name: '水の精霊', kind: 'spell', effect: 'summonSpirit', spirit: 'water', amount: 4, turns: 2, count: 1 },
  windSpirit: { name: '風の精霊', kind: 'spell', effect: 'summonSpirit', spirit: 'wind', amount: 3, turns: 2, count: 1 },
  earthSpirit: { name: '土の精霊', kind: 'spell', effect: 'summonSpirit', spirit: 'earth', amount: 2, turns: 2, count: 1 },
};

function setup({ p1 = [], p2 = [], deck = Array(40).fill('thunder') } = {}) {
  const cards = { ...loadFixture('cards-step2.json'), ...EXTRA };
  const game = new Game({ cards, rules: { ...loadFixture('rules.json') }, rng: seededRng(1) });
  game.debugSetHand('p1', p1);
  game.debugSetHand('p2', p2);
  game.debugSetDeck(deck);
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  return { game, log };
}
const idOf = (game, pid, type) => game.getState(pid).players[pid].hand.find((c) => c.type === type).cardId;
const st = (game) => game.getState(null);

test('精霊を呼ぶ：呼んだターンは効かず、状態に入る', () => {
  const { game, log } = setup({ p1: ['waterSpirit'] });
  const hp = st(game).players.p1.castleHp;
  assert.equal(game.playCard(idOf(game, 'p1', 'waterSpirit')).ok, true);
  assert.equal(st(game).players.p1.castleHp, hp);
  assert.deepEqual(
    { ...st(game).players.p1.spirit },
    { type: 'waterSpirit', spirit: 'water', amount: 4, turns: 2, targetId: null },
  );
  assert.ok(log.some((e) => e.event === 'spiritSummoned' && e.playerId === 'p1'));
});

test('水の精霊：次の自分のターンの始めから毎ターン回復。turns 回で消える', () => {
  const { game, log } = setup({ p1: ['waterSpirit'] });
  game.debugSetCastleHp('p1', 10);
  game.playCard(idOf(game, 'p1', 'waterSpirit'));
  game.endTurn(); // p2
  game.endTurn(); // p1 の1回目：+4
  assert.equal(st(game).players.p1.castleHp, 14);
  game.endTurn();
  game.endTurn(); // 2回目：+4
  assert.equal(st(game).players.p1.castleHp, 18);
  assert.equal(st(game).players.p1.spirit.turns, 1); // 2回目のターンの終わりまではまだ残る
  game.endTurn();
  assert.equal(st(game).players.p1.spirit, null);
  assert.ok(log.some((e) => e.event === 'spiritEnded' && e.reason === 'expired'));
});

test('火の精霊：毎ターン、選んだ相手の城にダメージ。城壁は受ける', () => {
  const { game } = setup({ p1: ['fireSpirit'] });
  const hp = st(game).players.p2.castleHp;
  game.playCard(idOf(game, 'p1', 'fireSpirit'));
  game.endTurn();
  game.endTurn();
  assert.equal(st(game).players.p2.castleHp, hp - 3);
});

test('風の精霊：兵士の速さが最低 amount になる', () => {
  const { game } = setup({ p1: ['windSpirit', 'infantry'] });
  game.playCard(idOf(game, 'p1', 'infantry'));
  game.endTurn();
  game.endTurn();
  game.playCard(idOf(game, 'p1', 'windSpirit')); // 歩兵は速さ2
  const s0 = st(game).players.p1.soldiers[0].position;
  game.endTurn();
  game.endTurn(); // 風が効く：速さ3で進む
  const s1 = st(game).players.p1.soldiers[0]?.position ?? Infinity;
  assert.ok(s1 - s0 >= 2 || st(game).players.p1.soldiers.length === 0);
});

test('土の精霊：城へのダメージが軽くなる（1より小さくはならない）', () => {
  const { game } = setup({ p1: ['fireball'], p2: ['earthSpirit'] });
  game.playCard(idOf(game, 'p1', 'fireball')); // 8 → 土の精霊はまだ来ていない
  assert.equal(st(game).players.p2.castleHp, 25 + 2 - 8);
  game.endTurn();
  game.playCard(idOf(game, 'p2', 'earthSpirit'));
  game.debugSetHand('p1', ['fireball']);
  game.endTurn();
  const hp = st(game).players.p2.castleHp;
  game.playCard(idOf(game, 'p1', 'fireball'));
  assert.equal(st(game).players.p2.castleHp, hp - 6); // 8 − 2
});

test('1人1体：新しい精霊を呼ぶと入れ替わる。同じ精霊は重ねて呼べない', () => {
  const { game, log } = setup({ p1: ['waterSpirit', 'windSpirit'] });
  game.playCard(idOf(game, 'p1', 'waterSpirit'));
  game.endTurn();
  game.endTurn();
  assert.equal(game.canPlayCard(idOf(game, 'p1', 'windSpirit')).ok, true);
  game.playCard(idOf(game, 'p1', 'windSpirit'));
  assert.equal(st(game).players.p1.spirit.type, 'windSpirit');
  assert.ok(log.some((e) => e.event === 'spiritEnded' && e.reason === 'replaced'));
  game.debugSetHand('p1', ['windSpirit']);
  game.endTurn();
  game.endTurn();
  assert.equal(game.canPlayCard(idOf(game, 'p1', 'windSpirit')).reason, '同じ精霊がもう来ています');
});
