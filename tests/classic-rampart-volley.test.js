// クラシックの王国の新カード「聖壁の号砲」（classic_king_rampart_volley。effect: armorBlast）のテスト：
//   (1) 城壁を積んで撃つと、城壁ぶんのダメージが相手の城に入り、自分の城壁は0になる（先頭の兵士には止められない）
//   (2) 城壁がないと出せない
//   (3) 相手の防御（城壁・反射）は聞く
//   (4) CPU が城壁を貯めるのは castleSpellHitsFront のルールで号砲を持っているときだけ（通常モードは変わらない）
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

test('CPU：城壁を貯めるのは castleSpellHitsFront のルールで号砲を持っているときだけ（城HPが満タンでも）', () => {
  const run = (rules, hand) => {
    const { game, cards } = newGame(rules);
    setupP1(game, hand);
    game.players.p1.mp = 10;
    const ctx = { cards, rules: game.rules, upgrades: {}, discardCount: 0 };
    STRATEGIES.smart.takeTurn(game, 'p1', seededRng(2), ctx);
    return game.players.p1;
  };
  // クラシック（castleSpellHitsFront）：号砲があれば、満タンでも城壁を置く（15まで）
  const charged = run({}, [WALL, WALL, WALL, WALL, VOLLEY]);
  assert.equal(charged.armor, 15);
  assert.ok(charged.hand.some((c) => c.type === WALL)); // 15で止める
  // 号砲がなければ、今までどおり満タンのときは置かない
  assert.equal(run({}, [WALL, WALL]).armor, 0);
  // castleSpellHitsFront のないルール（通常モードと同じ）では、号砲があっても置かない
  assert.equal(run({ castleSpellHitsFront: false }, [WALL, WALL, VOLLEY]).armor, 0);
});
