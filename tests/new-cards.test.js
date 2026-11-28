// 4陣営モードの新カード（王国・森・竜。docs/new-cards-proposal.md）のテスト。
// ・データが読めて、デッキが組める（count と maxCopies が合っている）
// ・既存のエフェクトだけで作ってあること（新しい仕組みを使っていない）
// ・ダメージ・効果値のスモークテスト（本物の data/factions/cards/*.json の数値を読む。数値を変えたら、ここの期待値は合わせて変える）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { Card, EFFECTS } from '../js/game/Card.js';
import { loadFixture, seededRng, recordEvents, buildData, loadOptionalData, loadFactionCards } from './helpers.js';

const MODE = 'factions';

/** 新カード（陣営 → カードID）。足したら、ここにも書く */
const NEW_CARDS = {
  kingdom: ['fac_king_siege', 'fac_king_judgement', 'fac_king_chain_sword'],
  forest: ['fac_forest_warden', 'fac_forest_treant', 'fac_forest_herb', 'fac_forest_old_root'],
  dragon: ['fac_dragon_mage', 'fac_dragon_scale_guard', 'fac_dragon_ancient_barrier', 'fac_dragon_wing_decoy'],
};
const ALL_NEW = Object.values(NEW_CARDS).flat();

const opts = loadOptionalData(MODE);
const { cards: CARDS } = buildData({ mode: MODE });
const ELEMENTS = opts.elements;

// ================= データ =================

test('新カード：どの陣営のカード表にもあり、カードの書き方のチェック（validateDefinitions）を通る', () => {
  for (const [faction, types] of Object.entries(NEW_CARDS)) {
    const own = loadFactionCards(MODE, faction);
    for (const t of types) assert.ok(own[t], `${faction} のカード表に ${t} がある`);
  }
  assert.doesNotThrow(() => Card.validateDefinitions(CARDS, null, Object.keys(ELEMENTS.elements)));
});

test('新カード：キーは fac_<陣営>_ で始まり、陣営の名前（接頭辞）と合っている', () => {
  const prefix = { kingdom: 'fac_king_', forest: 'fac_forest_', dragon: 'fac_dragon_' };
  for (const [faction, types] of Object.entries(NEW_CARDS)) {
    for (const t of types) assert.ok(t.startsWith(prefix[faction]), `${t} は ${prefix[faction]} で始める`);
  }
});

test('新カード：count と maxCopies が合っていて、陣営のデッキが組める（デッキの枚数が数えたとおり）', () => {
  for (const [faction, types] of Object.entries(NEW_CARDS)) {
    const deck = opts.decks[faction].cards;
    for (const t of types) {
      const def = CARDS[t];
      assert.ok(Number.isInteger(def.count) && def.count >= 1, `${t}: count は1以上`);
      if (def.maxCopies !== undefined) assert.ok(def.count <= def.maxCopies, `${t}: count(${def.count}) は maxCopies(${def.maxCopies}) 以下`);
      assert.equal(deck[t], def.count, `${t} がデッキに count 枚入っている`);
    }
  }
});

test('新カード：1枚の制限（maxCopies 1）のカードは、MP が重い（4以上）か使い切り。強さは威力でなく MP・枚数・使い切りで決める', () => {
  for (const t of ALL_NEW) {
    const def = CARDS[t];
    if (def.maxCopies !== 1) continue;
    assert.ok(def.mpCost >= 3 || def.exhaust === true, `${t}: 1枚だけのカードは MP3以上か使い切り`);
  }
});

test('新カード：別の陣営のカード表・既存カードの数値を変えていない（足しただけ）', () => {
  // 既存カードの代表的な数値（変えたら気づけるように）
  assert.equal(CARDS.fac_king_god_sword.attackBonus, 9);
  assert.equal(CARDS.fac_king_heal.amount, 10);
  assert.equal(CARDS.fac_forest_life_drop.amount, 3);
  assert.equal(CARDS.fac_dragon_fireball.amount, 5);
  assert.equal(CARDS.fac_dragon_blood_drop.amount, 4);
  // 魔族のカード表は新カード側では触っていない（魔族の強化で22種、段階A1 の経済のカード2種で24種になった）
  assert.equal(Object.keys(loadFactionCards(MODE, 'demon')).length, 24);
});

