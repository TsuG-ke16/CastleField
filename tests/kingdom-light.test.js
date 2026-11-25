// 4陣営モードの王国：光の先制（rules.lightFirstStrike）・切り札3枚（神剣・勇者・神盾）・小回復を外した・光の触媒（実験用 rules.lightCatalyst）。
// CLAUDE.md「4陣営モード」の「光の先制と切り札」。仕組みのテストは tests/fixtures/ とこのファイルで決めた数値で確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { factionDecks } from '../js/game/Setup.js';
import { STRATEGIES } from '../js/game/strategies.js';
import { loadFixture, loadJson, seededRng, recordEvents, buildData, loadOptionalData, loadFactionCards } from './helpers.js';

const MODE = 'factions';
const ELEMENTS = loadOptionalData(MODE).elements;

const EXTRA = {
  lightKnight: { name: '光の騎士', kind: 'soldier', hp: 5, attack: 5, speed: 1, innateElement: 'light', count: 1 },
  lightWeak: { name: '光の見習い', kind: 'soldier', hp: 5, attack: 2, speed: 1, innateElement: 'light', count: 1 },
  foe: { name: '兵', kind: 'soldier', hp: 5, attack: 3, speed: 1, count: 1 },
  tough: { name: '硬い兵', kind: 'soldier', hp: 8, attack: 3, speed: 1, count: 1 },
  bruiser: { name: '強い兵', kind: 'soldier', hp: 5, attack: 5, speed: 1, count: 1 },
  lightBlade: { name: '光の剣', kind: 'weapon', attackBonus: 3, element: 'light', count: 1 },
  fireBlade: { name: '火の剣', kind: 'weapon', attackBonus: 0, element: 'fire', count: 1 },
  shield1: { name: '小盾', kind: 'defense', effect: 'shieldSoldier', amount: 1, count: 1 },
  revive: { name: '蘇生', kind: 'spell', effect: 'reviveFallen', amount: 0.5, count: 1 },
  curse: { name: '呪い', kind: 'spell', effect: 'weakenAttack', amount: 2, turns: 3, count: 1 },
  poison: { name: '毒', kind: 'spell', effect: 'poisonEnemy', amount: 1, turns: 3, count: 1 },
  lightTap: { name: '光の粉', kind: 'spell', effect: 'singleDamage', element: 'light', amount: 1, count: 1 },
  waterTap: { name: '水の粉', kind: 'spell', effect: 'singleDamage', element: 'water', amount: 1, count: 1 },
  tank: { name: '大盾兵', kind: 'soldier', hp: 20, attack: 1, speed: 1, count: 1 },
};

const REACTIONS = {
  attachTurns: 3,
  reactions: { annihilation: { name: '対消滅', elements: ['light', 'dark'], damage: 8 } },
};

/** p1 の番（ターン1）で始める。山札はヒールだけ。play(pid, type, target) はその人の手札から出す（枠は戻す） */
function setup({ hands = {}, rules: rulesPatch = {}, reactions = null } = {}) {
  const cards = { ...loadFixture('cards-step2.json'), ...EXTRA, ...buildData({ mode: MODE }).cards };
  const rules = { ...loadFixture('rules.json'), elementBonus: 0, maxHand: 30, lightFirstStrike: true, ...rulesPatch };
  const game = new Game({ cards, rules, rng: seededRng(3), elements: ELEMENTS, ...(reactions ? { reactions } : {}) });
  game.debugSetHand('p1', hands.p1 ?? []);
  game.debugSetHand('p2', hands.p2 ?? []);
  game.debugSetDeck(Array(60).fill('heal'));
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  const play = (pid, type, target) => {
    game.currentPlayer = pid;
    const p = game.players[pid];
    p.playedThisTurn = false;
    p.soldiersPlayedThisTurn = 0;
    const card = p.hand.find((c) => c.type === type);
    assert.ok(card, `${pid} の手札に ${type} がある`);
    const r = game.playCard(card.cardId, target);
    assert.equal(r.ok, true, `${type}: ${r.reason}`);
    return game.players[pid].soldiers.at(-1);
  };
  const events = (type) => log.filter((e) => e.event === type);
  return { game, log, play, events };
}

/** pid の進軍を1回だけ起こす */
function march(game, pid) {
  game.currentPlayer = pid;
  game.advanceSoldiers(game.players[pid]);
}

