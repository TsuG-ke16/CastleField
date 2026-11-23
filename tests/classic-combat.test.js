// クラシックモードの戦闘ルール（PR2a）のテスト：
//   (A) castleSpellHitsFront：城への魔法を、選んだレーンの相手の先頭の兵士に当てる
//   (B) 崩壊の刻（collapseStartRound など）：試合が必ず終わるように、全員の城が毎周回削られる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { buildData, loadFixture, loadOptionalData, seededRng, recordEvents } from './helpers.js';

const EXTRA = {
  ninja: { name: '下忍', kind: 'soldier', role: 'ninja', hp: 2, attack: 2, speed: 2, count: 1 },
  shield: { name: '盾', kind: 'defense', effect: 'shieldSoldier', amount: 3, count: 1 },
  reflect: { name: '反射', kind: 'defense', effect: 'reflectSpell', count: 1 },
};

function newGame(rules = {}) {
  const game = new Game({
    cards: { ...loadFixture('cards.json'), ...EXTRA },
    rules: { ...loadFixture('rules.json'), laneLength: 5, laneCount: 3, soldiersPerTurn: 3, maxHand: 99, ...rules },
    rng: seededRng(1),
  });
  const log = recordEvents(game, EVENT_TYPES);
  game.debugSetDeck(Array(80).fill('heal'));
  return { game, log };
}

const FRONT = { castleSpellHitsFront: true };
const lane = (n) => `p1-p2#${n}`;

/** p2 の兵士を出して位置を決め、p1 の番に戻す。places: [{ type, lane, position }] */
function setupEnemies(game, places) {
  game.start();
  game.endTurn(); // p2 の番
  const out = [];
  for (const { type = 'infantry', lane: n, position } of places) {
    game.debugSetHand('p2', [type]);
    const r = game.playCard(game.players.p2.hand[0].cardId, { playerId: 'p1', roadId: lane(n) });
    assert.equal(r.ok, true, r.reason);
    out.push(game.players.p2.soldiers.at(-1));
  }
  for (let i = 0; i < places.length; i++) out[i].position = places[i].position;
  game.endTurn(); // p1 の番（p2 の兵士は動かない）
  return out;
}

function fire(game, target) {
  game.debugSetHand('p1', ['fireball']);
  return game.playCard(game.players.p1.hand[0].cardId, target);
}

// ================= (A) 城への魔法が先頭の兵士に当たる =================

test('先頭：選んだレーンの相手の兵士に当たり、城は減らない。spellCast に roadId と soldierId', () => {
  const { game, log } = newGame(FRONT);
  const [s] = setupEnemies(game, [{ lane: 2, position: 1 }]);
  s.hp = 20;
  const hp = game.players.p2.castle.hp;
  assert.equal(fire(game, { playerId: 'p2', roadId: lane(2) }).ok, true);
  assert.equal(s.hp, 12);
  assert.equal(game.players.p2.castle.hp, hp);
  const cast = log.find((e) => e.event === 'spellCast');
  assert.equal(cast.roadId, lane(2));
  assert.equal(cast.soldierId, s.soldierId);
  assert.ok(!log.some((e) => e.event === 'castleDamaged'));
  const dmg = log.find((e) => e.event === 'soldierDamaged');
  assert.equal(dmg.cause, 'spell');
  assert.equal(dmg.amount, 8);
});

test('先頭：複数いたら、撃った人の城にいちばん近い兵士（同じなら先に出された方）。倒れたら killed', () => {
  const { game, log } = newGame(FRONT);
  const [a, b, c] = setupEnemies(game, [{ lane: 1, position: 1 }, { lane: 1, position: 3 }, { lane: 1, position: 3 }]);
  fire(game, { playerId: 'p2', roadId: lane(1) });
  assert.ok(!game.players.p2.soldiers.includes(b));
  assert.ok(game.players.p2.soldiers.includes(a));
  assert.ok(game.players.p2.soldiers.includes(c));
  assert.ok(log.some((e) => e.event === 'soldierDestroyed' && e.soldierId === b.soldierId && e.reason === 'killed'));
});

test('先頭：兵士がいないレーンを選ぶと、今までどおり相手の城に当たる', () => {
  const { game, log } = newGame(FRONT);
  const [s] = setupEnemies(game, [{ lane: 1, position: 2 }]);
  const hp = game.players.p2.castle.hp;
  fire(game, { playerId: 'p2', roadId: lane(3) });
  assert.equal(game.players.p2.castle.hp, hp - 8);
  assert.equal(s.hp, 5);
  const cast = log.find((e) => e.event === 'spellCast');
  assert.equal(cast.roadId, lane(3));
  assert.equal(cast.soldierId, undefined);
});

test('先頭：盾が先に受ける', () => {
  const { game, log } = newGame(FRONT);
  const [s] = setupEnemies(game, [{ lane: 1, position: 1 }]);
  s.hp = 20;
  s.shield = 3;
  fire(game, { playerId: 'p2', roadId: lane(1) });
  assert.equal(s.shield, 0);
  assert.equal(s.hp, 15);
  assert.equal(log.find((e) => e.event === 'soldierDamaged').blocked, 3);
});

