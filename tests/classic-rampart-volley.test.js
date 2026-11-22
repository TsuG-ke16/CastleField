// クラシックの王国の新カード「聖壁の号砲」（classic_king_rampart_volley。effect: armorBlast）のテスト：
//   (1) 城壁を積んで撃つと、城壁ぶんのダメージが相手の城に入り、自分の城壁は0になる（先頭の兵士には止められない）
//   (2) 城壁がないと出せない
//   (3) 相手の防御（城壁・反射）は聞く
//   (4) 霧で外れても城壁は0になる
//   (5) CPU：城壁を貯めるのは smart・guard が castleSpellHitsFront のルールで号砲を持っているときだけ（defensive・rush・通常モードは変わらない）。貯まれば撃つ
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { STRATEGIES } from '../js/game/strategies.js';
import { buildData, loadOptionalData, seededRng, recordEvents, PLAIN_START } from './helpers.js';

const VOLLEY = 'classic_king_rampart_volley';
const WALL = 'classic_king_wall';
const SOLDIER = 'classic_demon_skeleton';
// 反射はクラシックの山札にないので、テストだけで足す
const EXTRA = { test_reflect: { name: '反射', kind: 'defense', effect: 'reflectSpell', count: 1 } };

function newGame(rules = {}) {
  const { cards, rules: base } = buildData({ mode: 'classic' });
  // 天候（霧で外れる）を入れないよう、属性の表だけ渡す（号砲は光属性）
  const { elements } = loadOptionalData('classic');
  const game = new Game({ cards: { ...cards, ...EXTRA }, rules: { ...base, ...PLAIN_START, ...rules }, elements, rng: seededRng(1) });
  const log = recordEvents(game, EVENT_TYPES);
  return { game, log, cards };
}

const ids = (game, pid, type) => game.players[pid].hand.filter((c) => c.type === type).map((c) => c.cardId);

/** p2 が p1 に兵士を1体出してから p1 の番に戻す。p1 の手札は types */
function setupP1(game, types, p2Hand = []) {
  game.start();
  game.debugSetHand('p1', []);
  game.endTurn();
  game.debugSetHand('p2', [SOLDIER]);
  game.players.p2.mp = 20;
  const lane = game.getTargets(ids(game, 'p2', SOLDIER)[0])[0];
  assert.equal(game.playCard(ids(game, 'p2', SOLDIER)[0], lane).ok, true);
  game.debugSetHand('p2', p2Hand);
  game.endTurn();
  game.debugSetHand('p1', types);
  game.players.p1.mp = 20;
  game.players.p2.mp = 20;
}

/** p1 が城壁を n 枚置く */
function stackWalls(game, n) {
  for (const id of ids(game, 'p1', WALL).slice(0, n)) assert.equal(game.playCard(id).ok, true);
}

test('クラシックのカード：聖壁の号砲が入り、身代わりは外れた。山札は80枚のまま', () => {
  const { cards } = buildData({ mode: 'classic' });
  const v = cards[VOLLEY];
  assert.equal(v.effect, 'armorBlast');
  assert.equal(v.kind, 'spell');
  assert.equal(v.count, 2);
  assert.equal(v.rarity, undefined);
  assert.equal(v.fuseTo, undefined);
  assert.ok(v.description);
  assert.equal(cards.classic_king_decoy, undefined);
  assert.equal(Object.values(cards).reduce((n, c) => n + c.count, 0), 80);
});

test('城壁を積んで撃つと、城壁ぶんのダメージが相手の城に入り（先頭の兵士には当たらない）、自分の城壁は0になる', () => {
  const { game, log } = newGame();
  setupP1(game, [WALL, WALL, WALL, VOLLEY]);
  stackWalls(game, 3);
  assert.equal(game.players.p1.armor, 15);
  const enemySoldier = game.players.p2.soldiers[0];
  const hpBefore = enemySoldier.hp;
  const mpBefore = game.players.p1.mp;
  const from = log.length;
  assert.equal(game.playCard(ids(game, 'p1', VOLLEY)[0]).ok, true);
  const ev = log.slice(from);
  assert.equal(game.players.p1.armor, 0);
  assert.equal(game.players.p1.mp, mpBefore - 3);
  assert.equal(game.getState(null).players.p2.castleHp, 60 - 15);
  assert.equal(enemySoldier.hp, hpBefore); // 兵士には止められない
  assert.deepEqual(ev.filter((e) => e.event === 'castleArmored').map((e) => e.armor), [0]);
  const hit = ev.find((e) => e.event === 'castleDamaged');
  assert.equal(hit.playerId, 'p2');
  assert.equal(hit.amount, 15);
  assert.equal(hit.blocked, 0);
  assert.equal(ev.some((e) => e.event === 'soldierDamaged'), false);
});

test('城壁がないと出せない', () => {
  const { game } = newGame();
  setupP1(game, [VOLLEY]);
  const id = ids(game, 'p1', VOLLEY)[0];
  assert.deepEqual(game.canPlayCard(id), { ok: false, reason: '城壁がありません' });
  assert.deepEqual(game.getTargets(id), []);
});