/** p1 の a（マス0）と p2 の b（p1 から見て1マス先）をぶつける。p1 が攻める（attacker = 'p1'）か、p2 が攻める */
function clash(p1Type, p2Type, { attacker = 'p1', rules, before } = {}) {
  const t = setup({ hands: { p1: [p1Type, 'lightBlade', 'fireBlade', 'shield1'], p2: [p2Type, 'lightBlade', 'shield1'] }, rules });
  const a = t.play('p1', p1Type);
  const b = t.play('p2', p2Type);
  b.position = 3; // p1 の兵士（マス0）から見て1つ先のマス
  before?.(t, a, b);
  t.log.length = 0;
  march(t.game, attacker);
  const damaged = t.events('soldierDamaged').filter((e) => e.cause === 'fight').map((e) => e.soldierId);
  return { ...t, a, b, damaged };
}

// ================= 光の先制 =================

test('光の先制：攻める側の光の兵士が相手を倒せるなら、反撃を受けない（攻める側の soldierDamaged は出ない）', () => {
  const { a, b, damaged, game } = clash('lightKnight', 'foe');
  assert.equal(game.players.p2.soldiers.includes(b), false, '相手は倒れる');
  assert.equal(a.hp, 5, '無傷');
  assert.deepEqual(damaged, [b.soldierId]);
});

test('光の先制：倒せないとき（HPが高い・盾で耐える）は、ふつうに同時に戦う', () => {
  const tough = clash('lightKnight', 'tough');
  assert.equal(tough.a.hp, 2, 'HP8は倒せない → 反撃を受ける');
  assert.equal(tough.b.hp, 3);
  assert.equal(tough.damaged.length, 2);
  // 盾も含めて判定：HP5＋盾1 は 5 では倒せない
  const shielded = clash('lightKnight', 'foe', { before: (t, a, b) => t.play('p2', 'shield1', { soldierId: b.soldierId }) });
  assert.equal(shielded.a.hp, 2, '盾で耐える → 反撃を受ける');
  assert.equal(shielded.b.hp, 1);
});

test('光の先制：守る側では効かない（攻められて戦うときは、ふつうに同時。人間の指示）', () => {
  const { a, b, damaged, game } = clash('foe', 'lightKnight', { attacker: 'p1' });
  assert.equal(game.players.p1.soldiers.includes(a), false, '攻めてきた兵士は倒れる');
  assert.equal(b.hp, 2, '守る側の光の兵士は反撃を受ける（無傷にならない）');
  assert.deepEqual(damaged, [b.soldierId, a.soldierId]);
});

test('光の先制：目くらまし・霧で光の側の攻撃が外れたら、ふつうの戦い（無傷にならない）', () => {
  const { a, b } = clash('lightKnight', 'foe', { before: (t, x) => { x.blinded = { chance: 1, turns: 1 }; } });
  assert.equal(b.hp, 5, '光の攻撃は外れる');
  assert.equal(a.hp, 2, '反撃を受ける');
});

test('光の先制：両方が光でも、先制するのは攻める側だけ', () => {
  const both = clash('lightKnight', 'lightKnight');
  assert.equal(both.a.hp, 5, '攻める側は無傷');
  assert.equal(both.game.players.p2.soldiers.length, 0);
  const one = clash('lightWeak', 'lightKnight');
  assert.equal(one.game.players.p1.soldiers.length, 0, '倒せない攻める側は、守る側の光の兵士に倒される（同時）');
  assert.equal(one.b.hp, 3, '守る側は先制しないので、攻める側の攻撃も当たる');
});

test('光の先制：光以外の兵士には効かない。ルールに lightFirstStrike がなければ効かない', () => {
  const plain = clash('bruiser', 'foe');
  assert.equal(plain.a.hp, 2, '光でない兵士は反撃を受ける');
  const off = clash('lightKnight', 'foe', { rules: { lightFirstStrike: false } });
  assert.equal(off.a.hp, 2, 'ルールがなければ同時');
  assert.equal(off.damaged.length, 2);
  // 火の武器で光でなくなった兵士にも効かない
  const fire = clash('lightKnight', 'foe', { before: (t, a) => t.play('p1', 'fireBlade', { soldierId: a.soldierId }) });
  assert.equal(fire.a.hp, 2);
});