test('先頭：忍者は見えないので数えない（後ろの兵士か城に当たる）', () => {
  const { game } = newGame(FRONT);
  const [n, s] = setupEnemies(game, [{ type: 'ninja', lane: 1, position: 4 }, { lane: 1, position: 1 }]);
  s.hp = 20;
  fire(game, { playerId: 'p2', roadId: lane(1) });
  assert.equal(n.hp, 2);
  assert.equal(s.hp, 12);
  // 忍者だけの道なら城に当たる
  const { game: g2 } = newGame(FRONT);
  const [n2] = setupEnemies(g2, [{ type: 'ninja', lane: 2, position: 3 }]);
  const hp = g2.players.p2.castle.hp;
  fire(g2, { playerId: 'p2', roadId: lane(2) });
  assert.equal(n2.hp, 2);
  assert.equal(g2.players.p2.castle.hp, hp - 8);
});

test('先頭：getTargets はレーンごと。対象を省略すると選ぶ必要がある。レーン1本なら省略できる', () => {
  const { game } = newGame(FRONT);
  game.start();
  game.debugSetHand('p1', ['fireball']);
  const id = game.players.p1.hand[0].cardId;
  assert.deepEqual(game.getTargets(id), [1, 2, 3].map((n) => ({ playerId: 'p2', roadId: lane(n) })));
  assert.deepEqual(game.canPlayCard(id), { ok: true, needsTarget: true });
  assert.equal(game.canPlayCard(id, { playerId: 'p2' }).ok, false);
  assert.equal(game.canPlayCard(id, { playerId: 'p2', roadId: lane(2) }).ok, true);
  assert.equal(game.playCard(id).needsTarget, true);

  const { game: one, log } = newGame({ ...FRONT, laneCount: 1 });
  one.start();
  one.endTurn();
  one.debugSetHand('p2', ['infantry']);
  one.playCard(one.players.p2.hand[0].cardId);
  const s = one.players.p2.soldiers[0];
  s.hp = 20;
  one.endTurn();
  one.debugSetHand('p1', ['fireball']);
  assert.deepEqual(one.getTargets(one.players.p1.hand[0].cardId), [{ playerId: 'p2' }]);
  assert.equal(one.playCard(one.players.p1.hand[0].cardId).ok, true);
  assert.equal(s.hp, 12);
  assert.equal(log.find((e) => e.event === 'spellCast').roadId, 'p1-p2');
});

test('先頭：兵士に当たるときの防御は盾だけ（反射は出せない）', () => {
  const { game, log } = newGame({ ...FRONT, defenseReaction: true });
  const [s] = setupEnemies(game, [{ lane: 1, position: 1 }]);
  s.hp = 20;
  game.debugSetHand('p2', ['shield', 'reflect']);
  fire(game, { playerId: 'p2', roadId: lane(1) });
  assert.equal(game.getState(null).phase, 'defend');
  const req = log.find((e) => e.event === 'defenseRequested');
  assert.equal(req.kind, 'soldiers');
  assert.deepEqual(req.soldierIds, [s.soldierId]);
  const [shield, reflect] = game.players.p2.hand;
  assert.equal(game.canDefend(reflect.cardId).ok, false);
  assert.equal(game.defend(shield.cardId).ok, true);
  assert.equal(game.getState(null).phase, 'main');
  assert.equal(s.hp, 15); // 盾3が先に受ける
});

test('castleSpellHitsFront なし：今までどおり、兵士がいても城に当たる（対象は { playerId }）', () => {
  const { game, log } = newGame();
  const [s] = setupEnemies(game, [{ lane: 1, position: 3 }]);
  const hp = game.players.p2.castle.hp;
  game.debugSetHand('p1', ['fireball']);
  assert.deepEqual(game.getTargets(game.players.p1.hand[0].cardId), [{ playerId: 'p2' }]);
  fire(game);
  assert.equal(game.players.p2.castle.hp, hp - 8);
  assert.equal(s.hp, 5);
  assert.equal(log.find((e) => e.event === 'spellCast').roadId, undefined);
  assert.equal(game.getState(null).collapse, null);
});

// ================= (B) 崩壊の刻 =================

const COLLAPSE = { collapseAnnounceRound: 3, collapseStartRound: 5, collapseDamage: 1 };

/** 周回が round に来るまで、ターンを終え続ける */
function untilRound(game, round) {
  while (game.round < round && game.getState(null).phase !== 'gameOver') {
    const r = game.endTurn();
    assert.equal(r.ok, true, r.reason);
  }
}

