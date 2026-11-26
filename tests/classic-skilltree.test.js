// クラシックのスキルツリー（200ノードのグラフ版。仕様 docs/skilltree-200-spec.md・要約 docs/classic-skilltree.md）のテスト：
//   (1) データ（data/classic/skilltree.json）：200ノード・19系統・奥義19・横断48・ID重複なし・個別必須・生成スクリプトと一致
//   (2) 取得の決まり：全ノードに12pt以内の合法経路・第10章の4ビルド・奥義2個の拒否・必須・横断の片側取得・順序・予算
//   (3) 解除・設定値・保存とマイグレーション
//   (4) Game：setup.skills の受け取りと再検証（不正なら空ビルド）・単純な初期値系ノードの適用・クラシックの城・通常モードには効かない
//   (5) CPU のビルドの選び方
// 試合を通した確認（スキルなしで一致・プリセットどうしの試合・オンラインの部屋）は tests/classic-skilltree-play.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { Game } from '../js/game/Game.js';
import {
  validateSkillTree, treeIndex, nodes, cost, canAcquire, validate, acquirableIds, checkSet, orderBuild, release,
  validateConfig, normalizeBuild, serializeBuild, deserializeBuild, skillMods, skillTreeApi, isHandlerImplemented, STATIC_HANDLERS,
} from '../js/game/SkillTree.js';
import { chooseSkillBuild, SKILL_STYLE_OF, STRATEGIES } from '../js/game/strategies.js';
import { buildData, loadOptionalData, seededRng } from './helpers.js';

const TREE = () => loadOptionalData('classic').skillTree;

/** クラシックのゲーム。マリガンなし（start() のあとすぐ p1 のターン1） */
function classicGame({ skills, skillTree = TREE(), rules = {}, setup = {}, seed = 1 } = {}) {
  const { cards, rules: base } = buildData({ mode: 'classic', rules: { mulligan: false, ...rules } });
  const opts = loadOptionalData('classic');
  delete opts.stages;
  return new Game({ ...opts, cards, rules: base, skillTree, setup: { ...setup, ...(skills ? { skills } : {}) }, rng: seededRng(seed) });
}

/** 仕様 第10章の合法ビルド例 */
const SPEC_BUILDS = {
  critMagicLuck: ['C01', 'C02', 'C04', 'X01', 'M02', 'M01', 'M04', 'M06', 'M08', 'L01', 'L02', 'X11'],
  bloodHealDefense: ['B01', 'B02', 'X28', 'R02', 'R01', 'X08', 'D05', 'D03', 'D01', 'D07', 'D08', 'B03'],
  elementManaMagic: ['E01', 'E03', 'E05', 'E07', 'E08', 'X02', 'M03', 'M01', 'M02', 'E04', 'E06', 'X03'],
  graveTroopsSummon: ['G01', 'G03', 'G05', 'X06', 'U05', 'U03', 'U01', 'G07', 'G08', 'X46', 'V03', 'V01'],
};

// ================= (1) データ =================

test('データ：200ノード（通常133・奥義19・横断48）・19系統・ID重複なし・全部1pt・予算12', () => {
  const tree = TREE();
  validateSkillTree(tree);
  assert.equal(tree.version, 3);
  assert.equal(tree.budget, 12);
  assert.equal(tree.nodes.length, 200);
  assert.equal(new Set(tree.nodes.map((n) => n.id)).size, 200);
  assert.equal(Object.keys(tree.groups).length, 19);
  const ult = tree.nodes.filter((n) => n.ultimate);
  assert.equal(ult.length, 19);
  assert.ok(ult.every((n) => n.id.endsWith('08') && !n.cross));
  const cross = tree.nodes.filter((n) => n.cross);
  assert.deepEqual(cross.map((n) => n.id), Array.from({ length: 48 }, (_, i) => `X${String(i + 1).padStart(2, '0')}`));
  assert.equal(tree.nodes.length - ult.length - cross.length, 133);
  for (const g of Object.keys(tree.groups)) {
    assert.deepEqual(tree.nodes.filter((n) => n.group === g).map((n) => n.id), ['01', '02', '03', '04', '05', '06', '07', '08'].map((s) => `${g}${s}`));
  }
  for (const n of tree.nodes) {
    assert.equal(n.cost, 1, n.id);
    assert.equal(n.handler, n.id);
    assert.ok(n.desc.length > 0 && n.name.length > 0, n.id);
    assert.ok(Number.isFinite(n.layout?.x) && Number.isFinite(n.layout?.y), n.id);
  }
  // 幸運は中央・ほかはリング
  assert.equal(tree.groups.L.ring, null);
  assert.deepEqual(tree.ring, ['C', 'M', 'E', 'S', 'T', 'P', 'H', 'I', 'V', 'G', 'B', 'R', 'D', 'Q', 'U', 'K', 'F', 'A']);
  // QA 用の一覧
  assert.deepEqual(nodes(tree)[0], { id: 'C01', group: 'C', name: '会心の心得', ultimate: false, cross: false });
});