test('光の先制：光の武器を持って光になった兵士にも効く（攻撃3＋3で HP5 を倒す）', () => {
  const { a, game } = clash('foe', 'foe', { before: (t, x) => t.play('p1', 'lightBlade', { soldierId: x.soldierId }) });
  assert.equal(a.element, 'light');
  assert.equal(a.hp, 5);
  assert.equal(game.players.p2.soldiers.length, 0);
});

test('光の先制：通常モード・クラシックのルールには書いていない（今までどおり）', () => {
  assert.equal(loadJson('rules.json').lightFirstStrike, undefined);
  assert.equal(buildData({ mode: 'classic' }).rules.lightFirstStrike, undefined);
  assert.equal(buildData({ mode: MODE }).rules.lightFirstStrike, true);
  for (const r of [loadJson('rules.json'), buildData({ mode: 'classic' }).rules, buildData({ mode: MODE }).rules]) assert.equal(r.lightCatalyst, undefined);
  const rules = loadFixture('rules.json');
  const cards = loadFixture('cards-step2.json');
  assert.throws(() => new Game({ cards, rules: { ...rules, lightFirstStrike: 1 } }), /lightFirstStrike/);
  assert.throws(() => new Game({ cards, rules: { ...rules, lightCatalyst: -1 } }), /lightCatalyst/);
});

// ================= 切り札 =================

test('切り札：王国は小回復を外して17種。神剣・勇者・神盾は各1枚・MP5・maxCopies 1', () => {
  const set = loadFactionCards(MODE, 'kingdom');
  assert.equal(Object.keys(set).length, 17);
  assert.equal(Object.values(set).some((d) => d.name === '小回復'), false);
  const deck = loadOptionalData(MODE).decks.kingdom.cards;
  for (const t of ['fac_king_god_sword', 'fac_king_hero', 'fac_king_god_shield']) {
    assert.equal(set[t].mpCost, 5, t);
    assert.equal(set[t].maxCopies, 1, t);
    assert.equal(deck[t], 1, t);
  }
  assert.deepEqual([set.fac_king_god_sword.attackBonus, set.fac_king_god_sword.element], [9, 'light']);
  assert.deepEqual([set.fac_king_hero.hp, set.fac_king_hero.attack, set.fac_king_hero.speed, set.fac_king_hero.innateElement], [14, 10, 2, 'light']);
  assert.deepEqual([set.fac_king_god_shield.effect, set.fac_king_god_shield.amount, set.fac_king_god_shield.statusWard], ['shieldSoldier', 15, true]);
});

test('切り札のデッキ検証：count が maxCopies を超えるとエラー', () => {
  assert.throws(() => factionDecks({ a: { name: 'A' } }, { a: { x: { name: '神剣', count: 2, maxCopies: 1 } } }), /「神剣」は1枚まで/);
  assert.deepEqual(factionDecks({ a: { name: 'A' } }, { a: { x: { count: 1, maxCopies: 1 } } }).a.cards, { x: 1 });
});

test('勇者：倒れても蘇生の対象にならない（前に倒れた兵士の記録はそのまま）', () => {
  const { game, play } = setup({ hands: { p1: ['foe', 'fac_king_hero', 'revive'] } });
  game.players.p1.mp = 20;
  const f = play('p1', 'foe');
  game.removeSoldier(game.players.p1, f, 'killed');
  const hero = play('p1', 'fac_king_hero');
  assert.equal(hero.element, 'light');
  game.removeSoldier(game.players.p1, hero, 'killed');
  assert.equal(game.players.p1.lastFallen.type, 'foe', '勇者は記録しない');
  game.players.p1.lastFallen = null;
  const hero2 = game.players.p1.soldiers.length;
  assert.equal(hero2, 0);
  const card = game.players.p1.hand.find((c) => c.type === 'revive');
  assert.equal(game.canPlayCard(card.cardId).ok, false);
});

test('神盾：盾15。盾が残っている間は状態異常（凍結・毒・呪い）を受けない。盾がなくなれば受ける', () => {
  const { game, play } = setup({ hands: { p1: ['tough', 'fac_king_god_shield'], p2: ['frostBreath', 'poison', 'curse', 'frostBreath'] } });
  game.players.p1.mp = 20;
  const s = play('p1', 'tough');
  play('p1', 'fac_king_god_shield', { soldierId: s.soldierId });
  assert.equal(s.shield, 15);
  assert.equal(game.getState('p1').players.p1.soldiers[0].statusWard, true);
  play('p2', 'frostBreath');
  play('p2', 'poison');
  play('p2', 'curse', { soldierId: s.soldierId });
  assert.equal(s.frozen, 0);
  assert.equal(s.poison, null);
  assert.equal(s.weakened, null);
  s.shield = 0;
  assert.equal(game.getState('p1').players.p1.soldiers[0].statusWard, undefined);
  play('p2', 'frostBreath');
  assert.ok(s.frozen > 0, '盾がなくなれば凍る');
});

