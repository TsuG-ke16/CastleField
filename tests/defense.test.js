// 攻撃を受けたときの防御（rules.defenseReaction）のテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { loadFixture, seededRng, recordEvents } from './helpers.js';

function setup({ p1 = [], p2 = [], deck = Array(30).fill('heal'), rules = {}, start = true } = {}) {
  const cards = loadFixture('cards-step2.json');
  const r = { ...loadFixture('rules.json'), defenseReaction: true, ...rules };
  const game = new Game({ cards, rules: r, rng: seededRng(1) });
  game.debugSetHand('p1', p1);
  game.debugSetHand('p2', p2);
  game.debugSetDeck(deck);
  const log = recordEvents(game, EVENT_TYPES);
  if (start) game.start();
  return { game, log };
}
const handId = (game, pid, type) => game.getState(pid).players[pid].hand.find((c) => c.type === type).cardId;
const events = (log) => log.map((e) => e.event);

test('defenseReaction を書かなければ、これまでどおり聞かずに当たる', () => {
  const { game, log } = setup({ p1: ['fireball'], p2: ['wall'], rules: { defenseReaction: undefined } });
  game.playCard(handId(game, 'p1', 'fireball'));
  assert.equal(game.getState(null).phase, 'main');
  assert.equal(log.find((e) => e.event === 'castleDamaged').blocked, 0);
});

test('城に当たる魔法：城壁を持っている人には聞く。出せば城壁が受ける', () => {
  const { game, log } = setup({ p1: ['fireball'], p2: ['wall', 'shield'] });
  const hp0 = game.getState(null).players.p2.castleHp;
  game.playCard(handId(game, 'p1', 'fireball'));
  const s = game.getState(null);
  assert.equal(s.phase, 'defend');
  assert.deepEqual(s.defense, { defenderId: 'p2', attackerId: 'p1', kind: 'castle', amount: 8, soldierIds: [] });
  assert.equal(events(log).includes('castleDamaged'), false); // まだ当たっていない
  // 受ける前は、攻める側は何もできない
  assert.equal(game.endTurn().reason, '相手が防御を選んでいます');
  // 盾は城には使えない。城壁は出せる
  assert.equal(game.canDefend(handId(game, 'p2', 'shield')).ok, false);
  assert.equal(game.defend(handId(game, 'p2', 'wall')).ok, true);
  const dmg = log.find((e) => e.event === 'castleDamaged');
  assert.equal(dmg.blocked, 5);
  assert.equal(dmg.hp, hp0 - 3);
  assert.equal(game.getState(null).phase, 'main'); // 盾は出せないので、自動で当たって攻撃した人のターンに戻る
  assert.deepEqual(events(log).slice(-6), ['spellCast', 'defenseRequested', 'cardPlayed', 'castleArmored', 'defenseEnded', 'castleDamaged']);
});

test('防御しない（passDefense）と、そのまま当たる', () => {
  const { game, log } = setup({ p1: ['fireball'], p2: ['wall', 'wall'] });
  const hp0 = game.getState(null).players.p2.castleHp;
  game.playCard(handId(game, 'p1', 'fireball'));
  assert.equal(game.passDefense().ok, true);
  assert.equal(log.find((e) => e.event === 'castleDamaged').blocked, 0);
  assert.equal(game.getState(null).players.p2.castleHp, hp0 - 8);
  assert.equal(game.passDefense().ok, false);
});

test('出せる防御カードが手札になければ、聞かない', () => {
  const { game } = setup({ p1: ['fireball'], p2: ['infantry', 'shield'] }); // 盾は城には使えない
  const hp0 = game.getState(null).players.p2.castleHp;
  game.playCard(handId(game, 'p1', 'fireball'));
  assert.equal(game.getState(null).phase, 'main');
  assert.equal(game.getState(null).players.p2.castleHp, hp0 - 8);
});

