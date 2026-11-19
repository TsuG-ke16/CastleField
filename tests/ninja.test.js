// 忍者（role: "ninja"）のテスト：相手から見えない・相手の兵士とは戦わずにすり抜ける。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { filterEventFor } from '../js/game/visibility.js';
import { loadFixture, seededRng, recordEvents } from './helpers.js';

const EXTRA = {
  ninja: { name: '下忍', kind: 'soldier', role: 'ninja', hp: 2, attack: 2, speed: 2, count: 1 },
  archer: { name: '弓兵', kind: 'soldier', role: 'archer', hp: 3, attack: 3, range: 2, stay: 2, count: 1 },
};
const SLIME = { slime: { name: 'スライム', hp: 9, attack: 1, castleAttack: 1, attackEvery: 9, weight: 1, reward: 1 } };

function newGame({ monsters = null, rules = {} } = {}) {
  const game = new Game({
    cards: { ...loadFixture('cards.json'), ...EXTRA },
    rules: { ...loadFixture('rules.json'), laneLength: 5, ...rules },
    monsters,
    rng: seededRng(1),
  });
  const log = recordEvents(game, EVENT_TYPES);
  game.debugSetDeck(Array(40).fill('heal'));
  return { game, log };
}

function play(game, type, target) {
  const pid = game.currentPlayer;
  game.debugSetHand(pid, [type]);
  const r = game.playCard(game.players[pid].hand[0].cardId, target);
  assert.equal(r.ok, true, r.reason);
  return game.players[pid].soldiers.at(-1);
}

test('忍者：相手の getState には出ない。自分（持ち主）には見える', () => {
  const { game } = newGame();
  game.start();
  const ninja = play(game, 'ninja');
  assert.ok(game.getState('p1').players.p1.soldiers.some((s) => s.soldierId === ninja.soldierId));
  assert.equal(game.getState('p2').players.p1.soldiers.length, 0);
  assert.equal(game.getState(null).players.p1.soldiers.length, 0);
  assert.equal(game.getState('p1').players.p1.soldiers[0].role, 'ninja');
});

test('忍者：相手の兵士とは戦わずにすり抜けて城を攻める（相手の兵士も忍者を止めない）', () => {
  const { game, log } = newGame();
  game.start();
  const ninja = play(game, 'ninja');
  game.endTurn();
  const foe = play(game, 'infantry'); // p2 の歩兵
  foe.position = 2; // 道の真ん中で向かい合う
  game.endTurn();
  // p1 のターン：忍者は2マス進む。歩兵とぶつからない
  assert.equal(log.filter((e) => e.event === 'soldiersClashed').length, 0);
  assert.equal(ninja.position, 2);
  game.endTurn(); // p2 の歩兵も忍者と戦わずに進む
  assert.equal(log.filter((e) => e.event === 'soldiersClashed').length, 0);
  const before = game.players.p2.castle.hp;
  game.endTurn(); // p1：忍者は 2 → 4 → 城（5）には届かない
  game.endTurn();
  game.endTurn(); // p1：城に着く
  assert.ok(game.players.p2.castle.hp < before, '城にダメージ');
  const hit = log.find((e) => e.event === 'castleDamaged' && e.source?.soldierId === ninja.soldierId);
  assert.equal(hit.stealth, undefined, '城へのダメージは相手にも見える');
});

test('忍者：弓兵に撃たれず、妖術（魔法）の的にもならない。魔物には止められる', () => {
  const { game, log } = newGame();
  game.start();
  game.endTurn();
  const archer = play(game, 'archer'); // p2 の弓兵
  game.endTurn();
  const ninja = play(game, 'ninja');
  ninja.position = 3; // 弓兵から見て1マス先
  game.endTurn(); // p2 の番：弓兵は忍者を撃たない
  assert.equal(log.filter((e) => e.event === 'soldierShot' && e.target.kind === 'soldier').length, 0);
  assert.ok(archer);
  // 相手の兵士が忍者しかいないと、サンダーは出せない（いることも分からない）
  game.debugSetHand('p2', ['thunder']);
  const res = game.canPlayCard(game.players.p2.hand[0].cardId);
  assert.equal(res.ok, false);
  assert.match(res.reason, /相手の兵士がいません/);

  const { game: g2, log: log2 } = newGame({ monsters: SLIME, rules: { monsterFirstRound: 1, monsterSpawnChance: 1 } });
  g2.start();
  const n2 = play(g2, 'ninja');
  g2.endTurn();
  g2.endTurn();
  assert.ok(log2.some((e) => e.event === 'monsterClashed' && e.attacker.soldierId === n2.soldierId), '魔物とは戦う');
  assert.equal(n2.position, 1); // 魔物（真ん中のマス2）の手前で止まる
});

test('忍者：イベントに持ち主の陣地（stealth）が付き、相手には隠される', () => {
  const { game, log } = newGame();
  game.start();
  const ninja = play(game, 'ninja');
  const deployed = log.find((e) => e.event === 'soldierDeployed' && e.soldierId === ninja.soldierId);
  assert.equal(deployed.stealth, 'p1');
  const { event, ...payload } = deployed;
  assert.equal(filterEventFor('soldierDeployed', payload, 'p2'), null);
  assert.deepEqual(filterEventFor('soldierDeployed', payload, 'p1'), payload);
  // チーム戦の味方（同じ陣地）には見せる
  assert.deepEqual(filterEventFor('soldierDeployed', payload, 'p3', 'p1'), payload);
  // カードを出したこと自体（cardPlayed）は見える
  const played = log.find((e) => e.event === 'cardPlayed' && e.type === 'ninja');
  assert.equal(played.stealth, undefined);
});