// ================= 光の触媒（実験用） =================

test('光の触媒（lightCatalyst）：光の攻撃が属性の付いた敵兵士に当たると、属性を消して1種類ごとに追加ダメージ', () => {
  const { game, play, events } = setup({ hands: { p1: ['lightTap', 'lightTap', 'waterTap'], p2: ['tank', 'fireBlade'] }, rules: { lightCatalyst: 3 }, reactions: REACTIONS });
  game.players.p2.mp = 20;
  const t = play('p2', 'tank');
  play('p2', 'fireBlade', { soldierId: t.soldierId });
  play('p1', 'waterTap', { soldierId: t.soldierId }); // 水が付着（火＋水は反応の表にないので付くだけ）
  assert.deepEqual(t.attachments.map((a) => a.element), ['water']);
  play('p1', 'lightTap', { soldierId: t.soldierId });
  assert.equal(t.hp, 20 - 1 - 1 - 6, '水1・光1＋触媒 3×2種');
  assert.equal(t.element, null, '武器の属性も消える');
  assert.deepEqual(t.attachments, []);
  const r = events('reactionTriggered').at(-1);
  assert.equal(r.reaction, 'lightCatalyst');
  assert.deepEqual(r.consumed.sort(), ['fire', 'water']);
  // 何も付いていなければ、光が付くだけ
  play('p1', 'lightTap', { soldierId: t.soldierId });
  assert.deepEqual(t.attachments.map((a) => a.element), ['light']);
});

test('光の触媒：ルールに書かなければ起きない（光が付着するだけ）', () => {
  const { play } = setup({ hands: { p1: ['lightTap'], p2: ['tough', 'fireBlade'] }, reactions: REACTIONS });
  const t = play('p2', 'tough');
  play('p2', 'fireBlade', { soldierId: t.soldierId });
  play('p1', 'lightTap', { soldierId: t.soldierId });
  assert.equal(t.hp, 7);
  assert.equal(t.element, 'fire');
  assert.deepEqual(t.attachments.map((a) => a.element), ['light']);
});

// ================= CPU（smart 系）が切り札を使う =================

test('CPU（smart・guard）：勇者を先に出し、神剣は武器を持った兵士にも重ねて持たせる。神盾は倒されそうな兵士に', () => {
  for (const name of ['smart', 'guard']) {
    const { game, play } = setup({ hands: { p1: ['foe', 'lightBlade'], p2: ['bruiser'] } });
    const s = play('p1', 'foe');
    play('p1', 'lightBlade', { soldierId: s.soldierId }); // もう武器を持っている
    game.debugSetHand('p1', ['fac_king_hero', 'fac_king_god_sword']);
    game.currentPlayer = 'p1';
    game.players.p1.mp = 20;
    game.players.p1.playedThisTurn = false;
    game.players.p1.soldiersPlayedThisTurn = 0;
    const cards = { ...game.cardDefs };
    STRATEGIES[name].takeTurn(game, 'p1', seededRng(2), { cards, rules: game.rules, upgrades: {}, discardCount: 0 });
    const hero = game.players.p1.soldiers.find((x) => x.type === 'fac_king_hero');
    assert.ok(hero, `${name}：勇者を出す`);
    assert.equal(hero.weapon, 'fac_king_god_sword', `${name}：神剣は勇者に`);
  }
  // 神盾：相手の強い兵士がすぐ前にいて、倒されそうな兵士に
  const { game, play } = setup({ hands: { p1: ['foe'], p2: ['bruiser'] } });
  const s = play('p1', 'foe');
  play('p2', 'bruiser').position = 3;
  game.debugSetHand('p1', ['fac_king_god_shield']);
  game.currentPlayer = 'p1';
  game.players.p1.mp = 20;
  STRATEGIES.smart.takeTurn(game, 'p1', seededRng(2), { cards: { ...game.cardDefs }, rules: game.rules, upgrades: {}, discardCount: 0 });
  assert.equal(s.shield, 15);
});
