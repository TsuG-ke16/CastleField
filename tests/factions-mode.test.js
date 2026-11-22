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
  iceTap: { name: '氷の粉', kind: 'spell', effect: 'singleDamage', element: 'ice', amount: 1, count: 1 },
  lightTap: { name: '光の粉', kind: 'spell', effect: 'singleDamage', element: 'light', amount: 1, count: 1 },
  chaosTap: { name: '混沌の粉', kind: 'spell', effect: 'singleDamage', element: 'chaos', amount: 1, count: 1 },
  waterStream: { name: '水流', kind: 'spell', effect: 'singleDamage', element: 'water', amount: 1, attachTurns: 8, count: 1 },
  quake: { name: '地割れ', kind: 'spell', effect: 'singleDamage', element: 'earth', amount: 2, freezeTurns: 1, count: 1 },
  windAdd: { name: '風の精霊', kind: 'spell', effect: 'summonSpirit', spirit: 'wind', amount: 1, turns: 3, spiritMode: 'add', count: 1 },
  fireSpirit: { name: '火の精霊', kind: 'spell', effect: 'summonSpirit', spirit: 'fire', amount: 1, turns: 3, count: 1 },
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
function setup({ hands = {}, reactions = null, rules: rulesPatch = {}, real = false } = {}) {
  const cards = { ...loadFixture('cards-step2.json'), ...EXTRA, ...(real ? buildData({ mode: MODE }).cards : {}) };
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

test('土の精霊（spiritScope "soldiers"）：兵士が受けるダメージだけ軽くする。城は軽くしない', () => {
  const earth = { name: '土の精霊', kind: 'spell', effect: 'summonSpirit', spirit: 'earth', amount: 1, turns: 3, spiritScope: 'soldiers', count: 1 };
  const cards = { ...loadFixture('cards-step2.json'), ...EXTRA, earth };
  const game = new Game({ cards, rules: { ...loadFixture('rules.json'), maxHand: 30 }, rng: seededRng(3), elements: ELEMENTS });
  game.debugSetHand('p1', ['earth', 'tank']);
  game.debugSetHand('p2', ['fireball', 'fireBolt']);
  game.debugSetDeck(Array(60).fill('heal'));
  game.start();
  const play = (pid, type, target) => {
    game.currentPlayer = pid;
    game.players[pid].playedThisTurn = false;
    const r = game.playCard(game.players[pid].hand.find((c) => c.type === type).cardId, target);
    assert.equal(r.ok, true, r.reason);
  };
  play('p1', 'earth');
  play('p1', 'tank');
  const t = game.players.p1.soldiers[0];
  const hp = game.players.p1.castle.hp;
  play('p2', 'fireball');
  assert.equal(game.players.p1.castle.hp, hp - 8, '城は軽くならない');
  play('p2', 'fireBolt', { soldierId: t.soldierId });
  assert.equal(t.hp, 60 - 2, '兵士は3→2');
  assert.throws(() => new Game({ cards: { ...cards, earth: { ...earth, spirit: 'fire' } }, rules: loadFixture('rules.json'), elements: ELEMENTS }), /spiritScope/);
});

test('属性魔法の強化：カオスパルス（randomElementDamage）にもカードの属性で乗る', () => {
  const pulse = { name: 'カオスパルス', kind: 'spell', effect: 'randomElementDamage', element: 'chaos', amount: 3, count: 1 };
  const curser = { name: '呪術師', kind: 'soldier', role: 'mage', hp: 3, attack: 1, range: 1, stay: 5, spellBoost: { elements: ['chaos'], amount: 1 }, count: 1 };
  const cards = { ...loadFixture('cards-step2.json'), ...EXTRA, pulse, curser };
  const game = new Game({ cards, rules: { ...loadFixture('rules.json'), maxHand: 30, elementBonus: 0 }, rng: seededRng(3), elements: ELEMENTS });
  game.debugSetHand('p1', ['pulse', 'pulse', 'curser']);
  game.debugSetHand('p2', ['tank']);
  game.debugSetDeck(Array(60).fill('heal'));
  game.start();
  game.currentPlayer = 'p2';
  game.playCard(game.players.p2.hand[0].cardId);
  const t = game.players.p2.soldiers[0];
  game.currentPlayer = 'p1';
  const cast = () => {
    game.players.p1.playedThisTurn = false;
    assert.equal(game.playCard(game.players.p1.hand.find((c) => c.type === 'pulse').cardId, { soldierId: t.soldierId }).ok, true);
  };
  cast();
  assert.equal(t.hp, 57);
  game.playCard(game.players.p1.hand.find((c) => c.type === 'curser').cardId);
  cast();
  assert.equal(t.hp, 53);
});

test('射程+の突きは、すぐ前の魔物を飛び越えない（魔物と戦う）', () => {
  const { game, play, events } = setup({ hands: { p1: ['hitter', 'reachSpear'], p2: ['tank'] } });
  const h = play('p1', 'hitter');
  play('p1', 'reachSpear', { soldierId: h.soldierId });
  const t = play('p2', 'tank');
  t.position = 2; // 剣士から2マス先
  const road = game.findRoad(h.roadId);
  game.monsters.push({ monsterId: 'm99', type: 'x', roadId: road.roadId, square: road.toSquare('p1', 1), hp: 50, maxHp: 50, attack: 1, element: null, attackIn: 9, reward: 0, castleAttack: 1, toState() { return {}; } });
  game.fightMonster = (player, soldier, monster) => { game.emit('monsterClashed', { attacker: { playerId: player.id, soldierId: soldier.soldierId }, monsterId: monster.monsterId, roadId: road.roadId, square: 1 }); };
  march(game, 'p1');
  assert.equal(t.hp, 60, '魔物の向こうの兵士は突けない');
  assert.equal(events('monsterClashed').length, 1);
});

test('生まれつきの属性が反応で消えるときは、elementCleared に weapon を付けない。身代わりのイベントは忍者なら隠す', () => {
  const r = { attachTurns: 3, reactions: { evaporate: { name: '蒸発', elements: ['fire', 'water'], damage: 0 } } };
  const { play, events } = setup({ hands: { p1: ['waterTap'], p2: ['fireWhelp'] }, reactions: r });
  const w = play('p2', 'fireWhelp');
  play('p1', 'waterTap', { soldierId: w.soldierId });
  const cleared = events('elementCleared')[0];
  assert.equal(cleared.element, 'fire');
  assert.equal(Object.hasOwn(cleared, 'weapon'), false);
  assert.equal(w.element, null);
  // 忍者を身代わりにすると、castleGuardSet・castleGuarded に stealth が付く
  const ninja = { name: '忍者', kind: 'soldier', role: 'ninja', hp: 30, attack: 1, speed: 1, count: 1 };
  const cards = { ...loadFixture('cards-step2.json'), ...EXTRA, ninja };
  const game = new Game({ cards, rules: { ...loadFixture('rules.json'), maxHand: 30 }, rng: seededRng(3), elements: ELEMENTS });
  game.debugSetHand('p1', ['ninja', 'decoy']);
  game.debugSetHand('p2', ['fireball']);
  game.debugSetDeck(Array(60).fill('heal'));
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  game.playCard(game.players.p1.hand.find((c) => c.type === 'ninja').cardId);
  const n = game.players.p1.soldiers[0];
  assert.equal(game.playCard(game.players.p1.hand.find((c) => c.type === 'decoy').cardId, { soldierId: n.soldierId }).ok, true);
  game.currentPlayer = 'p2';
  game.playCard(game.players.p2.hand[0].cardId);
  for (const type of ['castleGuardSet', 'castleGuarded']) assert.equal(log.find((e) => e.event === type).stealth, 'p1', type);
});

// ================= カード表を案（人間が確定した表）と突き合わせる =================

// [名前, MP, 中身（書いたキーだけ比べる）]。兵士は 攻撃・HP・足（弓兵・魔法使いは足なし）
const S = (attack, hp, speed, extra = {}) => ({ kind: 'soldier', attack, hp, ...(speed ? { speed } : {}), ...extra });
const PLAN = {
  kingdom: [
    ['歩兵', 2, S(3, 5, 2)], ['騎兵', 3, S(4, 4, 3)], ['弓兵', 3, S(3, 3, 0, { role: 'archer' })], ['重装兵', 4, S(2, 9, 1)],
    ['聖術師', 4, S(2, 4, 0, { role: 'mage', innateElement: 'light' })],
    ['聖鉄の剣', 2, { kind: 'weapon', attackBonus: 2, element: 'light' }], ['ルミナスランス', 2, { kind: 'weapon', attackBonus: 1, element: 'light', rangeBonus: 1 }],
    ['ルミナ', 3, { effect: 'damageEnemySoldiers', amount: 2, element: 'light', scope: 'lane' }], ['ホーリーレイ', 4, { effect: 'singleDamage', amount: 5, element: 'light' }],
    ['小回復', 2, { effect: 'healOwnCastle', amount: 5 }], ['ヒール', 4, { effect: 'healOwnCastle', amount: 10 }],
    ['盾', 1, { effect: 'shieldSoldier', amount: 3 }], ['城壁', 2, { effect: 'armorCastle', amount: 5 }], ['身代わり', 3, { effect: 'guardCastle' }],
    ['浄化', 2, { effect: 'purifyFlare', amount: 0, clearEnemyAttachments: true }],
  ],
  forest: [
    ['獣人', 2, S(4, 5, 2)], ['エルフ', 3, S(3, 3, 0, { role: 'archer' })], ['ドルイド', 4, S(2, 4, 0, { role: 'mage', spellBoost: { elements: ['fire', 'water', 'wind', 'earth'], amount: 1 } })],
    // 精霊のカード4枚は、常時の精霊（陣営の特性）に変えてなくし、属性の武器4枚にした（人間の指示）
    ['フレイムソード', 2, { kind: 'weapon', attackBonus: 1, element: 'fire' }], ['アクアスピア', 2, { kind: 'weapon', attackBonus: 1, element: 'water' }],
    ['ゲイルボウ', 2, { kind: 'weapon', attackBonus: 1, element: 'wind' }], ['アースハンマー', 2, { kind: 'weapon', attackBonus: 1, element: 'earth' }],
    // 属性魔法は改名した（効果・MP3 は同じ。いったん MP2 にしたが、人間の指示で3に戻した）
    ['フレアシード', 3, { effect: 'singleDamage', amount: 4, element: 'fire' }], ['スプリングウェーブ', 3, { effect: 'singleDamage', amount: 3, element: 'water', attachTurns: 8 }],
    ['リーフストーム', 3, { effect: 'damageEnemySoldiers', amount: 2, element: 'wind', scope: 'lane' }], ['ルートバインド', 3, { effect: 'singleDamage', amount: 3, element: 'earth', freezeTurns: 1 }],
    ['生命の雫', 3, { effect: 'healCastleAndSoldiers' }], ['茨の壁', 2, { effect: 'armorCastle', amount: 4 }], ['樹皮の盾', 1, { effect: 'shieldSoldier', amount: 3 }],
  ],
  demon: [
    ['骸骨兵', 2, S(3, 5, 2, { innateElement: 'dark' })], ['小悪魔', 2, S(4, 3, 3, { innateElement: 'dark' })],
    ['呪術師', 3, S(2, 3, 0, { role: 'mage', spellBoost: { elements: ['dark', 'ice', 'chaos'], amount: 1 } })],
    ['シャドウサイズ', 2, { kind: 'weapon', attackBonus: 2, element: 'dark' }], ['フロストブレード', 2, { kind: 'weapon', attackBonus: 1, element: 'ice', freezeOnHit: 1 }],
    ['カオスロッド', 2, { kind: 'weapon', attackBonus: 1, element: 'chaos' }],
    ['シャドウ', 3, { effect: 'singleDamage', amount: 4, element: 'dark', target: 'front' }], ['氷の息', 3, { effect: 'freezeEnemySoldiers', turns: 1, element: 'ice', scope: 'lane' }],
    ['カオスパルス', 3, { effect: 'randomElementDamage', amount: 3, element: 'chaos', target: 'front' }],
    ['毒の霧', 3, { effect: 'poisonEnemySoldiers', amount: 1, turns: 3 }], ['呪いの印', 2, { effect: 'weakenAttack', amount: 2, turns: 3 }],
    ['魂の欠片', 3, { effect: 'damageCastleAndHeal', amount: 3, heal: 3 }], ['残響の魂', 4, { effect: 'reviveFallen', amount: 0.5 }],
    ['血の膜', 2, { effect: 'armorCastle', amount: 4, bloodArmor: true }], ['骨の盾', 1, { effect: 'shieldSoldier', amount: 3 }],
  ],
  dragon: [
    ['竜人の新兵', 3, S(4, 5, 2)], ['竜騎兵', 3, S(5, 3, 3)], ['幼炎竜', 4, S(5, 5, 2, { innateElement: 'fire' })], ['幼雷竜', 4, S(4, 4, 3, { innateElement: 'thunder' })],
    ['竜牙剣', 2, { kind: 'weapon', attackBonus: 2, element: 'fire' }], ['雷牙槍', 2, { kind: 'weapon', attackBonus: 2, element: 'thunder', rangeBonus: 1 }],
    ['ファイアボール', 3, { effect: 'damageEnemyCastle', amount: 5, element: 'fire' }], ['雷光', 3, { effect: 'damageEnemySoldiers', amount: 3, element: 'thunder', scope: 'lane' }],
    ['火炎の吐息', 4, { effect: 'breathAttack', amount: 4, castleAmount: 4, element: 'fire' }], ['竜血の雫', 2, { effect: 'healSoldier' }],
    ['火山灰の幕', 2, { effect: 'armorCastle', amount: 3 }], ['幼竜の鱗', 1, { effect: 'shieldSoldier', amount: 2 }],
  ],
};

test('カード表：56枚の名前・攻撃・HP・足・MP・効果量・属性が案の表と同じ', () => {
  for (const [f, rows] of Object.entries(PLAN)) {
    const set = Object.values(loadFactionCards(MODE, f));
    assert.deepEqual(set.map((d) => d.name), rows.map((r) => r[0]), `${f} のカードの並び`);
    for (const [name, mp, want] of rows) {
      const d = set.find((x) => x.name === name);
      assert.equal(d.mpCost, mp, `${name} の MP`);
      for (const [k, v] of Object.entries(want)) assert.deepEqual(d[k], v, `${name}.${k}`);
      if (d.kind === 'soldier' && d.role) assert.equal(d.speed, undefined, `${name} は動かない`);
    }
  }
});

/** 4陣営の本物のカード（とテスト用のカード）と、本物の反応で遊ぶ */
function setupReal(opts = {}) {
  return setup({ ...opts, reactions: opts.reactions === undefined ? loadOptionalData(MODE).reactions : opts.reactions, real: true });
}

test('本物のカード：森には精霊のカード（summonSpirit）がない。精霊は陣営の特性（passiveSpirits）', () => {
  const forest = loadFactionCards(MODE, 'forest');
  assert.equal(Object.values(forest).some((d) => d.effect === 'summonSpirit'), false);
  for (const t of ['fac_forest_fire_spirit', 'fac_forest_water_spirit', 'fac_forest_wind_spirit', 'fac_forest_earth_spirit', 'fac_forest_fire_bolt', 'fac_forest_water_stream', 'fac_forest_gust', 'fac_forest_fissure']) {
    assert.equal(forest[t], undefined, t);
  }
  const decks = loadOptionalData(MODE).decks;
  assert.deepEqual(decks.forest.passiveSpirits.spirits.map((x) => [x.name, x.element, x.effect, x.amount]), [
    ['イフリート', 'fire', 'castleDamage', 2], ['ウンディーネ', 'water', 'soldiersDamage', 1], ['シルフ', 'wind', 'pushFront', 2], ['タイタン', 'earth', 'castleDamage', 5],
  ]);
  assert.equal(decks.forest.passiveSpirits.spirits[3].ignoreArmor, undefined, 'タイタンは城壁を無視しない（人間の指示）');
  assert.equal(decks.forest.passiveSpirits.spirits[2].push, 1);
  assert.equal(decks.forest.passiveSpirits.attachTurns, 1);
  for (const f of ['kingdom', 'demon', 'dragon']) assert.equal(decks[f].passiveSpirits, undefined, f);
});

test('本物のカード：魂の欠片・残響の魂・カオスパルス・氷の息・呪いの印・毒の霧（兵士だけ・3ターン・城は毒にしない）', () => {
  const { game, play } = setupReal({ hands: { p1: ['fac_demon_soul_shard', 'fac_demon_echo_soul', 'fac_demon_chaos_pulse', 'fac_demon_frost_breath', 'fac_demon_curse_mark', 'fac_demon_poison_mist', 'fragile'], p2: ['tank', 'fireTap'] }, reactions: null });
  game.debugSetCastleHp('p1', 10);
  const hp2 = game.players.p2.castle.hp;
  play('p1', 'fac_demon_soul_shard');
  assert.equal(game.players.p2.castle.hp, hp2 - 3);
  assert.equal(game.players.p1.castle.hp, 13);
  const f = play('p1', 'fragile');
  play('p2', 'fireTap', { soldierId: f.soldierId }); // 1 → 倒れない
  f.hp = 1;
  game.players.p2.hand.push(game.createCard('fireTap'));
  play('p2', 'fireTap', { soldierId: f.soldierId });
  play('p1', 'fac_demon_echo_soul');
  const back = game.players.p1.soldiers.at(-1);
  assert.equal(back.type, 'fragile');
  assert.equal(back.hp, 1); // 最大HP2の半分
  const t = play('p2', 'tank');
  play('p1', 'fac_demon_chaos_pulse'); // 先頭の兵士（大盾兵）に当たる
  assert.ok(t.hp <= 57);
  play('p1', 'fac_demon_frost_breath');
  assert.equal(t.frozen, 1);
  play('p1', 'fac_demon_curse_mark', { soldierId: t.soldierId });
  assert.deepEqual(t.weakened, { amount: 2, turns: 3 });
  play('p1', 'fac_demon_poison_mist');
  assert.deepEqual(t.poison, { amount: 1, turns: 3 });
  assert.equal(game.players.p2.castle.poison, null, '城は毒にしない');
});

test('本物のカード：竜のファイアボールは先頭の兵士に当たり、兵士がいなければ城に当たる', () => {
  const { game, play } = setupReal({ hands: { p1: ['fac_dragon_fireball', 'fac_dragon_fireball'], p2: ['tank'] }, rules: { castleSpellHitsFront: true } });
  const hp = game.players.p2.castle.hp;
  play('p1', 'fac_dragon_fireball');
  assert.equal(game.players.p2.castle.hp, hp - 5);
  const t = play('p2', 'tank');
  play('p1', 'fac_dragon_fireball');
  assert.equal(t.hp, 55);
  assert.equal(game.players.p2.castle.hp, hp - 5);
});

/** 本物の反応：p2 の大盾兵（盾つき）に、p1 が粉の魔法で属性を2つ当てる */
function react(first, second, { shield = 0, others = 0, frozen = 0 } = {}) {
  const ctx = setupReal({ hands: { p1: [first, second], p2: ['tank', ...Array(others).fill('tank')] } });
  const t = ctx.play('p2', 'tank');
  const rest = Array.from({ length: others }, () => ctx.play('p2', 'tank'));
  t.shield = shield;
  t.frozen = frozen;
  ctx.play('p1', first, { soldierId: t.soldierId });
  ctx.play('p1', second, { soldierId: t.soldierId });
  return { ...ctx, t, rest, r: ctx.events('reactionTriggered')[0] };
}

test('本物の反応：全部の組で起きて、それぞれの効果が出る', () => {
  let x = react('waterTap', 'fireBolt'); // 蒸発：3×0.5 → +2
  assert.equal(x.r.reaction, 'evaporate'); assert.equal(x.r.damage, 2);
  x = react('waterTap', 'earthTap'); // 泥
  assert.equal(x.r.reaction, 'mud'); assert.deepEqual(x.t.slowed, { amount: 1, turns: 2 });
  x = react('windTap', 'fireTap', { others: 1 }); // 炎拡散：同じマスのほかの兵士にも
  assert.equal(x.r.reaction, 'flameSpread'); assert.deepEqual(x.t.burn, { amount: 1, turns: 2 }); assert.deepEqual(x.rest[0].burn, { amount: 1, turns: 2 });
  x = react('windTap', 'earthTap'); // 砂嵐：目くらまし40%＋砂（やけどではない）
  assert.equal(x.r.reaction, 'sandstorm'); assert.equal(x.t.burn, null); assert.deepEqual(x.t.sand, { amount: 1, turns: 2 }); assert.deepEqual(x.t.blinded, { chance: 0.4, turns: 2 });
  x = react('windTap', 'waterTap'); // 霧
  assert.equal(x.r.reaction, 'fog'); assert.deepEqual(x.t.blinded, { chance: 0.3, turns: 2 }); assert.equal(x.t.burn, null);
  x = react('earthTap', 'fireTap', { shield: 5 }); // 溶岩：盾5−1(土)=4 → 火で3 → 壊すのは3、+2
  assert.equal(x.r.reaction, 'lava'); assert.equal(x.r.damage, 5); assert.equal(x.t.shield, 0);
  x = react('thunderTap', 'fireTap', { others: 1 }); // 轟雷爆炎
  assert.equal(x.r.reaction, 'thunderBlaze'); assert.equal(x.rest[0].hp, 58); assert.equal(x.game.players.p2.castle.hp, x.game.players.p2.castle.maxHp - 3);
  x = react('darkTap', 'chaosTap'); // 深淵侵食
  assert.equal(x.r.reaction, 'abyss'); assert.deepEqual(x.game.players.p2.castle.healCut, { ratio: 0.5, turns: 2 });
  x = react('darkTap', 'iceTap'); // 黒氷：凍結＋凍傷（やけどではない）
  assert.equal(x.r.reaction, 'blackIce'); assert.equal(x.t.frozen, 1); assert.equal(x.t.burn, null); assert.deepEqual(x.t.frostbite, { amount: 1, turns: 2 });
  x = react('chaosTap', 'iceTap', { frozen: 1 }); // 砕氷：凍結中は+6
  assert.equal(x.r.reaction, 'shatter'); assert.equal(x.r.damage, 8); assert.equal(x.t.frozen, 0);
  x = react('darkTap', 'lightTap'); // 対消滅
  assert.equal(x.r.reaction, 'annihilation'); assert.equal(x.r.damage, 8);
  // 混沌反応：混沌＋2種（光・闇は表では組になるが、3種以上は混沌反応が先）
  const c = setupReal({ hands: { p1: ['chaosTap', 'fireTap', 'thunderTap'], p2: ['tank'] } });
  const t = c.play('p2', 'tank');
  t.attachments = [{ element: 'chaos', turns: 5 }, { element: 'water', turns: 5 }];
  c.play('p1', 'thunderTap', { soldierId: t.soldierId });
  assert.equal(c.events('reactionTriggered')[0].reaction, 'chaos');
  assert.equal(c.events('reactionTriggered')[0].damage, 12);
});

test('身代わり：兵士の突入・精霊・反応からの城への攻撃を受ける。攻撃を受けたときの防御（defend）には出せない', () => {
  // 兵士の突入：城壁があるので防御を聞かれるが、身代わりは defend で出せない。兵士が代わりに受け、印は消える
  const a = setupReal({ hands: { p1: ['tank', 'decoy', 'decoy', 'fac_king_wall'], p2: ['hitter'] }, reactions: null, rules: { defenseReaction: true } });
  const g = a.play('p1', 'tank');
  a.play('p1', 'decoy', { soldierId: g.soldierId });
  g.position = 4; // 相手の城の前（突っ込んでくる兵士とはすれちがっている）
  const h = a.play('p2', 'hitter');
  h.position = 4;
  march(a.game, 'p2');
  assert.equal(a.game.phase, 'defend');
  const decoyCard = a.game.players.p1.hand.find((c) => c.type === 'decoy');
  assert.equal(a.game.canDefend(decoyCard.cardId).ok, false);
  assert.equal(a.game.passDefense().ok, true);
  assert.equal(g.hp, 60 - 3);
  assert.equal(a.game.players.p1.castle.guard, null);
  // 精霊
  const b = setupReal({ hands: { p1: ['tank', 'decoy'], p2: ['fireSpirit'] }, reactions: null });
  const g2 = b.play('p1', 'tank');
  b.play('p1', 'decoy', { soldierId: g2.soldierId });
  b.play('p2', 'fireSpirit');
  b.game.players.p2.spirit.fresh = false;
  b.game.triggerSpirit(b.game.players.p2);
  assert.equal(g2.hp, 59);
  assert.equal(b.events('castleGuarded').length, 1);
  // 反応（轟雷爆炎の城へのダメージ）
  const c = setupReal({ hands: { p1: ['thunderTap', 'fireTap'], p2: ['tank', 'tank', 'decoy'] } });
  const v = c.play('p2', 'tank');
  const g3 = c.play('p2', 'tank');
  c.play('p2', 'decoy', { soldierId: g3.soldierId });
  const hp = c.game.players.p2.castle.hp;
  c.play('p1', 'thunderTap', { soldierId: v.soldierId });
  c.play('p1', 'fireTap', { soldierId: v.soldierId });
  assert.equal(c.game.players.p2.castle.hp, hp);
  assert.equal(c.events('castleGuarded')[0].amount, 3);
  assert.equal(c.game.players.p2.castle.guard, null);
});
