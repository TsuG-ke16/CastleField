// 弓兵・魔法使い（動かずに撃つ兵士）のテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { loadFixture, seededRng, recordEvents } from './helpers.js';

const RANGED = {
  archer: { name: '弓兵', kind: 'soldier', role: 'archer', hp: 3, attack: 3, range: 2, stay: 2, count: 1 },
  mage: { name: '魔法使い', kind: 'soldier', role: 'mage', hp: 3, attack: 2, range: 2, stay: 2, count: 1 },
};
const SLIME = { slime: { name: 'スライム', hp: 9, attack: 1, castleAttack: 1, attackEvery: 9, weight: 1, reward: 1 } };

function newGame({ monsters = null, rules = {} } = {}) {
  const game = new Game({
    cards: { ...loadFixture('cards.json'), ...RANGED },
    rules: { ...loadFixture('rules.json'), laneLength: 5, ...rules },
    monsters,
    rng: seededRng(1),
  });
  const log = recordEvents(game, EVENT_TYPES);
  game.debugSetDeck(Array(40).fill('heal'));
  return { game, log };
}

/** 手番の人が type のカードを出す */
function play(game, type, target) {
  const pid = game.currentPlayer;
  game.debugSetHand(pid, [type]);
  const r = game.playCard(game.players[pid].hand[0].cardId, target);
  assert.equal(r.ok, true, r.reason);
  return game.players[pid].soldiers.at(-1);
}

test('弓兵：動かずに2マス先までの相手を撃つ。反撃は受けず、2ターンで帰る', () => {
  const { game, log } = newGame();
  game.start();
  const archer = play(game, 'archer');
  game.endTurn();
  const foe = play(game, 'infantry'); // p2 の兵士：p1 から見て4マス先（射程の外）
  game.endTurn();
  // p1 のターン：射程の外なので撃たない（ターンは過ぎる）
  assert.equal(log.filter((e) => e.event === 'soldierShot').length, 0);
  assert.equal(archer.position, 0);
  assert.equal(archer.turnsLeft, 1);
  game.endTurn();
  foe.position = 2; // p1 から見て2マス先
  game.endTurn();
  const shot = log.find((e) => e.event === 'soldierShot');
  assert.deepEqual(shot.target, { kind: 'soldier', playerId: 'p2', soldierId: foe.soldierId });
  assert.equal(shot.amount, 3);
  const hit = log.find((e) => e.event === 'soldierDamaged' && e.soldierId === foe.soldierId);
  assert.equal(hit.cause, 'shot');
  assert.equal(archer.hp, 3); // 反撃は受けない
  const back = log.find((e) => e.event === 'soldierDestroyed' && e.soldierId === archer.soldierId);
  assert.equal(back.reason, 'returned');
  assert.equal(game.players.p1.soldiers.includes(archer), false);
});

test('魔法使い：相手の兵士がいれば兵士、いなければ城を撃つ', () => {
  const { game, log } = newGame();
  game.start();
  const mage = play(game, 'mage');
  game.endTurn();
  game.endTurn();
  const castleShot = log.find((e) => e.event === 'soldierShot');
  assert.deepEqual(castleShot.target, { kind: 'castle', playerId: 'p2' });
  assert.equal(game.players.p2.castle.hp, game.players.p2.castle.maxHp - 2);
  game.endTurn();
  const foe = play(game, 'infantry');
  foe.position = 3; // p1 から見て1マス先
  game.endTurn();
  const soldierShot = log.filter((e) => e.event === 'soldierShot')[1];
  assert.deepEqual(soldierShot.target, { kind: 'soldier', playerId: 'p2', soldierId: foe.soldierId });
  assert.equal(game.players.p1.soldiers.includes(mage), false); // 2ターンで帰った
});

test('弓兵：守りにも使える（向かってくる兵士は弓兵とぶつかって戦う）', () => {
  const { game, log } = newGame();
  game.start();
  const archer = play(game, 'archer');
  game.endTurn();
  const foe = play(game, 'infantry');
  foe.position = 3; // 弓兵（p2 から見て4マス先）の1つ手前
  game.advanceSoldiers(game.players.p2);
  const clash = log.find((e) => e.event === 'soldiersClashed');
  assert.deepEqual(clash.defender, { playerId: 'p1', soldierId: archer.soldierId });
});

test('弓兵：射程の中の魔物も撃てる（相手の兵士が先）', () => {
  const { game, log } = newGame({ monsters: SLIME, rules: { monsterFirstRound: 1, monsterSpawnChance: 1 } });
  game.start();
  assert.equal(game.monsters.length, 1); // 真ん中（マス2）
  play(game, 'archer');
  game.endTurn();
  game.endTurn();
  const shot = log.find((e) => e.event === 'soldierShot');
  assert.deepEqual(shot.target, { kind: 'monster', monsterId: game.monsters[0].monsterId });
  assert.equal(game.monsters[0].hp, 6);
});

test('弓兵・魔法使いのデータ：range と stay が必要で、speed は書けない', () => {
  const make = (def) => new Game({ cards: { ...loadFixture('cards.json'), x: def }, rules: { ...loadFixture('rules.json'), laneLength: 5 } });
  assert.throws(() => make({ name: 'x', kind: 'soldier', role: 'archer', hp: 1, attack: 1, stay: 2, count: 1 }), /range/);
  assert.throws(() => make({ name: 'x', kind: 'soldier', role: 'archer', hp: 1, attack: 1, range: 2, stay: 2, speed: 1, count: 1 }), /speed/);
  assert.throws(() => make({ name: 'x', kind: 'soldier', role: 'ninja', hp: 1, attack: 1, speed: 1, count: 1 }), /role/);
});