test('データ：辺は系統内テンプレート10本×19＋横断48×2だけ。個別必須は仕様の9件だけ。選択肢は E04・X25 だけ', () => {
  const tree = TREE();
  const ix = treeIndex(tree);
  const edges = new Set();
  for (const [a, set] of ix.adj) for (const b of set) edges.add([a, b].sort().join('-'));
  assert.equal(edges.size, 10 * 19 + 48 * 2);
  assert.deepEqual([...ix.adj.get('START')].sort(), Object.keys(tree.groups).map((g) => `${g}01`).sort());
  assert.deepEqual([...ix.adj.get('X01')].sort(), ['C04', 'M02']);
  const req = Object.fromEntries(tree.nodes.filter((n) => n.requires.length).map((n) => [n.id, n.requires]));
  assert.deepEqual(req, { M08: ['M02'], P08: ['P02'], G06: ['G02'], B07: ['B06'], B08: ['B01'], X04: ['P02'], X18: ['M02'], X22: ['M02'], X40: ['K02'] });
  assert.deepEqual(tree.nodes.filter((n) => n.config).map((n) => n.id), ['E04', 'X25']);
  const e04 = tree.nodes.find((n) => n.id === 'E04').config;
  assert.equal(e04.default, 'annihilation');
  assert.deepEqual(e04.options.map((o) => [o.id, o.amount]), [['annihilation', 4], ['blackIce', 4], ['shatter', 4], ['chaos', 5]]);
  const x25 = tree.nodes.find((n) => n.id === 'X25').config;
  assert.equal(x25.default, 'fire');
  assert.deepEqual(x25.options.map((o) => o.id), Object.keys(loadOptionalData('classic').elements.elements));
});

test('データ：data/classic/skilltree.json は tools/build-skilltree.mjs の出力と同じ（手で直していない）', () => {
  execFileSync(process.execPath, ['tools/build-skilltree.mjs', '--check'], { stdio: 'pipe' });
});

test('validateSkillTree：形の間違いを止める（版・重複ID・知らない端点・知らない必須・不正なプリセット）', () => {
  const bad = (f) => {
    const t = structuredClone(TREE());
    f(t);
    return () => validateSkillTree(t);
  };
  assert.throws(bad((t) => { t.version = 2; }), /version は 3/);
  assert.throws(bad((t) => { t.nodes[1].id = 'C01'; }), /重なっています/);
  assert.throws(bad((t) => { t.nodes.find((n) => n.id === 'X01').ends = ['C04', 'Z99']; }), /ends "Z99"/);
  assert.throws(bad((t) => { t.nodes[0].requires = ['Q99']; }), /requires "Q99"/);
  assert.throws(bad((t) => { t.presets.critMagicLuck.ids = ['C01', 'C08']; }), /presets の "critMagicLuck"/);
});

// ================= (2) 取得の決まり =================

