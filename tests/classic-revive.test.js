// クラシックモードの道具（PR2c）のテスト：
//   (1) reviveFallen：蘇生（最後に倒れた自分の兵士1体を、城の前に生き返らせる）
//   (2) randomElementDamage：ランダムな属性で、敵兵士1体にダメージ
//   (3) クラシックのカード
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { buildData, loadFixture, loadOptionalData, seededRng, recordEvents } from './helpers.js';

const EXTRA = {
  tank: { name: '大盾兵', kind: 'soldier', hp: 20, attack: 2, speed: 1, count: 1 },
  ninja: { name: '下忍', kind: 'soldier', role: 'ninja', hp: 4, attack: 2, speed: 2, count: 1 },
  archer: { name: '弓兵', kind: 'soldier', role: 'archer', hp: 3, attack: 2, range: 2, stay: 1, count: 1 },
  beastSlime: { name: 'スライムの駒', kind: 'soldier', monster: 'slime', hp: 4, attack: 1, speed: 1, count: 0 },
  flameSword: { name: '炎の剣', kind: 'weapon', attackBonus: 1, element: 'fire', count: 1 },
  waterSpear: { name: '水の槍', kind: 'weapon', attackBonus: 1, element: 'water', count: 1 },
  shield: { name: '盾', kind: 'defense', effect: 'shieldSoldier', amount: 3, count: 1 },
  ray: { name: '光線', kind: 'spell', effect: 'singleDamage', amount: 30, count: 1 },
  revive: { name: '残響', kind: 'spell', effect: 'reviveFallen', amount: 0.5, mpCost: 3, count: 1 },
  pulse: { name: '混沌', kind: 'spell', effect: 'randomElementDamage', amount: 3, mpCost: 3, count: 1 },
};

function newGame(rules = {}, { rng = seededRng(1) } = {}) {
  const game = new Game({
    cards: { ...loadFixture('cards.json'), ...EXTRA },
    rules: { ...loadFixture('rules.json'), soldiersPerTurn: 3, maxHand: 99, initialMp: 20, maxMp: 20, mpAllCards: true, elementBonus: 2, laneCount: 3, ...rules },
    ...(rng ? { rng } : {}),
  });
  const log = recordEvents(game, EVENT_TYPES);
  game.debugSetDeck(Array(80).fill('heal'));
  return { game, log };
}

const hand = (game, pid, type) => {
  game.debugSetHand(pid, [type]);
  return game.players[pid].hand[0].cardId;
};

/** 今の手番の人に、カードを1枚出させる（メインの1枚の決まりは外す） */
function play(game, pid, type, target) {
  game.players[pid].playedThisTurn = false;
  game.players[pid].mp = 20;
  const r = game.playCard(hand(game, pid, type), target);
  assert.equal(r.ok, true, r.reason);
}

/** p2 の兵士を出して、p1 の番に戻す。返り値は出した兵士 */
function enemySoldiers(game, types, road = 'p1-p2#2') {
  game.start();
  game.endTurn(); // p2 の番
  const out = [];
  for (const type of types) {
    play(game, 'p2', type, { playerId: 'p1', roadId: road });
    out.push(game.players.p2.soldiers.at(-1));
  }
  game.endTurn(); // p1 の番
  game.players.p1.mp = 20;
  return out;
}

// ================= (1) reviveFallen =================

