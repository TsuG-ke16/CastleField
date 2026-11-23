// クラシックの属性（PR3a）のテスト：
//   new Game({ elements }) に属性の強弱の表を渡すと、その表の beats で「強いか」を決める。
//   渡さなければ（通常モード）、今までの4属性の輪（水→火→風→土→水）のまま。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { validateElements, beatsElement } from '../js/game/Elements.js';
import { loadData } from '../server/server.js';
import { buildData, loadFixture, loadOptionalData, seededRng, recordEvents } from './helpers.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const classicElements = () => JSON.parse(readFileSync(join(ROOT, 'data', 'classic', 'elements.json'), 'utf8'));

// 表にしかない属性の武器（攻撃+1）
const EXTRA_WEAPONS = {
  lightBlade: { name: '光の剣', kind: 'weapon', attackBonus: 1, element: 'light', count: 1 },
  darkBlade: { name: '闇の剣', kind: 'weapon', attackBonus: 1, element: 'dark', count: 1 },
  iceBlade: { name: '氷の剣', kind: 'weapon', attackBonus: 1, element: 'ice', count: 1 },
  chaosRod: { name: '混沌の杖', kind: 'weapon', attackBonus: 1, element: 'chaos', count: 1 },
};

/**
 * p1 の騎士（攻5）に武器 w1、p2 の騎士に武器 w2 を持たせて戦わせ、与えたダメージを [p1 が与えた, p2 が与えた] で返す。
 * 武器は攻撃+1 なので、属性の強みがなければ 6、強ければ 6 + elementBonus（2）= 8
 */
function clash(w1, w2, { elements = classicElements() } = {}) {
  const cards = { ...loadFixture('cards-step2.json'), ...(elements ? EXTRA_WEAPONS : {}) };
  const rules = { ...loadFixture('rules.json'), elementBonus: 2 };
  const game = new Game({ cards, rules, rng: seededRng(1), ...(elements ? { elements } : {}) });
  game.debugSetHand('p1', ['knight', w1]);
  game.debugSetHand('p2', ['knight', w2]);
  game.debugSetDeck(Array(30).fill('heal'));
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  const play = (type) => {
    const pid = game.currentPlayer;
    const card = game.getState(pid).players[pid].hand.find((c) => c.type === type);
    assert.equal(game.playCard(card.cardId).ok, true, type);
  };
  play('knight');
  play(w1);
  game.endTurn();
  play('knight');
  play(w2);
  game.endTurn(); // p1 の騎士が進んで、p2 の騎士と戦う
  const dmg = log.filter((e) => e.event === 'soldierDamaged' && e.cause === 'fight');
  const byP = (pid) => dmg.find((e) => e.playerId === pid).amount;
  return [byP('p2'), byP('p1')];
}

test('表あり：光は闇に強く、闇も光に強い（どちらも elementBonus が乗る）', () => {
  assert.deepEqual(clash('lightBlade', 'darkBlade'), [8, 8]);
});

test('表あり：氷は水に強い（水は氷に強くない）', () => {
  assert.deepEqual(clash('iceBlade', 'waterSpear'), [8, 6]);
});

test('表あり：混沌は何にも強くないし、混沌に強い属性もない', () => {
  for (const other of ['flameSword', 'waterSpear', 'windBow', 'earthHammer', 'lightBlade', 'darkBlade', 'iceBlade']) {
    assert.deepEqual(clash('chaosRod', other), [6, 6], other);
  }
  const table = classicElements();
  for (const id of Object.keys(table.elements)) {
    assert.equal(beatsElement(table, 'chaos', id), false, `混沌 → ${id}`);
    assert.equal(beatsElement(table, id, 'chaos'), false, `${id} → 混沌`);
  }
});

test('表あり：水は土に強い（今までの輪では土が水に強かった）', () => {
  assert.deepEqual(clash('waterSpear', 'earthHammer'), [8, 6]);
});

test('表なし（通常モード）：今までの4属性の輪のまま', () => {
  assert.deepEqual(clash('waterSpear', 'flameSword', { elements: null }), [8, 6]); // 水は火に強い
  assert.deepEqual(clash('waterSpear', 'earthHammer', { elements: null }), [6, 8]); // 土は水に強い
  assert.deepEqual(clash('flameSword', 'earthHammer', { elements: null }), [6, 6]); // 火と土はどちらも強くない
  // 表なしの判定は、Game.js の ELEMENT_BEATS と同じ
  for (const [a, b] of [['water', 'fire'], ['fire', 'wind'], ['wind', 'earth'], ['earth', 'water']]) {
    assert.equal(beatsElement(null, a, b), true);
    assert.equal(beatsElement(null, b, a), false);
  }
});

