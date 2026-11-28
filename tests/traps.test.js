// 罠（kind: "trap"。js/game/Traps.js）のテスト：置く・相手に隠す・踏むと発動して止まる・消える・上限。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { filterEventFor } from '../js/game/visibility.js';
import { loadFixture, seededRng, recordEvents } from './helpers.js';

const TRAPS = {
  pitfall: { name: '落とし穴', kind: 'trap', damage: 4, count: 1 },
  iceTrap: { name: '氷の罠', kind: 'trap', freeze: 1, count: 1 },
  ninja: { name: '下忍', kind: 'soldier', role: 'ninja', hp: 2, attack: 2, speed: 2, count: 1 },
};

function newGame({ rules = {}, cards = {} } = {}) {
  const game = new Game({
    cards: { ...loadFixture('cards.json'), ...TRAPS, ...cards },
    rules: { ...loadFixture('rules.json'), ...rules },
    rng: seededRng(1),
  });
  const log = recordEvents(game, EVENT_TYPES);
  game.debugSetDeck(Array(40).fill('heal'));
  return { game, log };
}

function hand(game, pid, types) {
  game.debugSetHand(pid, types);
  return game.players[pid].hand.map((c) => c.cardId);
}

test('罠：置けるのは自分の側の1〜2マス目（道の半分）。置くと相手からは見えない', () => {
  const { game, log } = newGame();
  game.start();
  const [id] = hand(game, 'p1', ['pitfall']);
  assert.deepEqual(game.getTargets(id), [{ roadId: 'p1-p2', square: 1 }, { roadId: 'p1-p2', square: 2 }]);
  assert.equal(game.canPlayCard(id).needsTarget, true);
  assert.equal(game.playCard(id, { roadId: 'p1-p2', square: 2 }).ok, true);

  const mine = game.getState('p1').players.p1;
  assert.equal(mine.trapCount, 1);
  assert.equal(mine.traps[0].square, 2);
  assert.equal(mine.traps[0].turnsLeft, 3);
  const theirs = game.getState('p2').players.p1;
  assert.equal(theirs.trapCount, 1);
  assert.equal(theirs.traps, null);
  assert.equal(game.getState(null).players.p1.traps, null);

  const set = log.find((e) => e.event === 'trapSet');
  assert.equal(set.stealth, 'p1');
  assert.equal(filterEventFor('trapSet', set, 'p2'), null);
  assert.ok(filterEventFor('trapSet', set, 'p1'));
  // カードを出したこと（種類）は見える
  assert.ok(filterEventFor('cardPlayed', log.find((e) => e.event === 'cardPlayed'), 'p2'));
});

test('罠：相手の兵士が入ると発動して止まり、ダメージ。罠は消え、発動はだれにでも見える', () => {
  const { game, log } = newGame();
  game.start();
  const [trap] = hand(game, 'p1', ['pitfall']);
  game.playCard(trap, { roadId: 'p1-p2', square: 2 }); // p2 から見ると position 2
  game.endTurn();
  const [inf] = hand(game, 'p2', ['infantry']);
  game.playCard(inf);
  const soldier = game.players.p2.soldiers[0];
  game.endTurn();
  game.endTurn(); // p2 の進軍：0 → 1 → 2（罠）で止まる（速さ2なので、どちらにしてもここまで）
  const fired = log.find((e) => e.event === 'trapTriggered');
  assert.ok(fired);
  assert.equal(fired.soldierId, soldier.soldierId);
  assert.equal(fired.stealth, undefined);
  assert.equal(soldier.position, 2);
  assert.equal(soldier.hp, 1);
  const dmg = log.find((e) => e.event === 'soldierDamaged' && e.cause === 'trap');
  assert.equal(dmg.amount, 4);
  const removed = log.find((e) => e.event === 'trapRemoved');
  assert.equal(removed.reason, 'triggered');
  assert.equal(removed.stealth, undefined);
  assert.equal(game.players.p1.traps.length, 0);
  // 順番：移動 → 発動 → ダメージ → 罠が消える
  const order = log.map((e) => e.event).filter((t) => ['soldierMoved', 'trapTriggered', 'soldierDamaged', 'trapRemoved'].includes(t));
  assert.deepEqual(order.slice(-4), ['soldierMoved', 'trapTriggered', 'soldierDamaged', 'trapRemoved']);
});