test('reviveFallen：最後に倒れた兵士が、倒れた道の城の前に、HP半分・武器なし・盾なしで生き返る', () => {
  const { game, log } = newGame();
  const [s] = enemySoldiers(game, ['infantry']);
  s.weapon = 'flameSword'; s.weaponBonus = 1; s.element = 'fire'; s.shield = 2; s.frozen = 1;
  s.position = 2;
  play(game, 'p1', 'ray', { soldierId: s.soldierId });
  assert.equal(game.players.p2.soldiers.length, 0);
  game.endTurn(); // p2 の番
  game.players.p2.armyAttack = 2; // 訓練は新しく出した兵士と同じく乗る
  log.length = 0;
  play(game, 'p2', 'revive');
  assert.deepEqual(log.map((e) => e.event), ['mpChanged', 'cardPlayed', 'spellCast', 'soldierDeployed']);
  const dep = log.find((e) => e.event === 'soldierDeployed');
  assert.equal(dep.revived, true);
  assert.deepEqual([dep.type, dep.roadId, dep.targetId, dep.position, dep.hp, dep.attack], ['infantry', 'p1-p2#2', 'p1', 0, 3, 5]);
  assert.equal(log.find((e) => e.event === 'spellCast').roadId, 'p1-p2#2');
  const st = game.getState(null).players.p2.soldiers[0];
  assert.deepEqual([st.hp, st.maxHp, st.weapon, st.element, st.shield, st.position], [3, 5, null, null, 0, 0]);
  assert.deepEqual(st.statuses, { poison: null, frozen: 0, burn: null, weakened: null });
  // 生き返らせたら記録は消える（同じ兵士を2回は生き返らせない）
  assert.deepEqual(game.canPlayCard(hand(game, 'p2', 'revive')), { ok: false, reason: 'このターンはもうメインのカードを出しました' });
  game.players.p2.playedThisTurn = false;
  assert.deepEqual(game.canPlayCard(hand(game, 'p2', 'revive')), { ok: false, reason: '生き返らせる兵士がいません' });
});

test('reviveFallen：メインの枠を使い、兵士の枠には数えない。記録は getState に出ない', () => {
  const { game } = newGame();
  const [s] = enemySoldiers(game, ['infantry']);
  play(game, 'p1', 'ray', { soldierId: s.soldierId });
  game.endTurn();
  assert.equal(JSON.stringify(game.getState('p2')).includes('lastFallen'), false);
  play(game, 'p2', 'revive');
  assert.equal(game.players.p2.playedThisTurn, true);
  assert.equal(game.players.p2.soldiersPlayedThisTurn, 0);
});

test('reviveFallen：HP は最大HP（鍛錬を含む）の割合で切り上げ', () => {
  const { game } = newGame();
  const [s] = enemySoldiers(game, ['knight']);
  s.maxHp = 7; // 鍛錬で増えた
  play(game, 'p1', 'ray', { soldierId: s.soldierId });
  game.endTurn();
  play(game, 'p2', 'revive');
  const r = game.players.p2.soldiers[0];
  assert.deepEqual([r.type, r.hp, r.maxHp], ['knight', 4, 7]);
});

test('reviveFallen：倒れた兵士がいなければ出せない', () => {
  const { game } = newGame();
  game.start();
  assert.deepEqual(game.canPlayCard(hand(game, 'p1', 'revive')), { ok: false, reason: '生き返らせる兵士がいません' });
});

test('reviveFallen：城に着いた・帰った兵士は対象にならない（killed だけ）', () => {
  const { game } = newGame({ laneLength: 3 });
  const [k, a] = enemySoldiers(game, ['knight', 'archer']);
  game.endTurn(); // p2 の進軍：騎士は城に着き、弓兵は1ターンで帰る
  assert.equal(game.players.p2.soldiers.some((x) => x === k || x === a), false);
  assert.equal(game.players.p2.lastFallen, null);
  game.players.p2.playedThisTurn = false;
  assert.deepEqual(game.canPlayCard(hand(game, 'p2', 'revive')), { ok: false, reason: '生き返らせる兵士がいません' });
});

test('reviveFallen：魔物のカードの駒は生き返らせない', () => {
  const { game } = newGame();
  const [s] = enemySoldiers(game, ['beastSlime']);
  play(game, 'p1', 'ray', { soldierId: s.soldierId });
  assert.equal(game.players.p2.lastFallen, null);
});

test('reviveFallen：2体倒れたら、最後に倒れた方', () => {
  const { game } = newGame();
  const [i, k] = enemySoldiers(game, ['infantry', 'knight']);
  play(game, 'p1', 'ray', { soldierId: k.soldierId });
  play(game, 'p1', 'ray', { soldierId: i.soldierId });
  game.endTurn();
  play(game, 'p2', 'revive');
  assert.equal(game.players.p2.soldiers[0].type, 'infantry');
});

test('reviveFallen：倒れた道がもうなければ出せない', () => {
  const { game } = newGame();
  const [s] = enemySoldiers(game, ['infantry']);
  play(game, 'p1', 'ray', { soldierId: s.soldierId });
  game.endTurn();
  game.roads = game.roads.filter((r) => r.roadId !== 'p1-p2#2');
  game.players.p2.playedThisTurn = false;
  assert.deepEqual(game.canPlayCard(hand(game, 'p2', 'revive')), { ok: false, reason: '倒れた兵士の道がもうありません' });
});

