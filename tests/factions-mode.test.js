// 4陣営モード（data/factions/。CLAUDE.md「4陣営モード」）のテスト：
//   データ（陣営ごとのカード表・デッキ・ルール・反応）と、4陣営のために足した仕組み
//   （生まれつきの属性・射程+・凍らせる武器・属性魔法の強化・付着の長い魔法・休ませる魔法・風の精霊の足し算・
//    兵士の回復・身代わり・付着を消す浄化・回数つきの毒・血の膜・火炎の吐息・反応の追加の効果）。
//   仕組みのテストは、data/ の調整で落ちないよう、tests/fixtures/ とこのファイルで決めた数値で確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { validateReactions, elementIds } from '../js/game/Elements.js';
import { factionDecks } from '../js/game/Setup.js';
import { loadFixture, loadJson, seededRng, recordEvents, buildData, loadOptionalData, loadFactionCards } from './helpers.js';
import { runMatch } from './sim/sim.js';

const MODE = 'factions';
const FACTIONS = { kingdom: 15, forest: 14, demon: 15, dragon: 12 };
const ELEMENTS = loadOptionalData(MODE).elements;

// ================= データ =================

test('データ：4陣営のカード表は王国15・森14・魔族15・竜12種。各陣営のカード表がそのままその陣営のデッキになる', () => {
  const { cards } = buildData({ mode: MODE });
  const opts = loadOptionalData(MODE);
  assert.deepEqual(Object.keys(opts.decks), Object.keys(FACTIONS));
  let total = 0;
  for (const [f, n] of Object.entries(FACTIONS)) {
    const set = loadFactionCards(MODE, f);
    assert.equal(Object.keys(set).length, n, f);
    total += n;
    assert.deepEqual(opts.decks[f].cards, Object.fromEntries(Object.entries(set).map(([t, d]) => [t, d.count])), f);
    for (const [t, d] of Object.entries(set)) {
      assert.ok(Number.isInteger(d.mpCost), `${t} に mpCost がある`);
      for (const key of ['rarity', 'fuseTo', 'weight', 'faction']) assert.equal(d[key], undefined, `${t}.${key}（レアリティを使わない）`);
    }
  }
  assert.equal(Object.keys(cards).length, total, '陣営のカード表を全部合わせたものがカード定義');
  // 入れないと決めたカード：聖壁の号砲（armorBlast）・竜の鼓動（竜威は保留）
  assert.equal(Object.values(cards).some((d) => d.effect === 'armorBlast'), false);
  assert.equal(Object.values(cards).some((d) => d.name === '竜の鼓動'), false);
  // 王国の防御は身代わり（3MP）
  const decoy = Object.values(loadFactionCards(MODE, 'kingdom')).find((d) => d.name === '身代わり');
  assert.equal(decoy.effect, 'guardCastle');
  assert.equal(decoy.mpCost, 3);
});

test('データ：4陣営のルールは専用（2枚ドロー固定・手札6枚・全カードでMP・各自のデッキ）。全モード共通の rules.json は変えない', () => {
  const { rules } = buildData({ mode: MODE });
  assert.equal(rules.drawPerTurn, 2);
  assert.equal(rules.firstTurnDraw, 2);
  assert.equal(rules.drawUntilHand, 0);
  assert.equal(rules.drawPerPlayed, false);
  assert.equal(rules.maxHand, 6);
  assert.equal(rules.mpAllCards, true);
  assert.equal(rules.maxMp, 20);
  assert.equal(rules.deckMode, 'own');
  assert.notEqual(loadJson('rules.json').deckMode, 'own', '通常モードのルールは変えていない');
  const modes = loadJson('modes.json');
  assert.equal(modes.modes.factions.rulesSet, 'data/factions/rules.json');
  assert.equal(modes.modes.factions.cardSet, undefined, 'cardSet はない（サーバー・画面はまだ読まない）');
});

test('データ：4陣営の反応（森の6つ・魔族の3つ・竜の1つ・対消滅）は正しい形で、全カードが new Game() で通る', () => {
  const opts = loadOptionalData(MODE);
  validateReactions(opts.reactions, elementIds(opts.elements));
  const ids = Object.keys(opts.reactions.reactions);
  for (const id of ['evaporate', 'mud', 'flameSpread', 'sandstorm', 'fog', 'lava', 'blackIce', 'abyss', 'shatter', 'thunderBlaze', 'annihilation']) assert.ok(ids.includes(id), id);
  assert.deepEqual(opts.reactions.reactions.lava.elements, ['fire', 'earth']);
  assert.deepEqual(opts.reactions.reactions.lava.shieldBreak, { bonus: 2 });
  const { rules, cards } = buildData({ mode: MODE });
  for (const f of Object.keys(FACTIONS)) {
    const game = new Game({ cards, rules, rng: seededRng(1), ...opts, setup: { decks: [f, 'kingdom'] } });
    assert.equal(game.getState('p1').players.p1.deckId, f);
    // 山札はその陣営のカードだけ
    const own = new Set(Object.keys(loadFactionCards(MODE, f)));
    for (const c of [...game.pileOf('p1').deck, ...game.players.p1.hand]) assert.ok(own.has(c.type), c.type);
  }
});