test('START から全200ノードに合法な取得経路があり、12pt以内で取れる', () => {
  const tree = TREE();
  const ix = treeIndex(tree);
  // 奥義を通り道にしない最短経路（START からの BFS）
  const prev = new Map([['START', null]]);
  const queue = ['START'];
  while (queue.length) {
    const a = queue.shift();
    for (const b of ix.adj.get(a)) {
      if (prev.has(b)) continue;
      prev.set(b, a);
      if (!ix.byId.get(b).ultimate) queue.push(b);
    }
  }
  const pathTo = (id) => {
    const out = [];
    for (let x = id; x !== 'START'; x = prev.get(x)) out.unshift(x);
    return out;
  };
  let longest = 0;
  for (const n of tree.nodes) {
    assert.ok(prev.has(n.id), n.id);
    const ids = [...new Set([...n.requires.flatMap(pathTo), ...pathTo(n.id)])];
    const ordered = orderBuild(tree, ids, tree.budget);
    assert.ok(ordered, n.id);
    assert.equal(validate(tree, ordered, tree.budget).ok, true, n.id);
    longest = Math.max(longest, ordered.length);
  }
  assert.ok(longest <= 12);
});

test('仕様 第10章の4ビルドは合法（12pt・奥義1個・複数系統を横断）。プリセットと同じ', () => {
  const tree = TREE();
  for (const [id, ids] of Object.entries(SPEC_BUILDS)) {
    assert.deepEqual(validate(tree, ids, 12), { ok: true, spent: 12 }, id);
    assert.equal(ids.filter((x) => treeIndex(tree).byId.get(x).ultimate).length, 1);
    assert.ok(new Set(ids.map((x) => x[0])).size >= 3, id);
    assert.ok(ids.some((x) => x.startsWith('X')), id);
    assert.deepEqual(tree.presets[id].ids, ids);
  }
});

test('奥義は2個取れない。予算を超えて取れない。予算は引数で変えられる', () => {
  const tree = TREE();
  const twoUlt = ['C01', 'C02', 'C04', 'C06', 'C08', 'M01', 'M02', 'M04', 'M06'];
  assert.equal(validate(tree, twoUlt, 12).ok, true);
  assert.match(canAcquire(tree, twoUlt, 'M08', 12).reason, /奥義は1つまで/);
  assert.equal(validate(tree, [...twoUlt, 'M08'], 99).ok, false);
  const full = SPEC_BUILDS.critMagicLuck;
  assert.match(canAcquire(tree, full, 'L03', 12).reason, /ポイントが足りません/);
  assert.equal(canAcquire(tree, full, 'L03', 15).ok, true);
  assert.equal(validate(tree, full, 7).ok, false);
  assert.equal(cost(tree, full), 12);
  assert.equal(cost(tree, []), 0);
});

test('個別必須（M08→M02 など）は接続とは別に要る', () => {
  const tree = TREE();
  const viaRight = ['M01', 'M03', 'M05', 'M07'];
  assert.equal(validate(tree, viaRight).ok, true);
  assert.match(canAcquire(tree, viaRight, 'M08').reason, /先にM02「魔法のやまびこ」が要ります/);
  assert.equal(canAcquire(tree, [...viaRight, 'M02'], 'M08').ok, true);
  // X04（P02 ↔ H04）は H04 側から接続していても P02 が要る
  assert.match(canAcquire(tree, ['H01', 'H02', 'H04'], 'X04').reason, /P02/);
  assert.equal(canAcquire(tree, ['H01', 'H02', 'H04', 'P01', 'P02'], 'X04').ok, true);
  // X40（K02 ↔ D07）
  assert.match(canAcquire(tree, ['D01', 'D03', 'D05', 'D07'], 'X40').reason, /K02/);
});

test('横断ノードは端点のどちらか一方を取れば取れ、反対側へ進める（両端は要らない）', () => {
  const tree = TREE();
  // C04 側から X01 → 反対側の M02 → M02 から M01 へ
  assert.equal(validate(tree, ['C01', 'C02', 'C04', 'X01', 'M02', 'M01']).ok, true);
  // M02 側からも
  assert.equal(validate(tree, ['M01', 'M02', 'X01', 'C04', 'C02']).ok, true);
  // 端点がどちらもなければ取れない
  assert.match(canAcquire(tree, ['C01', 'C02'], 'X01').reason, /つながっていません/);
  // 取れるノードの一覧（安定順）
  assert.deepEqual(acquirableIds(tree, ['C01', 'C02', 'C04']).filter((id) => id.startsWith('X')), ['X01', 'X11', 'X17', 'X48']);
});