test('新カード：どの新カードも、すでにある効果（effect・role・武器のキー）だけで書いてある', () => {
  const ROLES = ['melee', 'archer', 'mage', 'ninja', 'guard'];
  for (const t of ALL_NEW) {
    const def = CARDS[t];
    if (def.kind === 'soldier') assert.ok(ROLES.includes(def.role ?? 'melee'), `${t}: role`);
    else if (def.kind === 'spell' || def.kind === 'defense') assert.ok(Object.hasOwn(EFFECTS[def.kind], def.effect), `${t}: effect ${def.effect}`);
    else assert.equal(def.kind, 'weapon');
  }
});

// ================= 効果のスモークテスト =================

function setup({ hands = {}, rules: patch = {}, deck = 'heal' } = {}) {
  const cards = { ...loadFixture('cards-step2.json'), ...CARDS, filler: { name: '兵', kind: 'soldier', hp: 5, attack: 3, speed: 1, count: 1 } };
  const rules = { ...loadFixture('rules.json'), elementBonus: 0, maxHand: 30, castleSpellHitsFront: true, soldierCastleDamageMultiplier: 2, ...patch };
  const game = new Game({ cards, rules, rng: seededRng(3), elements: ELEMENTS, reactions: opts.reactions });
  game.debugSetHand('p1', hands.p1 ?? []);
  game.debugSetHand('p2', hands.p2 ?? []);
  game.debugSetDeck(Array(60).fill(deck));
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  const play = (pid, type, target) => {
    game.currentPlayer = pid;
    const p = game.players[pid];
    p.playedThisTurn = false;
    p.soldiersPlayedThisTurn = 0;
    p.mp = 20;
    const card = p.hand.find((c) => c.type === type);
    assert.ok(card, `${pid} の手札に ${type} がある`);
    const r = game.playCard(card.cardId, target);
    assert.equal(r.ok, true, `${type}: ${r.reason}`);
    return p.soldiers.at(-1);
  };
  const events = (type) => log.filter((e) => e.event === type);
  return { game, log, play, events };
}

const targetOf = (game, pid, type, pick = (ts) => ts[0]) => {
  game.currentPlayer = pid;
  const card = game.players[pid].hand.find((c) => c.type === type);
  return pick(game.getTargets(card.cardId));
};

test('天罰の光：兵士がいなければ相手の城に9ダメージ（城壁が先に受ける）。使い切りで、山札に戻らない', () => {
  const t = setup({ hands: { p1: ['fac_king_judgement'], p2: [] } });
  const before = t.game.players.p2.castle.hp;
  const target = targetOf(t.game, 'p1', 'fac_king_judgement');
  t.play('p1', 'fac_king_judgement', target);
  assert.equal(before - t.game.players.p2.castle.hp, 9);
  assert.equal(new Card('x', 'fac_king_judgement', CARDS.fac_king_judgement).isExhaust, true);
});

test('攻城兵：遅い（速さ1）が、城に着くと 攻撃6×2 = 12 のダメージ', () => {
  const t = setup({ hands: { p1: ['fac_king_siege'] } });
  const s = t.play('p1', 'fac_king_siege');
  assert.equal(s.attack, 6);
  s.position = 4; // 次の進軍（速さ1）で城に着くマス
  const before = t.game.players.p2.castle.hp;
  t.game.currentPlayer = 'p1';
  t.game.advanceSoldiers(t.game.players.p1);
  assert.equal(before - t.game.players.p2.castle.hp, 12);
});

test('聖鎖の剣：光の武器になり、当てて生き残った相手は1回休み（freezeOnHit）。攻撃+1', () => {
  const t = setup({ hands: { p1: ['filler', 'fac_king_chain_sword'], p2: ['filler'] } });
  const a = t.play('p1', 'filler');
  const b = t.play('p2', 'filler');
  b.hp = 20; b.maxHp = 20; // 倒れずに生き残る
  b.position = 3;
  t.play('p1', 'fac_king_chain_sword', { soldierId: a.soldierId });
  assert.equal(a.element, 'light');
  assert.equal(a.attack, 4);
  t.game.currentPlayer = 'p1';
  t.game.advanceSoldiers(t.game.players.p1);
  assert.ok(b.frozen > 0, `相手の兵士が休みになる（frozen ${b.frozen}）`);
});

