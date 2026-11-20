// コイントス（先攻）・後攻の補正・マリガンのテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { filterEventFor } from '../js/game/visibility.js';
import { mulliganChoice } from '../js/game/strategies.js';
import { loadFixture, seededRng, recordEvents } from './helpers.js';

function make({ rules = {}, setup } = {}) {
  const cards = loadFixture('cards-step2.json');
  return new Game({ cards, rules: { ...loadFixture('rules.json'), ...rules }, rng: seededRng(3), setup });
}

test('先攻は setup.firstPlayer。周回は先攻のターンで増える', () => {
  const game = make({ setup: { firstPlayer: 'p2' } });
  const log = recordEvents(game, ['turnStarted', 'roundStarted']);
  game.start();
  assert.deepEqual(log.slice(0, 2).map((e) => [e.event, e.playerId ?? e.round]), [['turnStarted', 'p2'], ['roundStarted', 1]]);
  assert.equal(game.getState(null).firstPlayer, 'p2');
  game.endTurn(); // p1（周回はそのまま）
  game.endTurn(); // p2 で周回2
  assert.deepEqual(log.filter((e) => e.event === 'roundStarted').map((e) => e.round), [1, 2]);
  assert.equal(game.getState(null).currentPlayer, 'p2');
});

test('setup.firstPlayer がいない席・チーム戦で席順以外なら例外', () => {
  assert.throws(() => make({ setup: { firstPlayer: 'p3' } }), /firstPlayer/);
  assert.throws(() => make({ rules: { playerCount: 4 }, setup: { firstPlayer: 'p2', teams: ['t1', 't2', 't1', 't2'] } }), /チーム戦/);
});

test('後攻の補正：先攻以外の人は、初期手札が多く、最初から城壁を持つ', () => {
  const game = make({ rules: { secondPlayerHandBonus: 1, secondPlayerArmor: 5 }, setup: { firstPlayer: 'p2' } });
  const st = game.getState(null);
  assert.deepEqual([st.players.p1.handCount, st.players.p1.armor], [6, 5]);
  assert.deepEqual([st.players.p2.handCount, st.players.p2.armor], [5, 0]);
});

test('マリガン：全員が選ぶまで始まらない。選んだカードを山札に戻して同じ枚数を引き直す。1人1回', () => {
  const game = make({ rules: { mulligan: true } });
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  let st = game.getState(null);
  assert.equal(st.phase, 'mulligan');
  assert.deepEqual(st.mulligan, { pending: ['p1', 'p2'] });
  assert.deepEqual(log.map((e) => e.event), ['mulliganStarted']);
  const hand = game.getState('p1').players.p1.hand;
  assert.equal(game.playCard(hand[0].cardId).reason, '最初の手札を選んでいるところです');
  assert.equal(game.endTurn().reason, '最初の手札を選んでいるところです');
  assert.equal(game.mulligan('p1', ['zzz']).ok, false);

  const back = hand.slice(0, 2).map((c) => c.cardId);
  assert.deepEqual(game.mulligan('p1', back), { ok: true });
  const done = log.find((e) => e.event === 'mulliganDone');
  assert.deepEqual([done.playerId, done.count, done.returnedIds], ['p1', 2, back]);
  assert.equal(game.getState('p1').players.p1.handCount, 5);
  assert.equal(game.mulligan('p1', []).reason, '手札の引き直しはもう選びました');
  assert.equal(game.getState(null).phase, 'mulligan');

  assert.deepEqual(game.mulligan('p2', []), { ok: true });
  st = game.getState(null);
  assert.equal(st.phase, 'main');
  assert.equal(st.mulligan, null);
  assert.equal(log.at(-1).event === 'turnStarted' || log.some((e) => e.event === 'turnStarted' && e.playerId === 'p1'), true);
});

test('マリガン：ほかの人には、引き直した枚数だけ見せる', () => {
  const payload = { playerId: 'p1', count: 2, returnedIds: ['c01', 'c02'], cardIds: ['c11', 'c12'] };
  assert.deepEqual(filterEventFor('mulliganDone', payload, 'p2'), { playerId: 'p1', count: 2 });
  assert.deepEqual(filterEventFor('mulliganDone', payload, 'p1'), payload);
});

test('マリガン中に降参したら（2人）、相手の勝ち', () => {
  const game = make({ rules: { mulligan: true } });
  game.start();
  game.surrender('p2');
  assert.deepEqual([game.getState(null).phase, game.getState(null).winner], ['gameOver', 'p1']);
});

test('CPU のマリガン：兵士が1枚もない手札なら全部戻す、あれば戻さない', () => {
  const game = make({ rules: { mulligan: true } });
  game.debugSetHand('p1', ['heal', 'heal', 'fireball']);
  game.debugSetHand('p2', ['infantry', 'heal']);
  const ctx = { cards: loadFixture('cards-step2.json') };
  assert.equal(mulliganChoice(game, 'p1', ctx).length, 3);
  assert.deepEqual(mulliganChoice(game, 'p2', ctx), []);
});