test('取得順は順に canAcquire で確かめる（順序に依存）。orderBuild は取れる順に並べる', () => {
  const tree = TREE();
  assert.match(validate(tree, ['C02', 'C01']).reason, /1番目/);
  assert.equal(validate(tree, ['C01', 'C02']).ok, true);
  assert.deepEqual(orderBuild(tree, ['C02', 'C01']), ['C01', 'C02']);
  assert.equal(orderBuild(tree, ['C02']), null);
  assert.match(validate(tree, ['C01', 'C01']).reason, /もう取っています/);
  assert.match(validate(tree, ['ZZ']).reason, /ありません/);
  assert.equal(validate(tree, 'C01').ok, false);
});

// ================= (3) 解除・設定値・保存 =================

test('解除：外したあとも全ノードが START とつながり、必須を満たすときだけ外せる', () => {
  const tree = TREE();
  const b = ['C01', 'C02', 'C04', 'X01', 'M02'];
  // C04 を外すと X01・M02 が切れる
  assert.match(release(tree, b, 'C04').reason, /START とつながらなくなります/);
  assert.deepEqual(release(tree, b, 'M02'), { ok: true, picked: ['C01', 'C02', 'C04', 'X01'] });
  // M02 を外すと M08 の必須が切れる（接続は M07 側で保たれる）
  const m = ['M01', 'M02', 'M03', 'M05', 'M07', 'M08'];
  assert.match(release(tree, m, 'M02').reason, /M08「多重詠唱」にはM02「魔法のやまびこ」が必要です/);
  // 横断を通路にした別経路があれば外せる（順は取れる順に並べ直す）
  const loop = ['M01', 'M02', 'X01', 'C04', 'C02', 'C01'];
  const r = release(tree, loop, 'M01');
  assert.equal(r.ok, true);
  assert.equal(validate(tree, r.picked).ok, true);
  assert.deepEqual([...r.picked].sort(), ['C01', 'C02', 'C04', 'M02', 'X01']);
  assert.match(release(tree, loop, 'Q01').reason, /取っていません/);
  assert.equal(checkSet(tree, ['C02']).ok, false);
});

test('設定値：E04・X25 は取得時だけ持ち、省略すると初期値。存在しない選択肢は拒否。E04 の選択が効果に入る', () => {
  const tree = TREE();
  const e = ['E01', 'E02', 'E04'];
  assert.deepEqual(validateConfig(tree, e, {}).config, { E04: 'annihilation' });
  assert.deepEqual(validateConfig(tree, e, { E04: 'chaos', X25: 'ice' }).config, { E04: 'chaos' });
  assert.match(validateConfig(tree, e, { E04: 'fire' }).reason, /選べません/);
  assert.match(validateConfig(tree, e, { C01: 'x' }).reason, /設定がありません/);
  assert.equal(skillMods(tree, { ids: e, config: { E04: 'chaos' } }).chaosDamage, 5);
  assert.equal(skillMods(tree, { ids: e, config: {} }).annihilationDamage, 4);
  assert.equal(skillMods(tree, e).randomAttach, true);
  const n = normalizeBuild(tree, { ids: ['F01', 'F02', 'F04', 'X25'], config: { X25: 'light' } });
  assert.deepEqual(n.build.config, { X25: 'light' });
});

test('保存：版・取得順・選択肢・予算を保存して読み戻せる。旧版（24ノード）は振り直し。改ざんは空', () => {
  const tree = TREE();
  const saved = serializeBuild(tree, { ids: ['E01', 'E02', 'E04'], config: { E04: 'shatter' } });
  assert.deepEqual(saved, { version: 3, ids: ['E01', 'E02', 'E04'], config: { E04: 'shatter' }, budget: 12 });
  assert.deepEqual(deserializeBuild(tree, JSON.parse(JSON.stringify(saved))), { ok: true, build: { ids: ['E01', 'E02', 'E04'], config: { E04: 'shatter' } }, budget: 12 });
  assert.throws(() => serializeBuild(tree, ['C02']), /保存できません/);
  for (const old of [['siegecraft', 'warcry'], { version: 2, nodes: ['siegecraft'] }, { nodes: ['stoneWall'] }]) {
    const r = deserializeBuild(tree, old);
    assert.equal(r.migrated, true);
    assert.deepEqual(r.build, { ids: [], config: {} });
    assert.match(r.reason, /振り直して/);
  }
  const broken = deserializeBuild(tree, { ...saved, ids: ['E02'] });
  assert.equal(broken.ok, false);
  assert.deepEqual(broken.build, { ids: [], config: {} });
  assert.equal(deserializeBuild(tree, { version: 9 }).ok, false);
});

