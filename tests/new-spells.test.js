// チェーン・ブラスト・イグニッション・バースト・シールド・ブラスト・ピュリファイ・フレアのテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { loadFixture, loadJson, seededRng, recordEvents } from './helpers.js';

const SPELLS = {
  chainBlast: { name: 'チェーン・ブラスト', kind: 'spell', effect: 'chainBlast', amount: 4, count: 1 },
  ignitionBurst: { name: 'イグニッション・バースト', kind: 'spell', effect: 'ignitionBurst', amount: 7, selfDamage: 6, count: 1 },
  shieldBlast: { name: 'シールド・ブラスト', kind: 'spell', effect: 'armorBlast', exhaust: true, count: 1 },
  purifyFlare: { name: 'ピュリファイ・フレア', kind: 'spell', effect: 'purifyFlare', amount: 1, count: 1 },
};

function setup({ p1 = [], p2 = [], rules = {}, deck = Array(40).fill('heal') } = {}) {
  const cards = { ...loadFixture('cards-step2.json'), ...SPELLS };
  const game = new Game({ cards, rules: { ...loadFixture('rules.json'), ...rules }, rng: seededRng(1) });
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
const hpOf = (game, pid) => Object.fromEntries(game.getState(null).players[pid].soldiers.map((s) => [s.soldierId, s.hp]));

test('チェーン・ブラスト：選んだ兵士に4、同じ道の前後1マスと、となりの道の同じマスに2', () => {
  const { game } = setup({ p1: ['infantry', 'infantry', 'infantry', 'infantry'], p2: ['chainBlast'], rules: { laneCount: 3, soldiersPerTurn: 4 } });
  const lanes = ['p1-p2#1', 'p1-p2#1', 'p1-p2#2', 'p1-p2#3'];
  for (const roadId of lanes) game.playCard(idOf(game, 'infantry'), { playerId: 'p2', roadId });
  const [a, b, c, d] = game.players.p1.soldiers;
  a.position = 1; // 狙う兵士
  b.position = 2; // 同じ道の1マス先
  c.position = 1; // となりの道の同じマス
  d.position = 1; // 2つとなりの道（届かない）
  game.endTurn();
  const id = idOf(game, 'chainBlast');
  assert.equal(game.getTargets(id).length, 4);
  assert.equal(game.canPlayCard(id).needsTarget, true);
  assert.equal(game.playCard(id, { soldierId: a.soldierId }).ok, true);
  assert.deepEqual(hpOf(game, 'p1'), { [a.soldierId]: 1, [b.soldierId]: 3, [c.soldierId]: 3, [d.soldierId]: 5 });
});

test('チェーン・ブラスト：相手の兵士がいなければ出せない', () => {
  const { game } = setup({ p1: ['chainBlast'] });
  assert.deepEqual(game.canPlayCard(idOf(game, 'chainBlast')), { ok: false, reason: '道の上に相手の兵士がいません' });
});

test('イグニッション・バースト：自分の城に6（城壁が先）、相手の兵士全員と城に7。城HPが7以下なら出せない', () => {
  const { game, log } = setup({ p1: ['infantry'], p2: ['ignitionBurst'] });
  game.playCard(idOf(game, 'infantry'));
  game.endTurn();
  const before = { p1: game.players.p1.castle.hp, p2: game.players.p2.castle.hp };
  game.players.p2.armor = 2;
  log.length = 0;
  assert.equal(game.playCard(idOf(game, 'ignitionBurst')).ok, true);
  const castle = log.filter((e) => e.event === 'castleDamaged');
  assert.deepEqual(castle.map((e) => [e.playerId, e.amount, e.blocked, e.source.kind]), [['p2', 6, 2, 'self'], ['p1', 7, 0, 'spell']]);
  assert.equal(game.players.p2.castle.hp, before.p2 - 4);
  assert.equal(game.players.p1.castle.hp, before.p1 - 7);
  assert.equal(game.players.p1.soldiers.length, 0); // 歩兵（HP5）は倒れる

  const low = setup({ p1: ['ignitionBurst'] });
  low.game.debugSetCastleHp('p1', 7);
  assert.deepEqual(low.game.canPlayCard(idOf(low.game, 'ignitionBurst')), { ok: false, reason: '城のHPが足りません（8以上必要）' });
});

test('シールド・ブラスト：城壁の値だけ相手の城にダメージ。城壁は0になり、カードは使い切り', () => {
  const { game, log } = setup({ p1: ['wall', 'shieldBlast'], rules: { armorMax: 40 } });
  assert.deepEqual(game.canPlayCard(idOf(game, 'shieldBlast')), { ok: false, reason: '城壁がありません' });
  game.playCard(idOf(game, 'wall'));
  game.players.p1.armor = 12;
  const hp = game.players.p2.castle.hp;
  log.length = 0;
  assert.equal(game.playCard(idOf(game, 'shieldBlast')).ok, true);
  assert.equal(game.players.p1.armor, 0);
  assert.deepEqual(log.find((e) => e.event === 'castleArmored'), { event: 'castleArmored', playerId: 'p1', armor: 0 });
  assert.equal(game.players.p2.castle.hp, hp - 12);
  assert.equal(game.getState(null).exhaustedCount, 2); // 城壁（fixture では使い切り）とシールド・ブラスト
});

test('ピュリファイ・フレア：自分の毒・やけど・凍結と城の毒を治し、相手の兵士全員に1', () => {
  const { game, log } = setup({ p1: ['infantry'], p2: ['infantry', 'purifyFlare'] });
  game.playCard(idOf(game, 'infantry'));
  game.endTurn();
  game.playCard(idOf(game, 'infantry'));
  const mine = game.players.p2.soldiers[0];
  mine.poison = { amount: 1, turns: 2 };
  mine.burn = { amount: 1, turns: 2 };
  mine.frozen = 1;
  game.players.p2.castle.poison = 2;
  log.length = 0;
  assert.equal(game.playCard(idOf(game, 'purifyFlare')).ok, true);
  assert.deepEqual(log.filter((e) => e.event === 'statusCleared').map((e) => e.status), ['poison', 'burn', 'frozen']);
  assert.ok(log.some((e) => e.event === 'castleCured' && e.playerId === 'p2'));
  assert.equal(game.players.p1.soldiers[0].hp, 4);
  assert.equal(mine.poison, null);
  assert.equal(game.players.p2.castle.poison, null);
});

test('ピュリファイ・フレア：治すものも相手の兵士もいなければ出せない', () => {
  const { game } = setup({ p1: ['purifyFlare'] });
  assert.deepEqual(game.canPlayCard(idOf(game, 'purifyFlare')), { ok: false, reason: '治すものも、相手の兵士もいません' });
});

test('data/cards.json の4つの魔法', () => {
  const c = loadJson('cards.json');
  assert.deepEqual(['chainBlast', 'ignitionBurst', 'shieldBlast', 'purifyFlare'].map((t) => c[t].rarity), ['uncommon', 'rare', 'epic', 'uncommon']);
  assert.equal(c.shieldBlast.exhaust, true);
});