test('シミュレーション：どの陣営の組み合わせでも、smart 同士・random 同士の試合が最後まで進んで決着する', () => {
  const { rules, cards } = buildData({ mode: MODE });
  const opts = loadOptionalData(MODE);
  const fs = Object.keys(FACTIONS);
  let seed = 1;
  for (const a of fs) {
    for (const b of fs) {
      for (const st of ['smart', 'random']) {
        const r = runMatch({ cards, rules, strategies: [st, st], seed: seed++, gameOptions: { ...opts, setup: { decks: [a, b] } } });
        assert.ok(r.winner, `${a} × ${b}（${st}）が決着する`);
      }
    }
  }
});

test('factionDecks：カード表がない陣営はエラー。"_" で始まるキーと count 0 のカードは入れない', () => {
  assert.throws(() => factionDecks({ a: { name: 'A' } }, {}), /陣営 "a" のカード表がありません/);
  const decks = factionDecks({ _note: 'x', a: { name: 'A' } }, { a: { x: { count: 2 }, y: { count: 0 } } });
  assert.deepEqual(decks, { a: { name: 'A', cards: { x: 2 } } });
});

// ================= 仕組み（固定データ） =================

const EXTRA = {
  tank: { name: '大盾兵', kind: 'soldier', hp: 60, attack: 1, speed: 1, count: 1 },
  hitter: { name: '剣士', kind: 'soldier', hp: 10, attack: 3, speed: 1, count: 1 },
  fragile: { name: '小兵', kind: 'soldier', hp: 2, attack: 1, speed: 1, count: 1 },
  fireWhelp: { name: '幼炎竜', kind: 'soldier', hp: 5, attack: 2, speed: 1, innateElement: 'fire', count: 1 },
  archer1: { name: '弓兵', kind: 'soldier', role: 'archer', hp: 3, attack: 1, range: 1, stay: 5, count: 1 },
  druid: { name: 'ドルイド', kind: 'soldier', role: 'mage', hp: 4, attack: 1, range: 1, stay: 5, spellBoost: { elements: ['fire'], amount: 1 }, count: 1 },
  reachSpear: { name: '長槍', kind: 'weapon', attackBonus: 1, rangeBonus: 1, count: 1 },
  frostBlade: { name: '氷の剣', kind: 'weapon', attackBonus: 1, element: 'ice', freezeOnHit: 1, count: 1 },
  fireBolt: { name: '火炎弾', kind: 'spell', effect: 'singleDamage', element: 'fire', amount: 3, count: 1 },
  fireTap: { name: '火の粉', kind: 'spell', effect: 'singleDamage', element: 'fire', amount: 1, count: 1 },
  waterTap: { name: '水の粉', kind: 'spell', effect: 'singleDamage', element: 'water', amount: 1, count: 1 },
  windTap: { name: '風の粉', kind: 'spell', effect: 'singleDamage', element: 'wind', amount: 1, count: 1 },
  earthTap: { name: '土の粉', kind: 'spell', effect: 'singleDamage', element: 'earth', amount: 1, count: 1 },
  thunderTap: { name: '雷の粉', kind: 'spell', effect: 'singleDamage', element: 'thunder', amount: 1, count: 1 },
  darkTap: { name: '闇の粉', kind: 'spell', effect: 'singleDamage', element: 'dark', amount: 1, count: 1 },
  chaosTap: { name: '混沌の粉', kind: 'spell', effect: 'singleDamage', element: 'chaos', amount: 1, count: 1 },
  waterStream: { name: '水流', kind: 'spell', effect: 'singleDamage', element: 'water', amount: 1, attachTurns: 8, count: 1 },
  quake: { name: '地割れ', kind: 'spell', effect: 'singleDamage', element: 'earth', amount: 2, freezeTurns: 1, count: 1 },
  windAdd: { name: '風の精霊', kind: 'spell', effect: 'summonSpirit', spirit: 'wind', amount: 1, turns: 3, spiritMode: 'add', count: 1 },
  windMin: { name: '風の精霊（最低）', kind: 'spell', effect: 'summonSpirit', spirit: 'wind', amount: 1, turns: 3, count: 1 },
  bloodDrop: { name: '竜血の雫', kind: 'spell', effect: 'healSoldier', amount: 4, count: 1 },
  lifeDrop: { name: '生命の雫', kind: 'spell', effect: 'healCastleAndSoldiers', amount: 3, soldierHeal: 2, count: 1 },
  decoy: { name: '身代わり', kind: 'defense', effect: 'guardCastle', count: 1 },
  purify: { name: '浄化', kind: 'spell', effect: 'purifyFlare', amount: 0, clearEnemyAttachments: true, count: 1 },
  poison3: { name: '毒の霧', kind: 'spell', effect: 'poisonEnemy', amount: 1, turns: 3, count: 1 },
  bloodVeil: { name: '血の膜', kind: 'defense', effect: 'armorCastle', amount: 4, bloodArmor: true, count: 1 },
  breath: { name: '火炎の吐息', kind: 'spell', effect: 'breathAttack', element: 'fire', amount: 4, castleAmount: 4, count: 1 },
};