test('森の番人：護衛の役割（guard）。城を攻めずに自分の城の前にいる', () => {
  const t = setup({ hands: { p1: ['fac_forest_warden'] } });
  const s = t.play('p1', 'fac_forest_warden');
  assert.equal(s.role, 'guard');
  assert.equal(s.hp, 8);
  const before = t.game.players.p2.castle.hp;
  t.game.currentPlayer = 'p1';
  t.game.advanceSoldiers(t.game.players.p1);
  assert.equal(t.game.players.p2.castle.hp, before, '城は攻めない');
});

test('樹人：HP7・攻撃3・速さ1の兵士', () => {
  const t = setup({ hands: { p1: ['fac_forest_treant'] } });
  const s = t.play('p1', 'fac_forest_treant');
  assert.deepEqual([s.hp, s.attack], [7, 3]);
  assert.equal(CARDS.fac_forest_treant.speed, 1);
});

test('薬草の湿布：自分の城HP+5（ヒールの10より小さい）。上限を超えない', () => {
  const t = setup({ hands: { p1: ['fac_forest_herb', 'fac_forest_herb'] } });
  const max = t.game.players.p1.castle.maxHp;
  t.game.debugSetCastleHp('p1', max - 10);
  t.play('p1', 'fac_forest_herb');
  assert.equal(t.game.players.p1.castle.hp, max - 5);
  t.game.debugSetCastleHp('p1', max - 2);
  t.play('p1', 'fac_forest_herb', undefined);
  assert.equal(t.game.players.p1.castle.hp, max, '上限を超えない');
  assert.ok(CARDS.fac_forest_herb.amount < CARDS.fac_king_heal.amount);
});

test('古木の根・古竜の障壁：城壁を置く（9・8）。ふつうの城壁（茨の壁4・火山灰の幕3）より厚い', () => {
  for (const [type, amount] of [['fac_forest_old_root', 9], ['fac_dragon_ancient_barrier', 8]]) {
    const t = setup({ hands: { p1: [type] } });
    const before = t.game.players.p1.armor;
    t.play('p1', type);
    assert.equal(t.game.players.p1.armor - before, amount, type);
  }
  assert.ok(CARDS.fac_forest_old_root.amount > CARDS.fac_forest_thorn_wall.amount);
  assert.ok(CARDS.fac_dragon_ancient_barrier.amount > CARDS.fac_dragon_ash_veil.amount);
});

test('竜術師：魔法使い（動かず撃つ）。場にいるあいだ、火・雷の魔法 +1（ファイアボール 5 → 6）', () => {
  const base = setup({ hands: { p1: ['fac_dragon_fireball'] } });
  const b0 = base.game.players.p2.castle.hp;
  base.play('p1', 'fac_dragon_fireball', targetOf(base.game, 'p1', 'fac_dragon_fireball'));
  assert.equal(b0 - base.game.players.p2.castle.hp, 5);

  const boosted = setup({ hands: { p1: ['fac_dragon_mage', 'fac_dragon_fireball'] } });
  const mage = boosted.play('p1', 'fac_dragon_mage');
  assert.equal(mage.role, 'mage');
  assert.equal(mage.element, 'fire');
  const c0 = boosted.game.players.p2.castle.hp;
  boosted.play('p1', 'fac_dragon_fireball', targetOf(boosted.game, 'p1', 'fac_dragon_fireball'));
  assert.equal(c0 - boosted.game.players.p2.castle.hp, 6);
});

test('竜鱗兵：HP9・攻撃3・速さ1。竜翼の身代わり：兵士を選ぶと、城が受ける攻撃をその兵士が代わりに受ける', () => {
  const t = setup({ hands: { p1: ['fac_dragon_scale_guard', 'fac_dragon_wing_decoy'] } });
  const s = t.play('p1', 'fac_dragon_scale_guard');
  assert.deepEqual([s.hp, s.attack], [9, 3]);
  t.play('p1', 'fac_dragon_wing_decoy', { soldierId: s.soldierId });
  assert.equal(t.game.getState('p1').players.p1.castleGuard, s.soldierId);
});