test('起動時のチェック：表にない属性はエラー（どこが悪いか書く）', () => {
  const base = { ...loadFixture('cards-step2.json') };
  const rules = loadFixture('rules.json');
  // 表なしでは、光などは使えない（今までどおり4つだけ）
  assert.throws(() => new Game({ cards: { ...base, lightBlade: EXTRA_WEAPONS.lightBlade }, rules }), /"lightBlade".*element は fire \/ water \/ wind \/ earth/);
  // 表ありでも、表にない属性はエラー
  const elements = classicElements();
  assert.throws(() => new Game({ cards: { ...base, x: { name: 'x', kind: 'weapon', attackBonus: 1, element: 'wood', count: 1 } }, rules, elements }), /"x".*element は fire .* chaos/);
  assert.throws(() => new Game({ cards: { ...base, x: { name: 'x', kind: 'spell', effect: 'damageEnemyCastle', amount: 3, element: 'wood', count: 1 } }, rules, elements }), /"x".*element/);
  // 魔物・ステージも同じ表で調べる
  const monsters = { m: { name: 'm', hp: 3, attack: 1, element: 'wood', weight: 1, reward: 1, attackEvery: 2, castleAttack: 1 } };
  assert.throws(() => new Game({ cards: base, rules: { ...rules, laneLength: 5 }, elements, monsters }), /monsters\.json の "m": element/);
  // 表の書き間違い
  assert.throws(() => validateElements({ elements: { fire: { name: '火', beats: ['wood'] } } }), /"fire".*"wood"/);
  assert.throws(() => validateElements({ elements: { fire: { name: '火' } } }), /beats/);
  assert.throws(() => validateElements({}), /elements/);
});

test('魔法に element を書ける（データだけ。ダメージは変わらない）。兵士・防御には書けない', () => {
  const rules = loadFixture('rules.json');
  const elements = classicElements();
  const hit = (fireballDef) => {
    const cards = { ...loadFixture('cards-step2.json'), fireball: fireballDef };
    const game = new Game({ cards, rules, rng: seededRng(1), elements });
    game.debugSetHand('p1', ['fireball']);
    const log = recordEvents(game, EVENT_TYPES);
    game.start();
    const id = game.getState('p1').players.p1.hand.find((c) => c.type === 'fireball').cardId;
    assert.equal(game.playCard(id).ok, true);
    const cast = log.find((e) => e.event === 'spellCast');
    assert.equal(Object.hasOwn(cast, 'element'), false); // イベントには載せない
    return log.find((e) => e.event === 'castleDamaged').amount;
  };
  const fireball = loadFixture('cards-step2.json').fireball;
  assert.equal(hit({ ...fireball, element: 'light' }), hit(fireball));
  const base = loadFixture('cards-step2.json');
  assert.throws(() => new Game({ cards: { ...base, knight: { ...base.knight, element: 'fire' } }, rules, elements }), /element を書けるのは武器.*魔法/);
  assert.throws(() => new Game({ cards: { ...base, shield: { ...base.shield, element: 'fire' } }, rules }), /element を書けるのは武器.*魔法/);
});

test('クラシック：全カードが new Game() で通り、すべての element が表にある', () => {
  const { cards, rules } = buildData({ mode: 'classic' });
  const opts = loadOptionalData('classic');
  assert.ok(opts.elements, 'modes.json の elementsSet から表が読まれる');
  assert.deepEqual(opts.elements, classicElements());
  const game = new Game({ cards, rules, ...opts, rng: seededRng(1) });
  game.start();
  for (const [type, def] of Object.entries(cards)) {
    if (def.element !== undefined) assert.ok(Object.hasOwn(opts.elements.elements, def.element), `${type}: ${def.element}`);
    assert.ok(!(def.description ?? '').includes('PR3'), `${type} の説明に PR3 の注記が残っている`);
  }
  const el = (t) => cards[t].element;
  assert.deepEqual(
    ['classic_king_holy_sword', 'classic_king_lumina_lance', 'classic_king_lumina', 'classic_king_holy_ray', 'classic_king_holy_fireball'].map(el),
    Array(5).fill('light'),
  );
  assert.deepEqual(['classic_demon_shadow_scythe', 'classic_demon_shadow', 'classic_demon_dark_fireball'].map(el), ['dark', 'dark', 'dark']);
  assert.deepEqual(['classic_demon_frost_blade', 'classic_demon_frost_breath'].map(el), ['ice', 'ice']);
  assert.equal(el('classic_demon_chaos_rod'), 'chaos');
  assert.equal(el('classic_demon_chaos_pulse'), undefined); // ランダムな属性で撃つ仮の魔法なので書かない
});

test('通常モードには表を渡さない（テストの読み込み・サーバーとも）', () => {
  assert.equal(loadOptionalData().elements, undefined);
  assert.equal(loadData().elements, undefined);
  assert.deepEqual(loadData(undefined, 'classic').elements, classicElements());
});