test('相手の防御を聞く：相手が城壁を出すと、そのぶん止まる', () => {
  const { game, log } = newGame();
  setupP1(game, [WALL, WALL, WALL, VOLLEY], [WALL]);
  stackWalls(game, 3);
  assert.equal(game.playCard(ids(game, 'p1', VOLLEY)[0]).ok, true);
  assert.equal(game.getState(null).phase, 'defend');
  assert.equal(log.findLast((e) => e.event === 'defenseRequested').amount, 15);
  assert.equal(game.defend(ids(game, 'p2', WALL)[0]).ok, true);
  if (game.getState(null).phase === 'defend') game.passDefense();
  const hit = log.findLast((e) => e.event === 'castleDamaged');
  assert.equal(hit.blocked, 5);
  assert.equal(game.getState(null).players.p2.castleHp, 60 - 10);
  assert.equal(game.players.p1.armor, 0);
});

test('相手の防御を聞く：反射されると、自分の城に返る（城壁はもう0なので全部受ける）', () => {
  const { game, log } = newGame();
  setupP1(game, [WALL, WALL, VOLLEY], ['test_reflect']);
  stackWalls(game, 2);
  assert.equal(game.playCard(ids(game, 'p1', VOLLEY)[0]).ok, true);
  assert.equal(game.getState(null).phase, 'defend');
  assert.equal(game.defend(ids(game, 'p2', 'test_reflect')[0]).ok, true);
  assert.ok(log.some((e) => e.event === 'spellReflected'));
  assert.equal(game.getState(null).players.p2.castleHp, 60);
  assert.equal(game.getState(null).players.p1.castleHp, 60 - 10);
});

test('霧で外れても、自分の城壁は0になる（相手の城は減らない）', () => {
  const { game, log } = newGame();
  setupP1(game, [WALL, WALL, VOLLEY]);
  stackWalls(game, 2);
  game.rollMiss = () => true;
  assert.equal(game.playCard(ids(game, 'p1', VOLLEY)[0]).ok, true);
  assert.equal(game.players.p1.armor, 0);
  assert.equal(game.getState(null).players.p2.castleHp, 60);
  assert.ok(log.some((e) => e.event === 'attackMissed' && e.kind === 'spell'));
  assert.ok(!log.some((e) => e.event === 'castleDamaged'));
});

/** p1 の番に、戦い方 name で1ターン動かす（p1 の手札は hand、MP は mp） */
function cpuTurn(name, hand, { rules = {}, mp = 10, armor = 0 } = {}) {
  const { game, cards } = newGame(rules);
  setupP1(game, hand);
  game.players.p1.mp = mp;
  game.players.p1.armor = armor;
  const ctx = { cards, rules: game.rules, upgrades: {}, discardCount: 0 };
  STRATEGIES[name].takeTurn(game, 'p1', seededRng(2), ctx);
  return game;
}

test('CPU（smart・guard）：クラシックで号砲を持っていれば、城HPが満タンでも城壁をちょうど15まで貯めて止める', () => {
  for (const name of ['smart', 'guard']) {
    const p1 = cpuTurn(name, [WALL, WALL, WALL, WALL, VOLLEY]).players.p1;
    assert.equal(p1.armor, 15, name);
    assert.equal(p1.hand.filter((c) => c.type === WALL).length, 1, name); // 4枚目は置かない
  }
});

test('CPU（smart）：城壁が10以上で MP が足りれば号砲を撃ち、相手の城HPが減る', () => {
  const game = cpuTurn('smart', [VOLLEY], { armor: 10, mp: 10 });
  assert.equal(game.players.p1.armor, 0);
  assert.equal(game.getState(null).players.p2.castleHp, 60 - 10);
});

test('CPU：号砲がない・castleSpellHitsFront のないルール・defensive と rush では、満タンなら城壁を置かない', () => {
  assert.equal(cpuTurn('smart', [WALL, WALL]).players.p1.armor, 0);
  assert.equal(cpuTurn('smart', [WALL, WALL, VOLLEY], { rules: { castleSpellHitsFront: false } }).players.p1.armor, 0);
  for (const name of ['defensive', 'rush']) assert.equal(cpuTurn(name, [WALL, WALL, VOLLEY]).players.p1.armor, 0, name);
});

test('CPU：本物の通常モードのデータでは、シールド・ブラストを持っていても満タンなら城壁を置かない', () => {
  const { cards, rules } = buildData();
  const game = new Game({ cards, rules: { ...rules, ...PLAIN_START }, rng: seededRng(1) });
  assert.ok(!game.rules.castleSpellHitsFront);
  game.start();
  game.debugSetHand('p1', ['wall', 'shieldBlast']); // 同じカード2枚だと smart が合成するので1枚
  const ctx = { cards, rules: game.rules, upgrades: {}, discardCount: 0 };
  for (const name of ['smart', 'guard']) STRATEGIES[name].takeTurn(game, 'p1', seededRng(2), ctx);
  assert.equal(game.players.p1.armor, 0);
  assert.equal(game.players.p1.hand.filter((c) => c.type === 'wall').length, 1);
});