// 反応（テスト用の数値。data/factions/reactions.json の調整で落ちないように）
const REACTIONS = {
  attachTurns: 3,
  reactions: {
    evaporate: { name: '蒸発', elements: ['fire', 'water'], damage: 0, multiplier: 1.5 },
    mud: { name: '泥', elements: ['water', 'earth'], damage: 0, slow: { amount: 1, turns: 2 } },
    flameSpread: { name: '炎拡散', elements: ['wind', 'fire'], damage: 0, burn: { amount: 1, turns: 2, scope: 'adjacent' } },
    fog: { name: '霧', elements: ['wind', 'water'], damage: 0, blind: { chance: 1, turns: 1 } },
    lava: { name: '溶岩', elements: ['fire', 'earth'], damage: 0, shieldBreak: { bonus: 2 } },
    thunderBlaze: { name: '轟雷爆炎', elements: ['fire', 'thunder'], damage: 4, splash: { amount: 2, scope: 'lane' }, castleDamage: 3 },
    abyss: { name: '深淵侵食', elements: ['dark', 'chaos'], damage: 1, healCut: { ratio: 0.5, turns: 2 } },
  },
};

/**
 * p1 の番（ターン1）で始める。hands で手札を決める（山札はヒールだけ）。reactions を渡すと付着と反応あり
 * 返す play(pid, type, target) は、そのプレイヤーの手札から出す（メインの枠と兵士の枠は戻す。手番も pid にする）
 */
function setup({ hands = {}, reactions = null, rules: rulesPatch = {} } = {}) {
  const cards = { ...loadFixture('cards-step2.json'), ...EXTRA };
  const rules = { ...loadFixture('rules.json'), elementBonus: 0, maxHand: 30, ...rulesPatch };
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
  const can = (pid, type, target) => {
    game.currentPlayer = pid;
    const card = game.players[pid].hand.find((c) => c.type === type);
    return game.canPlayCard(card.cardId, target);
  };
  const events = (type) => log.filter((e) => e.event === type);
  return { game, log, play, can, events };
}

/** pid の進軍を1回だけ起こす（ターンを回さずに） */
function march(game, pid) {
  game.currentPlayer = pid;
  game.advanceSoldiers(game.players[pid]);
}

test('生まれつきの属性（innateElement）：出した兵士に属性が付く。武器を持つと上書き。書き間違いはエラー', () => {
  const { game, play } = setup({ hands: { p1: ['fireWhelp', 'frostBlade'] } });
  const s = play('p1', 'fireWhelp');
  assert.equal(game.getState('p1').players.p1.soldiers[0].element, 'fire');
  play('p1', 'frostBlade', { soldierId: s.soldierId });
  assert.equal(s.element, 'ice');
  const base = { ...loadFixture('cards-step2.json') };
  const rules = loadFixture('rules.json');
  assert.throws(() => new Game({ cards: { ...base, flameSword: { ...base.flameSword, innateElement: 'fire' } }, rules }), /innateElement/);
  assert.throws(() => new Game({ cards: { ...base, infantry: { ...base.infantry, innateElement: 'light' } }, rules }), /innateElement/); // 4属性の表には光がない
  assert.throws(() => new Game({ cards: { ...base, infantry: { ...base.infantry, element: 'fire' } }, rules }), /element を書けるのは武器/);
});

