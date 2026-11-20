// ゲイルフォース（effect: pushBackEnemySoldiers）：相手の兵士を amount マス押し戻す魔法のテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { loadFixture, loadJson, seededRng, recordEvents } from './helpers.js';

const GALE = { name: 'ゲイルフォース', kind: 'spell', effect: 'pushBackEnemySoldiers', amount: 2, count: 2 };

function setup({ p1 = [], p2 = [], rules = {}, cards = {}, deck = Array(40).fill('heal') } = {}) {
  const base = { ...loadFixture('cards-step2.json'), galeForce: GALE };
  for (const [k, v] of Object.entries(cards)) base[k] = { ...base[k], ...v };
  const r = { ...loadFixture('rules.json'), laneCount: 2, laneLength: 5, ...rules };
  const game = new Game({ cards: base, rules: r, rng: seededRng(1) });
  game.debugSetHand('p1', p1);
  game.debugSetHand('p2', p2);
  game.debugSetDeck(deck);
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  return { game, log };
}
const idOf = (game, type) => {
  const pid = game.currentPlayer;
  return game.getState(pid).players[pid].hand.find((c) => c.type === type).cardId;
};
const soldiersOf = (game, pid) => game.getState(null).players[pid].soldiers;

/** p1 が歩兵（速さ2）を道 #1 に出して、1回進軍させる（位置2）。p2 の番で終わる */
function advanceInfantry(opts = {}) {
  const t = setup({ p1: ['infantry'], p2: ['galeForce'], ...opts });
  t.game.playCard(idOf(t.game, 'infantry'), { playerId: 'p2', roadId: 'p1-p2#1' });
  t.game.endTurn();
  t.game.endTurn(); // p2 は何もしない
  t.game.endTurn(); // p1 の進軍で歩兵は位置2へ
  return t;
}

test('ゲイルフォースは相手の兵士を2マス押し戻し、soldierMoved（cause: "pushed"）を出す', () => {
  const { game, log } = advanceInfantry();
  assert.equal(soldiersOf(game, 'p1')[0].position, 2);
  const id = idOf(game, 'galeForce');
  assert.deepEqual(game.getTargets(id), [{ playerId: 'p1' }]); // 全レーンなので、道は選ばない
  log.length = 0;
  assert.deepEqual(game.playCard(id), { ok: true });
  assert.equal(soldiersOf(game, 'p1')[0].position, 0);
  assert.deepEqual(log.map((e) => e.event), ['cardPlayed', 'spellCast', 'soldierMoved']);
  const moved = log[2];
  assert.equal(moved.playerId, 'p1');
  assert.equal(moved.roadId, 'p1-p2#1');
  assert.equal(moved.from, 2);
  assert.equal(moved.to, 0);
  assert.equal(moved.cause, 'pushed');
});

test('押し戻しは自分の城の前（マス0）で止まる。マス1の兵士は1マスだけ下がる', () => {
  const { game, log } = advanceInfantry({ cards: { infantry: { speed: 1 } } });
  assert.equal(soldiersOf(game, 'p1')[0].position, 1);
  log.length = 0;
  game.playCard(idOf(game, 'galeForce'));
  assert.equal(soldiersOf(game, 'p1')[0].position, 0);
  const moved = log.find((e) => e.event === 'soldierMoved');
  assert.equal(moved.from, 1);
  assert.equal(moved.to, 0);
});

test('押し戻された兵士は、次の進軍で下がった場所から進む', () => {
  const { game, log } = advanceInfantry();
  game.playCard(idOf(game, 'galeForce'));
  log.length = 0;
  game.endTurn(); // p1 の進軍
  const moved = log.find((e) => e.event === 'soldierMoved');
  assert.equal(moved.from, 0);
  assert.equal(moved.to, 2);
});

test('全レーンの兵士に効く。マス0の兵士は動かず、イベントも出ない', () => {
  const t = setup({ p1: ['infantry', 'infantry'], p2: ['galeForce'] });
  const { game, log } = t;
  game.playCard(idOf(game, 'infantry'), { playerId: 'p2', roadId: 'p1-p2#1' });
  game.endTurn();
  game.endTurn();
  game.playCard(idOf(game, 'infantry'), { playerId: 'p2', roadId: 'p1-p2#2' }); // 1体目は位置2、2体目は位置0
  game.endTurn();
  log.length = 0;
  game.playCard(idOf(game, 'galeForce'));
  assert.deepEqual(soldiersOf(game, 'p1').map((s) => s.position), [0, 0]);
  assert.equal(log.filter((e) => e.event === 'soldierMoved').length, 1);
});

test('押し戻せる兵士がいなければ出せない（理由を返す）', () => {
  const none = setup({ p1: ['galeForce'] });
  assert.deepEqual(none.game.canPlayCard(idOf(none.game, 'galeForce')), { ok: false, reason: '道の上に相手の兵士がいません' });

  const { game } = setup({ p1: ['infantry'], p2: ['galeForce'] });
  game.playCard(idOf(game, 'infantry'), { playerId: 'p2', roadId: 'p1-p2#1' });
  game.endTurn(); // p1 の歩兵は出したばかりで位置0
  assert.deepEqual(game.canPlayCard(idOf(game, 'galeForce')), { ok: false, reason: '押し戻せる兵士がいません（みんな城の前にいます）' });
});

test('scope: "lane" にすると、選んだ道の兵士だけを押し戻す', () => {
  const { game } = setup({ p1: ['infantry', 'infantry'], p2: ['galeForce'], cards: { galeForce: { scope: 'lane' } } });
  game.playCard(idOf(game, 'infantry'), { playerId: 'p2', roadId: 'p1-p2#1' });
  game.endTurn();
  game.endTurn();
  game.playCard(idOf(game, 'infantry'), { playerId: 'p2', roadId: 'p1-p2#2' }); // 1体目は位置2
  game.endTurn();
  game.endTurn();
  game.endTurn(); // 1体目は位置4、2体目は位置2
  const id = idOf(game, 'galeForce');
  assert.deepEqual(game.getTargets(id), [{ playerId: 'p1', roadId: 'p1-p2#1' }, { playerId: 'p1', roadId: 'p1-p2#2' }]);
  game.playCard(id, { playerId: 'p1', roadId: 'p1-p2#2' });
  assert.deepEqual(soldiersOf(game, 'p1').map((s) => [s.roadId, s.position]), [['p1-p2#1', 4], ['p1-p2#2', 0]]);
});

test('data/cards.json のゲイルフォースは、アンコモン・全レーン・2マス', () => {
  const def = loadJson('cards.json').galeForce;
  assert.equal(def.effect, 'pushBackEnemySoldiers');
  assert.equal(def.amount, 2);
  assert.equal(def.rarity, 'uncommon');
  assert.equal(def.scope, undefined);
});