test('QA 用の skillTreeApi：nodes / canAcquire / validate / cost / acquirableIds / release', () => {
  const api = skillTreeApi(TREE());
  assert.equal(api.nodes().length, 200);
  assert.equal(api.canAcquire([], 'C01', 12).ok, true);
  assert.equal(api.validate(SPEC_BUILDS.graveTroopsSummon, 12).ok, true);
  assert.equal(api.cost(['C01', 'C02']), 2);
  assert.equal(api.acquirableIds([], 12).length, 19);
  assert.equal(api.release(['C01'], 'C01', 12).ok, true);
});

// ================= (4) Game =================

test('Game：setup.skills は配列か { ids, config }。getState に skills・skillConfig・maxMp。初期値系ノードが効く', () => {
  const { rules } = buildData({ mode: 'classic' });
  const game = classicGame({ skills: [['P01', 'P02', 'P03', 'P05', 'P07'], { ids: ['D01', 'D03', 'D05', 'E01', 'E02', 'E04'], config: { E04: 'blackIce' } }] });
  const s = game.getState(null).players;
  assert.deepEqual(s.p1.skills, ['P01', 'P02', 'P03', 'P05', 'P07']);
  assert.deepEqual(s.p1.skillConfig, {});
  assert.equal(s.p1.maxMp, rules.maxMp + 2);
  assert.equal(s.p1.mp, rules.initialMp + 2);
  assert.equal(s.p1.skillError, undefined);
  assert.deepEqual(s.p2.skillConfig, { E04: 'blackIce' });
  assert.equal(s.p2.armor, rules.secondPlayerArmor + 4);
  assert.equal(game.players.p2.skillMods.blackIceDamage, 4);
  assert.equal(game.players.p2.skillMods.armorFloor, 2);
  // 戦闘中の効果（P02 など）はまだ数値に入らない（段階B/C）
  assert.equal(isHandlerImplemented(TREE().nodes.find((n) => n.id === 'P02')), false);
  assert.deepEqual(Object.keys(STATIC_HANDLERS).sort(), ['D01', 'D05', 'E01', 'E04', 'E06', 'P01', 'P07', 'R01', 'U01', 'U04']);
  assert.equal(game.soldiersPerTurnOf(game.players.p1), rules.soldiersPerTurn);
  const g2 = classicGame({ skills: [['U01', 'U03', 'U05'], []] });
  assert.equal(g2.soldiersPerTurnOf(g2.players.p1), rules.soldiersPerTurn + 1);
});

test('Game：対戦開始時に再検証し、不正なビルドは空にして理由を残す（例外にしない）。形の間違い・skillTree なしは例外', () => {
  const game = classicGame({ skills: [['C02'], ['C01', 'C02', 'C04', 'C06', 'C08', 'M01', 'M02', 'M04', 'M06', 'M08']] });
  const s = game.getState(null).players;
  assert.deepEqual(s.p1.skills, []);
  assert.match(s.p1.skillError, /席1のスキル.*つながっていません/);
  assert.deepEqual(s.p2.skills, []);
  assert.match(s.p2.skillError, /奥義は1つまで/);
  assert.deepEqual(game.skillFallbacks.map((f) => f.playerId), ['p1', 'p2']);
  assert.equal(classicGame({ skills: [{ ids: ['E01', 'E02', 'E04'], config: { E04: 'fire' } }] }).getState(null).players.p1.skills.length, 0);
  // 席を省略すると何も取らない
  assert.deepEqual(classicGame({ skills: [['C01']] }).getState(null).players.p2.skills, []);
  assert.throws(() => classicGame({ skills: [[], [], []] }), /人数ぶん（2個）まで/);
  assert.throws(() => classicGame({ skills: 'C01' }), /人数ぶん/);
  assert.throws(() => classicGame({ skills: [['C01'], []], skillTree: null }), /skillTree/);
  const { cards, rules } = buildData({ mode: 'classic' });
  assert.throws(() => new Game({ cards, rules, elements: loadOptionalData('classic').elements, skillTree: TREE() }), /属性の反応を使います/);
});