test('射程+（rangeBonus）：弓兵は撃てる距離がのびる', () => {
  for (const spear of [false, true]) {
    const { game, play, events } = setup({ hands: { p1: ['archer1', 'reachSpear'], p2: ['tank'] } });
    const a = play('p1', 'archer1');
    if (spear) play('p1', 'reachSpear', { soldierId: a.soldierId });
    const t = play('p2', 'tank');
    t.position = 2; // 弓兵から2マス先（射程1では届かない）
    march(game, 'p1');
    assert.equal(events('soldierShot').length, spear ? 1 : 0, `長槍 ${spear}`);
  }
});

test('射程+（rangeBonus）：進む兵士は2マス先の相手を、反撃を受けずに突く', () => {
  const { game, play, events } = setup({ hands: { p1: ['hitter', 'reachSpear'], p2: ['tank'] } });
  const h = play('p1', 'hitter');
  play('p1', 'reachSpear', { soldierId: h.soldierId });
  const t = play('p2', 'tank');
  t.position = 2; // 剣士（マス0）から見て2マス先
  march(game, 'p1');
  assert.equal(h.position, 0, '動かずに突く');
  assert.equal(t.hp, 60 - 4);
  assert.equal(h.hp, 10, '反撃を受けない');
  const dmg = events('soldierDamaged');
  assert.equal(dmg.length, 1);
  assert.equal(dmg[0].soldierId, t.soldierId);
  // 武器なしなら、1マス進んでからふつうに戦う（お互いに当たる）
  const b = setup({ hands: { p1: ['hitter'], p2: ['tank'] } });
  const h2 = b.play('p1', 'hitter');
  b.play('p2', 'tank').position = 2;
  march(b.game, 'p1');
  assert.equal(h2.position, 1);
  assert.equal(h2.hp, 9);
});

test('凍らせる武器（freezeOnHit）：攻撃が当たって生き残った相手は1回休み', () => {
  const { game, play, events } = setup({ hands: { p1: ['hitter', 'frostBlade'], p2: ['tank'] } });
  const h = play('p1', 'hitter');
  play('p1', 'frostBlade', { soldierId: h.soldierId });
  const t = play('p2', 'tank');
  t.position = 3; // 剣士の1マス先
  march(game, 'p1');
  assert.equal(t.frozen, 1);
  assert.equal(h.frozen, 0, '持ち主は凍らない');
  assert.ok(events('statusApplied').some((e) => e.soldierId === t.soldierId && e.status === 'frozen'));
});

test('属性魔法の強化（spellBoost）：ドルイドがいれば火の魔法のダメージ+1。ほかの属性・いないときは変わらない', () => {
  const { play } = setup({ hands: { p1: ['druid', 'fireBolt', 'fireBolt', 'waterTap'], p2: ['tank'] } });
  const t = play('p2', 'tank');
  play('p1', 'fireBolt', { soldierId: t.soldierId });
  assert.equal(t.hp, 57, 'ドルイドがいないと3');
  play('p1', 'druid');
  play('p1', 'fireBolt', { soldierId: t.soldierId });
  assert.equal(t.hp, 53, 'ドルイドがいると4');
  play('p1', 'waterTap', { soldierId: t.soldierId });
  assert.equal(t.hp, 52, '水は強化されない');
});

test('付着の長い魔法（attachTurns）・当たった兵士を休ませる魔法（freezeTurns）', () => {
  const { play, events } = setup({ hands: { p1: ['waterStream', 'quake', 'quake'], p2: ['tank', 'fragile'] }, reactions: { attachTurns: 3, reactions: {} } });
  const t = play('p2', 'tank');
  play('p1', 'waterStream', { soldierId: t.soldierId });
  assert.deepEqual(t.attachments, [{ element: 'water', turns: 8 }]);
  play('p1', 'quake', { soldierId: t.soldierId });
  assert.equal(t.frozen, 1);
  const f = play('p2', 'fragile');
  play('p1', 'quake', { soldierId: f.soldierId });
  assert.equal(events('statusApplied').filter((e) => e.soldierId === f.soldierId).length, 0, '倒れた兵士は休ませない');
});

test('風の精霊の足し算（spiritMode "add"）：速さ+1（"min" は最低値）', () => {
  for (const [type, to] of [['windAdd', 2], ['windMin', 1]]) {
    const { game, play } = setup({ hands: { p1: ['hitter', type] } });
    const h = play('p1', 'hitter');
    play('p1', type);
    game.players.p1.spirit.fresh = false;
    march(game, 'p1');
    assert.equal(h.position, to, type);
  }
  assert.throws(() => setup({ hands: {} }) && new Game({ cards: { ...loadFixture('cards-step2.json'), x: { ...EXTRA.windAdd, spirit: 'fire' } }, rules: loadFixture('rules.json') }), /spiritMode/);
});