test('防御カードは何枚でも出せる。出せるものがなくなるまで待つ', () => {
  const { game } = setup({ p1: ['fireball'], p2: ['wall', 'wall'] });
  game.playCard(handId(game, 'p1', 'fireball'));
  assert.equal(game.defend(handId(game, 'p2', 'wall')).ok, true);
  // 同じ城壁は重ならないので、2枚目は出せず、自動で当たる
  assert.equal(game.getState(null).phase, 'main');
});

test('サンダー：盾を出すと、盾が先に受ける', () => {
  const { game, log } = setup({ p1: ['infantry', 'shield'], p2: ['thunder'] });
  game.playCard(handId(game, 'p1', 'infantry'));
  game.endTurn();
  game.playCard(handId(game, 'p2', 'thunder'));
  assert.equal(game.getState(null).phase, 'defend');
  const soldierId = game.getState(null).players.p1.soldiers[0].soldierId;
  const shieldId = handId(game, 'p1', 'shield');
  assert.equal(game.canDefend(shieldId).ok, true);
  assert.equal(game.defend(shieldId, { soldierId }).ok, true);
  const hit = log.filter((e) => e.event === 'soldierDamaged').at(-1);
  assert.equal(hit.blocked, 3);
  assert.equal(game.getState(null).players.p1.soldiers[0].hp, 5);
});

test('兵士が城に着くとき：防御のあとに、残りの兵士の進軍が続く', () => {
  const { game, log } = setup({ p1: ['knight', 'knight'], p2: ['wall'], rules: { laneLength: 3 } });
  game.playCard(handId(game, 'p1', 'knight'));
  game.endTurn();
  game.endTurn(); // p2
  // p1 の次の手番：knight は3マスで城に着く
  game.endTurn();
  game.endTurn();
  const s = game.getState(null);
  assert.equal(s.phase, 'defend');
  assert.equal(s.currentPlayer, 'p1');
  assert.equal(s.defense.kind, 'castle');
  assert.equal(game.passDefense().ok, true);
  assert.equal(log.filter((e) => e.event === 'soldierDestroyed' && e.reason === 'reachedCastle').length, 1);
  assert.equal(game.getState(null).phase, 'main');
});

test('防御を挟んでも、城が落ちたら決着する', () => {
  const { game, log } = setup({ p1: ['fireball'], p2: ['wall'] });
  game.debugSetCastleHp('p2', 6);
  game.playCard(handId(game, 'p1', 'fireball'));
  assert.equal(game.passDefense().ok, true);
  assert.equal(game.getState(null).phase, 'gameOver');
  assert.equal(game.getState(null).winner, 'p1');
  assert.equal(log.filter((e) => e.event === 'gameOver').length, 1);
});

test('城壁で一部を受けても、残りで城が落ちれば決着する', () => {
  const { game } = setup({ p1: ['fireball'], p2: ['wall'] });
  game.debugSetCastleHp('p2', 3);
  game.playCard(handId(game, 'p1', 'fireball'));
  game.defend(handId(game, 'p2', 'wall'));
  assert.equal(game.getState(null).phase, 'gameOver'); // 8 − 5 = 3 で城HP3は0になる
});

test('防御を待っている間も、降参はできる', () => {
  const { game } = setup({ p1: ['fireball'], p2: ['wall'] });
  game.playCard(handId(game, 'p1', 'fireball'));
  assert.equal(game.surrender('p2').ok, true);
  assert.equal(game.getState(null).phase, 'gameOver');
  assert.equal(game.getState(null).defense, null);
});

test('毒・凍結は防御カードで防げないので、聞かない', () => {
  const { game } = setup({ p1: ['infantry'], p2: ['poisonMist', 'frostBreath', 'shield'] });
  game.playCard(handId(game, 'p1', 'infantry'));
  game.endTurn();
  game.playCard(handId(game, 'p2', 'poisonMist'));
  assert.equal(game.getState(null).phase, 'main'); // p1 は盾を持っていても、毒は防げないので聞かない
  assert.equal(game.getState(null).players.p1.soldiers[0].statuses.poison !== null, true);
});