test('クラシックの城：城の種類の補正は使わず標準城の値（見た目の種類は残す）。通常モードの城は今までどおり', () => {
  const { rules } = buildData({ mode: 'classic' });
  const game = classicGame({ setup: { castles: ['fortress', 'barracks'] } });
  const s = game.getState(null).players;
  assert.equal(s.p1.castleType, 'fortress');
  assert.equal(s.p1.castleMaxHp, rules.castleMaxHp);
  assert.equal(s.p1.maxHand, rules.maxHand);
  assert.equal(game.players.p2.castleDef.soldierAttackBonus ?? 0, 0);
  // 通常モード
  const normal = buildData();
  const opts = loadOptionalData();
  const g = new Game({ ...opts, cards: normal.cards, rules: { ...normal.rules, mulligan: false }, setup: { castles: ['fortress', 'barracks'] }, rng: seededRng(1) });
  assert.equal(g.players.p1.castleDef.hpBonus, opts.castles.fortress.hpBonus);
  assert.equal(g.players.p2.castleDef.soldierAttackBonus, opts.castles.barracks.soldierAttackBonus);
});

test('通常モード：スキルは適用されず（getState にキーなし）、setup.skills は例外', () => {
  const { cards, rules } = buildData();
  const opts = loadOptionalData();
  const g = new Game({ ...opts, cards, rules, rng: seededRng(3) });
  assert.equal(g.skillTree, null);
  assert.equal(g.getState(null).players.p1.skills, undefined);
  assert.equal(g.players.p1.skillMods, null);
  assert.throws(() => new Game({ ...opts, cards, rules, setup: { skills: [['C01']] } }), /skillTree/);
});

// ================= (5) CPU =================

test('chooseSkillBuild：random は注入した乱数で、いつも合法・12pt を使い切る・奥義1個まで。プリセット・none・戦い方・+つなぎ', () => {
  const tree = TREE();
  const groupsSeen = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    const b = chooseSkillBuild(tree, seededRng(seed), 'random');
    assert.equal(normalizeBuild(tree, b).ok, true);
    assert.equal(b.ids.length, 12);
    assert.ok(b.ids.filter((id) => treeIndex(tree).byId.get(id).ultimate).length <= 1);
    assert.deepEqual(chooseSkillBuild(tree, seededRng(seed), 'random'), b);
    for (const id of b.ids) groupsSeen.add(id[0]);
  }
  assert.ok(groupsSeen.size >= 10);
  assert.equal(chooseSkillBuild(tree, seededRng(1), 'random', 7).ids.length, 7);
  assert.deepEqual(chooseSkillBuild(tree, seededRng(1), 'none'), { ids: [], config: {} });
  assert.deepEqual(chooseSkillBuild(tree, seededRng(1), 'elementManaMagic'), { ids: SPEC_BUILDS.elementManaMagic, config: { E04: 'annihilation' } });
  assert.deepEqual(chooseSkillBuild(tree, seededRng(1), 'C01+C02').ids, ['C01', 'C02']);
  for (const style of Object.keys(STRATEGIES)) {
    const s = SKILL_STYLE_OF[style];
    assert.ok(s === 'random' || s === 'none' || tree.presets[s], style);
    assert.equal(normalizeBuild(tree, chooseSkillBuild(tree, seededRng(2), style)).ok, true, style);
  }
  assert.throws(() => chooseSkillBuild(tree, seededRng(1), 'nothing'), /ありません/);
  assert.throws(() => chooseSkillBuild(tree, seededRng(1), 'C02+C01'), /決まりに合いません/);
});