test('竜血の雫（healSoldier）：傷ついた自分の兵士1体を最大HPまで回復。いなければ出せない', () => {
  const { play, can, events } = setup({ hands: { p1: ['bloodDrop', 'bloodDrop', 'bloodDrop', 'hitter'] } });
  assert.equal(can('p1', 'bloodDrop').reason, '道の上に自分の兵士がいません');
  const h = play('p1', 'hitter');
  assert.equal(can('p1', 'bloodDrop').reason, '傷ついた兵士がいません');
  h.hp = 4;
  play('p1', 'bloodDrop', { soldierId: h.soldierId });
  assert.equal(h.hp, 8);
  play('p1', 'bloodDrop', { soldierId: h.soldierId });
  assert.equal(h.hp, 10);
  assert.deepEqual(events('soldierHealed').map((e) => e.amount), [4, 2]);
});

test('生命の雫（healCastleAndSoldiers）：城と傷ついた兵士を回復。どちらも満タンなら出せない', () => {
  const { game, play, can } = setup({ hands: { p1: ['lifeDrop', 'lifeDrop', 'hitter'] } });
  const h = play('p1', 'hitter');
  assert.equal(can('p1', 'lifeDrop').ok, false);
  h.hp = 5;
  game.debugSetCastleHp('p1', 20);
  play('p1', 'lifeDrop');
  assert.equal(game.players.p1.castle.hp, 23);
  assert.equal(h.hp, 7);
});

test('身代わり（guardCastle）：次に城が受ける攻撃を兵士が代わりに受ける。1回で消える。毒は受けない', () => {
  const { game, play, events } = setup({ hands: { p1: ['hitter', 'decoy', 'decoy'], p2: ['fireball', 'fireball', 'poison3'] } });
  const h = play('p1', 'hitter');
  play('p1', 'decoy', { soldierId: h.soldierId });
  assert.equal(game.getState('p1').players.p1.castleGuard, h.soldierId);
  const hp = game.players.p1.castle.hp;
  play('p2', 'fireball');
  assert.equal(game.players.p1.castle.hp, hp, '城は減らない');
  assert.equal(h.hp, 2, '兵士が8を受ける');
  assert.equal(events('castleGuarded').length, 1);
  assert.equal(game.players.p1.castle.guard, null);
  play('p2', 'fireball');
  assert.equal(game.players.p1.castle.hp, hp - 8, '2発目は城に当たる');
  // 毒は身代わりが受けない（攻撃ではないため）
  play('p1', 'decoy', { soldierId: h.soldierId });
  play('p2', 'poison3');
  const before = game.players.p1.castle.hp;
  game.tickCastlePoison(game.players.p1);
  assert.equal(game.players.p1.castle.hp, before - 1);
  assert.equal(game.players.p1.castle.guard, h.soldierId, '身代わりは残る');
});

test('身代わり：守る兵士がもういなければ、城がそのまま受ける。カードがないモードの getState には castleGuard がない', () => {
  const { game, play } = setup({ hands: { p1: ['fragile', 'decoy'], p2: ['fireball'] } });
  const f = play('p1', 'fragile');
  play('p1', 'decoy', { soldierId: f.soldierId });
  game.players.p1.removeSoldier(f.soldierId);
  const hp = game.players.p1.castle.hp;
  play('p2', 'fireball');
  assert.equal(game.players.p1.castle.hp, hp - 8);
  const plain = new Game({ cards: loadFixture('cards-step2.json'), rules: loadFixture('rules.json'), rng: seededRng(1) });
  assert.equal(Object.hasOwn(plain.getState('p1').players.p1, 'castleGuard'), false);
  assert.equal(Object.hasOwn(plain.getState('p1').players.p1, 'bloodArmor'), false);
});

test('浄化（clearEnemyAttachments・ダメージ0）：相手の付着を消す。治すものも付着もなければ出せない', () => {
  const { play, can, events } = setup({ hands: { p1: ['waterTap', 'purify', 'purify'], p2: ['tank'] }, reactions: { attachTurns: 3, reactions: {} } });
  const t = play('p2', 'tank');
  assert.equal(can('p1', 'purify').reason, '治すものも、相手の付着もありません');
  play('p1', 'waterTap', { soldierId: t.soldierId });
  play('p1', 'purify');
  assert.deepEqual(t.attachments, []);
  assert.ok(events('elementCleared').some((e) => e.reason === 'purified' && e.element === 'water'));
  assert.equal(events('soldierDamaged').filter((e) => e.cause === 'spell').length, 1, '浄化はダメージを与えない（水の粉の1回だけ）');
  const cards = { ...loadFixture('cards-step2.json'), x: { ...EXTRA.purify, clearEnemyAttachments: undefined } };
  assert.throws(() => new Game({ cards, rules: loadFixture('rules.json') }), /amount/);
});