test('reviveFallen：生き返った兵士は、出したターンは動かない（次の自分のターンから進む）', () => {
  const { game } = newGame();
  const [s] = enemySoldiers(game, ['infantry']);
  play(game, 'p1', 'ray', { soldierId: s.soldierId });
  game.endTurn();
  play(game, 'p2', 'revive');
  const r = game.players.p2.soldiers[0];
  game.endTurn(); // p1 の番
  assert.equal(r.position, 0);
  game.endTurn(); // p2 の番：進軍
  assert.equal(r.position, 2);
});

test('reviveFallen：MP が足りなければ出せない', () => {
  const { game } = newGame();
  const [s] = enemySoldiers(game, ['infantry']);
  play(game, 'p1', 'ray', { soldierId: s.soldierId });
  game.endTurn();
  game.players.p2.mp = 2;
  assert.deepEqual(game.canPlayCard(hand(game, 'p2', 'revive')), { ok: false, reason: 'MPが足りません（3必要・あと1）' });
});

test('reviveFallen：忍者も生き返る。相手には見えず、イベントは stealth 付き・spellCast に道は入らない', () => {
  const { game, log } = newGame();
  game.start();
  game.endTurn(); // p2 の番
  play(game, 'p2', 'ninja', { playerId: 'p1', roadId: 'p1-p2#1' });
  const n = game.players.p2.soldiers[0];
  game.damageSoldier(game.players.p2, n, 99, 'spell'); // 忍者は魔法の的にならないので、直接倒す
  assert.equal(game.players.p2.lastFallen.type, 'ninja');
  log.length = 0;
  play(game, 'p2', 'revive');
  assert.equal(log.find((e) => e.event === 'spellCast').roadId, undefined);
  const dep = log.find((e) => e.event === 'soldierDeployed');
  assert.deepEqual([dep.revived, dep.stealth, dep.roadId], [true, 'p2', 'p1-p2#1']);
  assert.equal(game.getState('p1').players.p2.soldiers.length, 0);
  assert.equal(game.getState('p2').players.p2.soldiers.length, 1);
});

test('reviveFallen：amount は 0 より大きく 1 以下の数（データの書き間違いは例外）', () => {
  const make = (amount) => () => new Game({
    cards: { ...loadFixture('cards.json'), revive: { ...EXTRA.revive, amount } },
    rules: loadFixture('rules.json'),
  });
  assert.throws(make(0), /amount/);
  assert.throws(make(1.5), /amount/);
  assert.throws(make(undefined), /amount/);
  assert.doesNotThrow(make(1));
});

// ================= (2) randomElementDamage =================

const ELEMENT_RNG = { fire: 0, water: 0.25, wind: 0.5, earth: 0.75 };

test('randomElementDamage：乱数で属性が決まり、spellCast に element が入る', () => {
  for (const [element, r] of Object.entries(ELEMENT_RNG)) {
    const { game, log } = newGame();
    const [s] = enemySoldiers(game, ['tank']);
    game.rng = () => r;
    log.length = 0;
    play(game, 'p1', 'pulse', { soldierId: s.soldierId });
    assert.deepEqual(log.map((e) => e.event), ['mpChanged', 'cardPlayed', 'spellCast', 'soldierDamaged']);
    const cast = log.find((e) => e.event === 'spellCast');
    assert.deepEqual([cast.element, cast.soldierId, cast.roadId, cast.target], [element, s.soldierId, 'p1-p2#2', 'p2']);
    const dmg = log.find((e) => e.event === 'soldierDamaged');
    assert.deepEqual([dmg.amount, dmg.cause], [3, 'spell']); // 属性なしの相手には増えない
    assert.equal(s.hp, 17);
  }
});

test('randomElementDamage：強い属性なら elementBonus 増える。弱い属性でも減らない', () => {
  // 水は火に強い
  {
    const { game } = newGame();
    const [s] = enemySoldiers(game, ['tank']);
    s.element = 'fire';
    game.rng = () => ELEMENT_RNG.water;
    play(game, 'p1', 'pulse', { soldierId: s.soldierId });
    assert.equal(s.hp, 20 - 5);
  }
  // 火は水に弱い（減らさない）
  {
    const { game } = newGame();
    const [s] = enemySoldiers(game, ['tank']);
    s.element = 'water';
    game.rng = () => ELEMENT_RNG.fire;
    play(game, 'p1', 'pulse', { soldierId: s.soldierId });
    assert.equal(s.hp, 20 - 3);
  }
});