test('崩壊：予告 → 開始 → 全員の城に 1, 2, 3 と増えるダメージ（source.kind "collapse"）', () => {
  const { game, log } = newGame(COLLAPSE);
  game.start();
  assert.deepEqual(game.getState(null).collapse, { announced: false, active: false, round: null });
  untilRound(game, 3);
  assert.deepEqual(log.filter((e) => e.event === 'collapseAnnounced'), [{ event: 'collapseAnnounced', round: 3, startRound: 5 }]);
  assert.deepEqual(game.getState(null).collapse, { announced: true, active: false, round: null });
  assert.ok(!log.some((e) => e.event === 'castleDamaged'));
  untilRound(game, 7);
  assert.deepEqual(log.filter((e) => e.event === 'collapseStarted').map((e) => e.round), [5]);
  assert.deepEqual(game.getState(null).collapse, { announced: true, active: true, round: 5 });
  const hits = log.filter((e) => e.event === 'castleDamaged' && e.source.kind === 'collapse');
  assert.deepEqual(hits.map((e) => [e.playerId, e.amount]), [['p1', 1], ['p2', 1], ['p1', 2], ['p2', 2], ['p1', 3], ['p2', 3]]);
  assert.equal(game.players.p1.castle.hp, 25 - 6);
  assert.equal(game.players.p2.castle.hp, 27 - 6);
  // 順番：roundStarted → collapseStarted → castleDamaged
  const i = log.findIndex((e) => e.event === 'collapseStarted');
  assert.equal(log[i - 1].event, 'roundStarted');
  assert.equal(log[i + 1].event, 'castleDamaged');
});

test('崩壊：城壁が先に受ける', () => {
  const { game, log } = newGame({ ...COLLAPSE, armorMax: 40 });
  game.start();
  untilRound(game, 4);
  game.players.p1.armor = 1;
  untilRound(game, 6);
  const hits = log.filter((e) => e.event === 'castleDamaged' && e.playerId === 'p1');
  assert.deepEqual(hits.map((e) => [e.amount, e.blocked]), [[1, 1], [2, 0]]);
  assert.equal(game.players.p1.castle.hp, 25 - 2);
  assert.equal(game.players.p1.armor, 0);
});

test('崩壊：1人だけ落ちたら、残った人の勝ち（reason "collapse"）', () => {
  const { game, log } = newGame(COLLAPSE);
  game.start();
  untilRound(game, 4);
  game.debugSetCastleHp('p2', 1);
  untilRound(game, 5);
  assert.equal(game.getState(null).phase, 'gameOver');
  assert.deepEqual(log.at(-1), { event: 'gameOver', winner: 'p1', reason: 'collapse' });
});

test('崩壊：同時に0以下なら、相手の城に与えたダメージの合計が多い人の勝ち。同じなら席順が後ろ', () => {
  // p1 がファイアボールで p2 の城に8与えている → p1 の勝ち（席順では p2 が後ろ）
  {
    const { game, log } = newGame(COLLAPSE);
    game.start();
    fire(game);
    untilRound(game, 4);
    game.debugSetCastleHp('p1', 1);
    game.debugSetCastleHp('p2', 1);
    untilRound(game, 5);
    assert.deepEqual(log.at(-1), { event: 'gameOver', winner: 'p1', reason: 'collapse' });
  }
  // だれも与えていない → 席順が後ろの p2 の勝ち
  {
    const { game, log } = newGame(COLLAPSE);
    game.start();
    untilRound(game, 4);
    game.debugSetCastleHp('p1', 1);
    game.debugSetCastleHp('p2', 1);
    untilRound(game, 5);
    assert.deepEqual(log.at(-1), { event: 'gameOver', winner: 'p2', reason: 'collapse' });
  }
});

test('崩壊：与えたダメージは城HPに入った量だけ数える（城壁が受けたぶん・自分で払うコストは数えない）', () => {
  const { game } = newGame({ ...COLLAPSE, armorMax: 40 });
  game.start();
  game.players.p2.armor = 5;
  fire(game);
  assert.equal(game.castleDamageDealt.get('p1'), 3);
  assert.equal(game.castleDamageDealt.get('p2'), undefined);
});

test('崩壊：collapseStartRound がなければ何も起きない（getState().collapse は null）', () => {
  const { game, log } = newGame({ collapseAnnounceRound: 3 });
  game.start();
  untilRound(game, 8);
  assert.equal(game.getState(null).collapse, null);
  assert.ok(!log.some((e) => e.event === 'collapseAnnounced' || e.event === 'collapseStarted' || e.event === 'castleDamaged'));
});

test('崩壊：rules の間違いは new Game() が例外', () => {
  assert.throws(() => newGame({ collapseDamage: 0 }), /collapseDamage/);
  assert.throws(() => newGame({ collapseStartRound: -1 }), /collapseStartRound/);
  assert.throws(() => newGame({ collapseAnnounceRound: 9, collapseStartRound: 5 }), /collapseAnnounceRound/);
  assert.throws(() => newGame({ castleSpellHitsFront: 'yes' }), /castleSpellHitsFront/);
});

test('クラシック：周回の上限なし・崩壊の刻あり。崩壊の刻はまだ始まっていない', () => {
  const { rules, cards } = buildData({ mode: 'classic' });
  assert.equal(rules.maxRounds, 0);
  assert.equal(rules.collapseStartRound, 60);
  assert.equal(rules.collapseAnnounceRound, 50);
  assert.equal(rules.castleSpellHitsFront, true);
  const game = new Game({ cards, rules, ...loadOptionalData('classic'), rng: seededRng(3) });
  assert.deepEqual(game.getState(null).collapse, { announced: false, active: false, round: null });
});