test('回数つきの毒（poisonEnemy の turns）：兵士も城も、カードの回数で治る', () => {
  const { game, play } = setup({ hands: { p1: ['poison3'], p2: ['tank'] } });
  const t = play('p2', 'tank');
  play('p1', 'poison3');
  assert.equal(t.poison.turns, 3);
  assert.equal(game.players.p2.castle.poisonTurns, 3);
});

test('血の膜（bloodArmor）：血の膜の城壁が受けたぶん、城HPが回復する', () => {
  const { game, play, events } = setup({ hands: { p1: ['fireball'], p2: ['bloodVeil'] }, rules: { armorMax: 40 } });
  play('p2', 'bloodVeil');
  assert.equal(game.getState('p2').players.p2.bloodArmor, 4);
  game.debugSetCastleHp('p2', 15);
  play('p1', 'fireball');
  const dmg = events('castleDamaged').at(-1);
  assert.equal(dmg.blocked, 4);
  assert.equal(events('castleHealed').at(-1).amount, 4);
  assert.equal(game.players.p2.castle.hp, 15 - 4 + 4);
  assert.equal(game.players.p2.castle.bloodArmor, 0);
});

test('火炎の吐息（breathAttack）：選んだ道の相手の兵士全員と、城壁を無視して城にダメージ', () => {
  const { game, play, events } = setup({ hands: { p1: ['breath'], p2: ['tank', 'wall'] } });
  const t = play('p2', 'tank');
  play('p2', 'wall');
  const hp = game.players.p2.castle.hp;
  play('p1', 'breath');
  assert.equal(t.hp, 56);
  assert.equal(game.players.p2.castle.hp, hp - 4);
  assert.equal(game.players.p2.armor, 5, '城壁は減らない');
  assert.equal(events('castleDamaged').at(-1).ignoreArmor, true);
});

// ================= 反応の追加の効果 =================

test('反応：蒸発（multiplier）は当たった攻撃のダメージの半分を足す', () => {
  const { play, events } = setup({ hands: { p1: ['waterTap', 'fireBolt'], p2: ['tank'] }, reactions: REACTIONS });
  const t = play('p2', 'tank');
  play('p1', 'waterTap', { soldierId: t.soldierId });
  play('p1', 'fireBolt', { soldierId: t.soldierId });
  const r = events('reactionTriggered')[0];
  assert.equal(r.reaction, 'evaporate');
  assert.equal(r.damage, 2); // ceil(3 × 0.5)
  assert.equal(t.hp, 60 - 1 - 3 - 2);
});

test('反応：炎拡散（burn・adjacent）は当たった兵士と、同じ道の前後1マスの兵士をやけどにする', () => {
  const { play } = setup({ hands: { p1: ['windTap', 'fireTap'], p2: ['tank', 'tank', 'tank'] }, reactions: REACTIONS });
  const a = play('p2', 'tank');
  const b = play('p2', 'tank');
  const c = play('p2', 'tank');
  a.position = 2; b.position = 1; c.position = 4;
  play('p1', 'windTap', { soldierId: a.soldierId });
  play('p1', 'fireTap', { soldierId: a.soldierId });
  assert.deepEqual(a.burn, { amount: 1, turns: 2 });
  assert.deepEqual(b.burn, { amount: 1, turns: 2 }, 'となりのマス');
  assert.equal(c.burn, null, '2マス離れた兵士はやけどにならない');
});