test('randomElementDamage：MP を使う攻撃の魔法（mpAllCards なしでも）', () => {
  const { game } = newGame({ mpAllCards: false });
  const [s] = enemySoldiers(game, ['tank']);
  game.players.p1.mp = 2;
  assert.deepEqual(game.canPlayCard(hand(game, 'p1', 'pulse'), { soldierId: s.soldierId }), { ok: false, reason: 'MPが足りません（3必要・あと1）' });
});

test('randomElementDamage：盾が先に受ける', () => {
  const { game } = newGame();
  const [s] = enemySoldiers(game, ['tank']);
  s.shield = 2;
  game.rng = () => ELEMENT_RNG.fire;
  play(game, 'p1', 'pulse', { soldierId: s.soldierId });
  assert.deepEqual([s.shield, s.hp], [0, 19]);
});

test('randomElementDamage：霧で外れる', () => {
  const { game, log } = newGame();
  const [s] = enemySoldiers(game, ['tank']);
  game.rollMiss = () => true;
  play(game, 'p1', 'pulse', { soldierId: s.soldierId });
  assert.equal(s.hp, 20);
  assert.ok(log.some((e) => e.event === 'attackMissed' && e.kind === 'spell'));
  assert.ok(log.some((e) => e.event === 'spellCast' && e.element));
});

test('randomElementDamage：忍者は選べない。相手の兵士がいなければ出せない', () => {
  const { game } = newGame();
  const [n, t] = enemySoldiers(game, ['ninja', 'tank']);
  const id = hand(game, 'p1', 'pulse');
  assert.deepEqual(game.getTargets(id), [{ soldierId: t.soldierId }]);
  assert.ok(n);
  game.players.p2.soldiers = [n];
  assert.deepEqual(game.canPlayCard(id), { ok: false, reason: '道の上に相手の兵士がいません' });
});

test('randomElementDamage：相手は盾で防御できる（kind "soldiers"。量は属性の上乗せ込み）', () => {
  const { game, log } = newGame({ defenseReaction: true });
  const [s] = enemySoldiers(game, ['tank']);
  s.element = 'fire';
  game.rng = () => ELEMENT_RNG.water;
  game.debugSetHand('p2', ['shield']);
  play(game, 'p1', 'pulse', { soldierId: s.soldierId });
  const req = log.find((e) => e.event === 'defenseRequested');
  assert.deepEqual([req.kind, req.defenderId, req.soldierIds, req.amount], ['soldiers', 'p2', [s.soldierId], 5]);
  assert.equal(game.defend(game.players.p2.hand[0].cardId).ok, true);
  assert.equal(s.hp, 20 - 2); // 盾3が先に受けて、残り2
});

test('randomElementDamage：rng を渡さないときも Math.random で動く', () => {
  const { game, log } = newGame({}, { rng: null });
  const [s] = enemySoldiers(game, ['tank']);
  play(game, 'p1', 'pulse', { soldierId: s.soldierId });
  assert.ok(['fire', 'water', 'wind', 'earth'].includes(log.find((e) => e.event === 'spellCast').element));
  assert.equal(s.hp, 17);
});

// ================= (3) クラシックのカード =================

test('クラシック：残響の魂・カオスパルスがあり、全カードに mpCost があって new Game() が通る', () => {
  const { cards, rules } = buildData({ mode: 'classic' });
  assert.equal(cards.classic_demon_echo_soul.effect, 'reviveFallen');
  assert.equal(cards.classic_demon_chaos_pulse.effect, 'randomElementDamage');
  for (const [k, c] of Object.entries(cards)) assert.ok(Number.isInteger(c.mpCost) && c.mpCost >= 0, `${k} に mpCost がない`);
  const game = new Game({ cards, rules, ...loadOptionalData('classic'), rng: seededRng(5) });
  game.start();
  const st = game.getState(null);
  assert.equal(st.mpCosts.classic_demon_echo_soul, 3);
  assert.equal(st.mpCosts.classic_demon_chaos_pulse, 3);
});