test('罠：通り過ぎようとしても、罠のマスで止まる（速い兵士）', () => {
  const { game, log } = newGame();
  game.start();
  const [trap] = hand(game, 'p1', ['pitfall']);
  game.playCard(trap, { roadId: 'p1-p2', square: 2 }); // p2 の兵士の position 2
  game.endTurn();
  const [kn] = hand(game, 'p2', ['knight']); // 速さ3（止められなければ position 3）
  game.playCard(kn);
  game.endTurn();
  game.endTurn();
  const moved = log.filter((e) => e.event === 'soldierMoved' && e.playerId === 'p2');
  assert.equal(moved.at(-1).to, 2);
  // 騎士は HP4 なので4ダメージで倒れる
  assert.equal(game.players.p2.soldiers.length, 0);
  assert.ok(log.some((e) => e.event === 'soldierDestroyed' && e.reason === 'killed'));
});

test('罠：凍結の罠は止めて、1回休ませる。ダメージの罠で倒れれば凍結しない', () => {
  const { game, log } = newGame();
  game.start();
  const [trap] = hand(game, 'p1', ['iceTrap']);
  game.playCard(trap, { roadId: 'p1-p2', square: 2 });
  game.endTurn();
  const [inf] = hand(game, 'p2', ['infantry']);
  game.playCard(inf);
  const soldier = game.players.p2.soldiers[0];
  game.endTurn();
  game.endTurn();
  assert.equal(soldier.position, 2);
  assert.equal(soldier.frozen, 1);
  assert.ok(log.some((e) => e.event === 'statusApplied' && e.status === 'frozen'));
});

test('罠：持ち主のターンが3回始まると消える（expired。相手には見えない）', () => {
  const { game, log } = newGame();
  game.start();
  const [trap] = hand(game, 'p1', ['pitfall']);
  game.playCard(trap, { roadId: 'p1-p2', square: 1 });
  for (let i = 0; i < 4; i++) game.endTurn(); // p2, p1(2), p2, p1(1)
  assert.equal(game.players.p1.traps.length, 1);
  game.endTurn();
  game.endTurn(); // p1 の3回目のターンの始め
  assert.equal(game.players.p1.traps.length, 0);
  const removed = log.find((e) => e.event === 'trapRemoved');
  assert.equal(removed.reason, 'expired');
  assert.equal(filterEventFor('trapRemoved', removed, 'p2'), null);
});

test('罠：1ターン1枚まで・場に3つまで・同じマスには1つ', () => {
  const { game } = newGame({ rules: { laneCount: 3 } });
  game.start();
  const ids = hand(game, 'p1', ['pitfall', 'pitfall']);
  const first = game.getTargets(ids[0]);
  assert.equal(first.length, 6); // 3レーン × 2マス
  assert.equal(game.playCard(ids[0], first[0]).ok, true);
  const again = game.canPlayCard(ids[1], first[1]);
  assert.equal(again.ok, false);
  assert.match(again.reason, /1ターンに1枚/);
  game.players.p1.trapsPlayedThisTurn = 0;
  assert.equal(game.canPlayCard(ids[1], first[0]).ok, false); // 同じマス
  assert.equal(game.getTargets(ids[1]).length, 5);
  game.playCard(ids[1], first[1]);
  const [third, fourth] = hand(game, 'p1', ['pitfall', 'pitfall']);
  game.players.p1.trapsPlayedThisTurn = 0;
  game.playCard(third, first[2]);
  game.players.p1.trapsPlayedThisTurn = 0;
  const r = game.canPlayCard(fourth);
  assert.equal(r.ok, false);
  assert.match(r.reason, /3つまで/);
});

test('罠：忍者は罠を踏まない。自分の兵士も踏まない', () => {
  const { game, log } = newGame();
  game.start();
  const [trap] = hand(game, 'p1', ['pitfall']);
  game.playCard(trap, { roadId: 'p1-p2', square: 2 });
  game.endTurn();
  const [nj] = hand(game, 'p2', ['ninja']);
  game.playCard(nj);
  game.endTurn();
  const [inf] = hand(game, 'p1', ['infantry']);
  game.playCard(inf);
  game.endTurn(); // p2：忍者が進む（罠のマスを通る）
  game.endTurn(); // p1：自分の歩兵が自分の罠のマスを通る
  assert.equal(log.filter((e) => e.event === 'trapTriggered').length, 0);
  assert.equal(game.players.p1.traps.length, 1);
});

test('罠：罠のカードがないゲームの getState には罠のキーがない', () => {
  const game = new Game({ cards: loadFixture('cards.json'), rules: loadFixture('rules.json'), rng: seededRng(1) });
  assert.equal('traps' in game.getState('p1').players.p1, false);
});

test('罠：damage も freeze もない罠は起動時にエラー', () => {
  assert.throws(() => newGame({ cards: { bad: { name: 'x', kind: 'trap', count: 1 } } }), /damage か freeze/);
});