test('反応：泥（slow）は速さが下がる（最低1）。霧（blind）は攻撃が外れる。どちらも進軍のたびに減って治る', () => {
  const { game, play, events } = setup({ hands: { p1: ['waterTap', 'earthTap', 'windTap', 'waterTap', 'hitter'], p2: ['hitter', 'tank'] }, reactions: REACTIONS });
  const s = play('p2', 'hitter');
  play('p1', 'waterTap', { soldierId: s.soldierId });
  play('p1', 'earthTap', { soldierId: s.soldierId });
  assert.deepEqual(s.slowed, { amount: 1, turns: 2 });
  assert.equal(game.speedOf(game.players.p2, s), 1, '速さ1の兵士は1のまま（最低1）');
  const st = game.getState('p2').players.p2.soldiers[0].statuses;
  assert.deepEqual(st.slowed, { amount: 1, turns: 2 });
  const t = play('p2', 'tank');
  play('p1', 'windTap', { soldierId: t.soldierId });
  play('p1', 'waterTap', { soldierId: t.soldierId });
  assert.deepEqual(t.blinded, { chance: 1, turns: 1 });
  const h = play('p1', 'hitter');
  t.position = 3; // 剣士の1マス先
  march(game, 'p1'); // 剣士が攻める。守る大盾兵の攻撃は外れる
  assert.equal(h.hp, 10);
  assert.ok(events('attackMissed').some((e) => e.soldierId === t.soldierId));
  march(game, 'p2');
  assert.equal(t.blinded, null);
  assert.ok(events('statusCleared').some((e) => e.status === 'blinded'));
});

test('反応：轟雷爆炎（splash・castleDamage）は同じ道のほかの兵士と、相手の城にもダメージ', () => {
  const { game, play, events } = setup({ hands: { p1: ['thunderTap', 'fireTap'], p2: ['tank', 'tank'] }, reactions: REACTIONS });
  const a = play('p2', 'tank');
  const b = play('p2', 'tank');
  const hp = game.players.p2.castle.hp;
  play('p1', 'thunderTap', { soldierId: a.soldierId });
  play('p1', 'fireTap', { soldierId: a.soldierId });
  assert.equal(a.hp, 60 - 1 - 1 - 4);
  assert.equal(b.hp, 58);
  assert.equal(game.players.p2.castle.hp, hp - 3);
  assert.deepEqual(events('castleDamaged').at(-1).source, { kind: 'reaction', reaction: 'thunderBlaze' });
});

test('反応：溶岩（shieldBreak）は盾を全部壊して、壊した量＋2のダメージ', () => {
  const { play, events } = setup({ hands: { p1: ['earthTap', 'fireTap'], p2: ['tank', 'shield'] }, reactions: REACTIONS });
  const t = play('p2', 'tank');
  play('p2', 'shield', { soldierId: t.soldierId }); // 盾3
  play('p1', 'earthTap', { soldierId: t.soldierId }); // 盾 3→2
  play('p1', 'fireTap', { soldierId: t.soldierId }); // 盾 2→1、そのあと溶岩
  assert.equal(t.shield, 0);
  assert.deepEqual(events('shieldBroken').map((e) => e.amount), [1]);
  assert.equal(events('reactionTriggered')[0].damage, 3);
  assert.equal(t.hp, 57);
});

test('反応：深淵侵食（healCut）は相手の城の回復を減らす。城の持ち主のターンの始めに減って終わる', () => {
  const { game, play, events } = setup({ hands: { p1: ['darkTap', 'chaosTap'], p2: ['tank', 'heal'] }, reactions: REACTIONS });
  const t = play('p2', 'tank');
  play('p1', 'darkTap', { soldierId: t.soldierId });
  play('p1', 'chaosTap', { soldierId: t.soldierId });
  assert.deepEqual(game.getState('p2').players.p2.castleHealCut, { ratio: 0.5, turns: 2 });
  game.debugSetCastleHp('p2', 10);
  play('p2', 'heal');
  assert.equal(game.players.p2.castle.hp, 15, 'ヒール10が5になる');
  game.tickHealCut(game.players.p2);
  game.tickHealCut(game.players.p2);
  assert.equal(game.players.p2.castle.healCut, null);
  assert.equal(events('castleHealCutEnded').length, 1);
});

test('反応の書き間違いはエラー（multiplier・burn・blind・healCut）', () => {
  const ids = elementIds(ELEMENTS);
  const bad = (r) => () => validateReactions({ attachTurns: 3, reactions: { x: { name: 'x', elements: ['fire', 'water'], damage: 0, ...r } } }, ids);
  assert.throws(bad({ multiplier: 1 }), /multiplier/);
  assert.throws(bad({ burn: { amount: 1, turns: 2, scope: 'all' } }), /burn/);
  assert.throws(bad({ blind: { chance: 2, turns: 1 } }), /blind/);
  assert.throws(bad({ healCut: { ratio: 0, turns: 1 } }), /healCut/);
  assert.throws(bad({ shieldBreak: {} }), /shieldBreak/);
  assert.doesNotThrow(bad({ splash: { amount: 2 }, castleDamage: 3 }));
});

test('クラシックの getState は変わらない（鈍足・目くらましのキーはない）', () => {
  const { rules, cards } = buildData({ mode: 'classic' });
  const game = new Game({ cards, rules, rng: seededRng(1), ...loadOptionalData('classic') });
  game.debugSetHand('p1', ['classic_king_infantry']);
  game.start();
  for (const pid of game.getState(null).mulligan?.pending ?? []) game.mulligan(pid, []);
  const id = game.getState('p1').players.p1.hand.find((c) => c.type === 'classic_king_infantry')?.cardId;
  if (id) {
    const t = game.getTargets(id)[0];
    game.playCard(id, t);
    const st = game.getState('p1').players.p1.soldiers[0]?.statuses;
    if (st) assert.deepEqual(Object.keys(st).sort(), ['burn', 'frozen', 'poison', 'weakened']);
  }
  assert.equal(Object.hasOwn(game.getState('p1').players.p1, 'castleHealCut'), false);
});

test('身代わり：守る兵士が倒れた・城に着いて消えたら、身代わりの印も消える（CPU が消えた兵士のIDを見て詰まらない）', () => {
  // 倒れた
  const a = setup({ hands: { p1: ['fragile', 'decoy', 'decoy'], p2: ['fireTap'] }, reactions: { attachTurns: 3, reactions: {} } });
  const f = a.play('p1', 'fragile');
  a.play('p1', 'decoy', { soldierId: f.soldierId });
  f.hp = 1;
  a.play('p2', 'fireTap', { soldierId: f.soldierId });
  assert.equal(a.game.players.p1.soldiers.includes(f), false);
  assert.equal(a.game.getState('p1').players.p1.castleGuard, null);
  // 城に着いて消えた
  const b = setup({ hands: { p1: ['hitter', 'decoy'] } });
  const h = b.play('p1', 'hitter');
  b.play('p1', 'decoy', { soldierId: h.soldierId });
  h.position = 4;
  march(b.game, 'p1');
  assert.equal(b.game.players.p1.soldiers.includes(h), false);
  assert.equal(b.game.getState('p1').players.p1.castleGuard, null);
});

test('先頭に当たる1体への魔法（target "front"）：選んだ道の、自分の城にいちばん近い相手の兵士に当たる。いなければ出せない', () => {
  const extra = {
    frontShadow: { name: 'シャドウ', kind: 'spell', effect: 'singleDamage', element: 'dark', amount: 4, target: 'front', count: 1 },
    frontPulse: { name: 'カオスパルス', kind: 'spell', effect: 'randomElementDamage', element: 'chaos', amount: 3, target: 'front', count: 1 },
  };
  const cards = { ...loadFixture('cards-step2.json'), ...EXTRA, ...extra };
  const rules = { ...loadFixture('rules.json'), elementBonus: 0, maxHand: 30, laneCount: 2 };
  const game = new Game({ cards, rules, rng: seededRng(3), elements: ELEMENTS });
  game.debugSetHand('p1', ['frontShadow', 'frontPulse']);
  game.debugSetHand('p2', ['tank', 'tank', 'tank']);
  game.debugSetDeck(Array(60).fill('heal'));
  game.start();
  const id = (t) => game.players.p1.hand.find((c) => c.type === t).cardId;
  assert.equal(game.canPlayCard(id('frontShadow')).reason, '道の上に相手の兵士がいません');
  const [r1, r2] = game.roads.map((r) => r.roadId);
  game.currentPlayer = 'p2';
  for (const roadId of [r1, r1, r2]) {
    game.players.p2.soldiersPlayedThisTurn = 0;
    const c = game.players.p2.hand.find((x) => x.type === 'tank');
    assert.equal(game.playCard(c.cardId, { playerId: 'p1', roadId }).ok, true);
  }
  const [a, b, c] = game.players.p2.soldiers;
  a.position = 1; b.position = 3; // 道1：b が先頭（p1 の城に近い）
  game.currentPlayer = 'p1';
  assert.deepEqual(game.getTargets(id('frontShadow')), [{ playerId: 'p2', roadId: r1 }, { playerId: 'p2', roadId: r2 }]);
  assert.equal(game.playCard(id('frontShadow'), { playerId: 'p2', roadId: r1 }).ok, true);
  assert.equal(b.hp, 56);
  assert.equal(a.hp, 60);
  game.players.p1.playedThisTurn = false;
  assert.equal(game.playCard(id('frontPulse'), { playerId: 'p2', roadId: r2 }).ok, true);
  assert.ok(c.hp <= 57, '道2の兵士に当たる');
  assert.throws(() => new Game({ cards: { ...cards, x: { ...EXTRA.fireBolt, target: 'back' } }, rules, elements: ELEMENTS }), /target/);
});
