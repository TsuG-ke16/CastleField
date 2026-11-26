// クラシックのスキルツリーのテスト（docs/classic-skilltree.md）：
//   (1) データ（data/classic/skilltree.json）：決まりに合う・短所のない強化だけ（人間の決定）・上位互換のノードがない
//   (2) ビルドの決まり（ポイントの上限・先に取るノード）と、不正な入力の例外
//   (3) ノードの効果（キーごと）
//   (4) 同じビルドなら先攻・後攻で同じ扱い
//   (5) CPU のビルドの選び方
// skills を省略したときの一致・シミュレーション・オンラインの部屋は tests/classic-skilltree-play.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { validateSkillTree, checkSkillBuild, skillMods, availableSkillNodes, dominatedPairs, SKILL_EFFECTS } from '../js/game/SkillTree.js';
import { chooseSkillBuild, SKILL_STYLE_OF, STRATEGIES } from '../js/game/strategies.js';
import { buildData, loadOptionalData, seededRng, recordEvents } from './helpers.js';

const TREE = () => loadOptionalData('classic').skillTree;

/** クラシックのゲーム。マリガンなし（start() のあとすぐ p1 のターン1） */
function classicGame({ skills, skillTree = TREE(), rules = {}, setup = {}, seed = 1 } = {}) {
  const { cards, rules: base } = buildData({ mode: 'classic', rules: { mulligan: false, ...rules } });
  const opts = loadOptionalData('classic');
  delete opts.stages; // ステージの魔法の増加などが入らないように
  const game = new Game({ ...opts, cards, rules: base, skillTree, setup: { ...setup, ...(skills ? { skills } : {}) }, rng: seededRng(seed) });
  const log = recordEvents(game, EVENT_TYPES);
  return { game, log };
}

/** テスト用の小さなツリー（キーを1つずつ確かめる。マイナスの値も書ける） */
function tinyTree(effects) {
  return {
    points: 9,
    branches: { b: { name: '枝' } },
    nodes: { n: { name: 'ノード', branch: 'b', tier: 1, cost: 1, effects } },
  };
}

// ================= (1) データ =================

test('skilltree.json は決まりに合う。どのノードも短所のない強化（人間の決定）で、プリセットも決まりに合う', () => {
  const tree = TREE();
  validateSkillTree(tree);
  for (const [id, n] of Object.entries(tree.nodes)) {
    const vals = Object.entries(n.effects).map(([k, v]) => (SKILL_EFFECTS[k] === 'flag' ? 1 : v));
    assert.ok(vals.length > 0 && vals.every((v) => v > 0), id);
    assert.equal(typeof n.description, 'string', id);
  }
  for (const p of Object.values(tree.presets)) assert.equal(checkSkillBuild(tree, p.nodes).ok, true);
  // プリセットのIDとノードのIDは重ならない（chooseSkillBuild がノードのIDとしても読むため）
  for (const id of Object.keys(tree.presets)) assert.equal(Object.hasOwn(tree.nodes, id), false, id);
});

test('上位互換のノードがない（効果がほかのノードをすべて含み、コストが同じか安いノードはない）', () => {
  assert.deepEqual(dominatedPairs(TREE()), []);
  // コストが同じで効果が大きいノードは、データのチェックで止まる
  const tree = tinyTree({ armor: 2 });
  tree.nodes.m = { name: 'M', branch: 'b', tier: 1, cost: 1, effects: { armor: 3 } };
  assert.throws(() => validateSkillTree(tree), /"m" は "n" の上位互換/);
  // コストが高ければよい
  tree.nodes.m.cost = 2;
  validateSkillTree(tree);
});

test('ポイントでは全部取れない（全ノードの合計 > points）。どの枝も奥まで取れる', () => {
  const tree = TREE();
  const total = Object.values(tree.nodes).reduce((n, x) => n + x.cost, 0);
  assert.ok(total > tree.points);
  for (const b of Object.keys(tree.branches)) {
    const chain = Object.entries(tree.nodes).filter(([, n]) => n.branch === b).sort((x, y) => x[1].tier - y[1].tier).map(([id]) => id);
    assert.equal(checkSkillBuild(tree, chain).ok, true, b);
  }
});

// ================= (2) ビルドの決まり・不正な入力 =================

test('checkSkillBuild：知らないノード・2回・先のノードがない・ポイント超え・配列でない', () => {
  const tree = TREE();
  assert.deepEqual(checkSkillBuild(tree, []), { ok: true, spent: 0 });
  assert.match(checkSkillBuild(tree, ['nothing']).reason, /ありません/);
  assert.match(checkSkillBuild(tree, ['keenBlade', 'keenBlade']).reason, /2回/);
  assert.match(checkSkillBuild(tree, ['warcry']).reason, /先に「攻城術」/);
  assert.match(checkSkillBuild(tree, ['keenBlade', 'siegecraft', 'warcry', 'stoneWall']).reason, /ポイントが足りません（7使う・使えるのは6）/);
  assert.match(checkSkillBuild(tree, 'keenBlade').reason, /配列/);
  // 順番は問わない（先のノードがビルドのどこかにあればよい）
  assert.equal(checkSkillBuild(tree, ['warcry', 'siegecraft']).ok, true);
});

test('validateSkillTree：形の間違いを分かりやすく止める', () => {
  const good = tinyTree({ armor: 2 });
  validateSkillTree(good);
  const bad = (patch, re) => assert.throws(() => validateSkillTree({ ...structuredClone(good), ...patch }), re);
  bad({ points: 0 }, /points/);
  bad({ branches: {} }, /branches/);
  bad({ nodes: { n: { ...good.nodes.n, effects: {} } } }, /1つ以上/);
  // マイナスの値（短所）は書ける（必須ではない）
  validateSkillTree({ ...structuredClone(good), nodes: { n: { ...good.nodes.n, effects: { armor: 2, castleHp: -3 } } } });
  bad({ nodes: { n: { ...good.nodes.n, effects: { power: 2, castleHp: -1 } } } }, /知らない効果/);
  bad({ nodes: { n: { ...good.nodes.n, effects: { armor: 0, castleHp: -1 } } } }, /0でない整数/);
  bad({ nodes: { n: { ...good.nodes.n, effects: { randomAttach: false, castleHp: -1 } } } }, /true だけ/);
  bad({ nodes: { n: { ...good.nodes.n, branch: 'x' } } }, /branch/);
  bad({ nodes: { n: { ...good.nodes.n, requires: ['n'] } } }, /requires/);
  bad({ nodes: { a: { ...good.nodes.n, requires: ['c'] }, c: { ...good.nodes.n, requires: ['a'] } } }, /輪/);
  bad({ presets: { p: { name: 'P', nodes: ['zzz'] } } }, /presets の "p"/);
  bad({ presets: { n: { name: 'P', nodes: [] } } }, /ノードと同じID/);
});

test('new Game：不正な setup.skills は分かりやすい例外。skillTree なしの setup.skills もだめ', () => {
  assert.throws(() => classicGame({ skills: [['nothing'], []] }), /席1のスキルが決まりに合いません：「nothing」というスキルはありません/);
  assert.throws(() => classicGame({ skills: [[], ['keenBlade']] }), /席2のスキル.*先に「鬨の声」/);
  assert.throws(() => classicGame({ skills: [[], [], []] }), /人数ぶん（2個）まで/);
  assert.throws(() => classicGame({ skills: 'keenBlade' }), /人数ぶん/);
  assert.throws(() => classicGame({ skills: [['keenBlade'], []], skillTree: null }), /skillTree/);
  // 反応を使うノードがあるツリーは、reactions のないゲームでは使えない
  const { cards, rules } = buildData({ mode: 'classic' });
  assert.throws(() => new Game({ cards, rules, elements: loadOptionalData('classic').elements, skillTree: TREE() }), /属性の反応を使います/);
  // 席を省略すると何も取らない
  const { game } = classicGame({ skills: [['siegecraft']] });
  assert.deepEqual(game.getState(null).players.p2.skills, []);
});

// ================= (3) ノードの効果 =================

test('castleHp・armor・initialMp・maxMp・initialHand・maxHand：試合の始めの状態に入る（getState に skills・maxMp）', () => {
  const { game } = classicGame({ skills: [['stoneWall', 'stronghold', 'bastion'], ['manaSpring', 'deepVessel', 'alchemy']] });
  const tree = TREE();
  const m1 = skillMods(tree, ['stoneWall', 'stronghold', 'bastion']);
  const m2 = skillMods(tree, ['manaSpring', 'deepVessel', 'alchemy']);
  const { rules } = buildData({ mode: 'classic' });
  const s = game.getState(null).players;
  assert.deepEqual(s.p1.skills, ['stoneWall', 'stronghold', 'bastion']);
  assert.equal(s.p1.castleMaxHp, rules.castleMaxHp + m1.castleHp);
  assert.equal(s.p1.castleHp, rules.castleMaxHp + m1.castleHp);
  assert.equal(s.p1.armor, m1.armor); // 先攻なので後攻の城壁はない
  assert.equal(s.p1.mp, rules.initialMp + m1.initialMp);
  assert.equal(s.p1.maxHand, rules.maxHand + m1.maxHand);
  assert.equal(game.players.p1.hand.length, rules.initialHand + m1.initialHand);
  // 後攻：城壁・MP・手札の後攻の補正に足す
  assert.equal(s.p2.castleMaxHp, rules.castleMaxHp + m2.castleHp);
  assert.equal(s.p2.armor, rules.secondPlayerArmor);
  assert.equal(s.p2.maxMp, rules.maxMp + m2.maxMp);
  assert.equal(s.p2.mp, Math.min(rules.maxMp + m2.maxMp, rules.initialMp + m2.initialMp + rules.secondPlayerMp));
  assert.equal(s.p2.maxHand, rules.maxHand + m2.maxHand);
  assert.equal(game.players.p2.hand.length, rules.initialHand + m2.initialHand + rules.secondPlayerHandBonus);
  // 全体の maxMp は今までどおりルールの値
  assert.equal(game.getState(null).maxMp, rules.maxMp);
});

test('maxMp：MP の上限は人ごと（回復しても超えない・下げたときは最初の MP も上限まで）', () => {
  const tree = tinyTree({ maxMp: -15, armor: 1 });
  const { game } = classicGame({ skillTree: tree, skills: [['n'], []] });
  assert.equal(game.getState(null).players.p1.maxMp, 5);
  assert.equal(game.players.p1.mp, 5);
  game.changeMp(game.players.p1, 10, 'card');
  assert.equal(game.players.p1.mp, 5);
  game.changeMp(game.players.p2, 30, 'card');
  assert.equal(game.players.p2.mp, 20);
});

test('mpPerTurn・coinPerTurn：自分のターンの始めの回復が増える（相手は今までどおり）', () => {
  const tree = tinyTree({ mpPerTurn: 2, coinPerTurn: 1 });
  const { game, log } = classicGame({ skillTree: tree, skills: [['n'], []], rules: { maxHand: 99 } });
  game.players.p1.mp = 0;
  game.players.p2.mp = 0;
  game.start();
  game.endTurn();
  const regen = log.filter((e) => e.event === 'mpChanged' && e.reason === 'turn').map((e) => [e.playerId, e.delta]);
  const coins = log.filter((e) => e.event === 'coinsChanged' && e.reason === 'turn').map((e) => [e.playerId, e.delta]);
  assert.deepEqual(regen, [['p1', 5], ['p2', 3]]);
  assert.deepEqual(coins, [['p1', 2], ['p2', 1]]);
});

test('soldierAttack：出した兵士の攻撃が増える（兵舎と同じ）。castleSpell：城への魔法が城に当たると増える', () => {
  const { game, log } = classicGame({ skills: [['siegecraft', 'warcry', 'keenBlade'], []] });
  const mods = skillMods(TREE(), ['siegecraft', 'warcry', 'keenBlade']);
  game.start();
  game.players.p1.mp = 20;
  game.debugSetHand('p1', ['classic_king_infantry', 'classic_king_holy_fireball']);
  const [inf, fire] = game.players.p1.hand.map((c) => c.cardId);
  assert.equal(game.playCard(inf, { playerId: 'p2', roadId: game.getState(null).roads[0].roadId }).ok, true);
  const base = buildData({ mode: 'classic' }).cards.classic_king_infantry.attack;
  assert.equal(game.players.p1.soldiers[0].attack, base + mods.soldierAttack);
  // 相手の兵士がいない道なので城に当たる：6 + 攻城術
  const road = game.getState(null).roads[1].roadId;
  game.players.p2.armor = 0;
  assert.equal(game.playCard(fire, { playerId: 'p2', roadId: road }).ok, true, 'fireball');
  if (game.getState(null).phase === 'defend') game.passDefense();
  const hit = log.filter((e) => e.event === 'castleDamaged' && e.playerId === 'p2').at(-1);
  assert.equal(hit.amount, 6 + mods.castleSpell);
});

test('randomAttach：ルールが false でも、スキルを持つ人のターンの始めだけ付着する（skill: true）。randomAttachTurns で長く残る', () => {
  const { game, log } = classicGame({ skills: [['chaosEye', 'resonance', 'echo'], []] });
  // 両者の兵士を置いてから、お互いのターンの始めを見る
  game.start();
  game.players.p1.mp = 20;
  game.debugSetHand('p1', ['classic_king_infantry']);
  game.playCard(game.players.p1.hand[0].cardId, { playerId: 'p2', roadId: game.getState(null).roads[0].roadId });
  game.endTurn(); // p2 の番：p1 の兵士がいるが、p2 はスキルなしなので付かない
  game.players.p2.mp = 20;
  game.debugSetHand('p2', ['classic_demon_skeleton']);
  game.playCard(game.players.p2.hand[0].cardId, { playerId: 'p1', roadId: game.getState(null).roads[1].roadId });
  game.endTurn(); // p1 の番：p2 の兵士に付く
  const att = log.filter((e) => e.event === 'elementAttached' && e.source === 'turnStart');
  assert.equal(att.length, 1);
  assert.equal(att[0].playerId, 'p2');
  assert.equal(att[0].skill, true);
  assert.equal(att[0].turns, 1 + skillMods(TREE(), ['echo']).randomAttachTurns); // reactions.json の randomAttach.turns（1）＋ 残響
});

test('reactionDamage：自分の攻撃で起きた反応だけ追加ダメージが増える（skillBonus）。相手の攻撃の反応には付かない', () => {
  const { game, log } = classicGame({ skills: [['chaosEye', 'resonance'], []] });
  game.start();
  game.players.p1.mp = 20;
  game.debugSetHand('p1', ['classic_king_heavy']);
  game.playCard(game.players.p1.hand[0].cardId, { playerId: 'p2', roadId: game.getState(null).roads[0].roadId });
  game.endTurn();
  game.players.p2.mp = 20;
  game.debugSetHand('p2', ['classic_demon_imp']);
  game.playCard(game.players.p2.hand[0].cardId, { playerId: 'p1', roadId: game.getState(null).roads[1].roadId });
  const mine = game.players.p1.soldiers[0];
  const theirs = game.players.p2.soldiers[0];
  mine.hp = mine.maxHp = 99;
  theirs.hp = theirs.maxHp = 99;
  // p2 の手番に p2 の攻撃が p1 の兵士に反応：p1 のスキルは乗らない
  mine.attachments.push({ element: 'dark', turns: 3 });
  game.elementHit(game.players.p1, mine, 'light', { by: game.players.p2 });
  // p1 の攻撃が p2 の兵士に反応：+4
  theirs.attachments.push({ element: 'dark', turns: 3 });
  game.elementHit(game.players.p2, theirs, 'light', { by: game.players.p1 });
  const bonus = skillMods(TREE(), ['resonance']).reactionDamage;
  const rs = log.filter((e) => e.event === 'reactionTriggered');
  assert.deepEqual(rs.map((e) => [e.playerId, e.damage, e.skillBonus]), [['p1', 8, undefined], ['p2', 8 + bonus, bonus]]);
});

// ================= (4) 先攻と後攻 =================

test('同じビルドなら、先攻と後攻で同じ扱い（違いは後攻の補正だけ）', () => {
  const build = TREE().presets.hybrid.nodes;
  const a = classicGame({ skills: [build, build] }).game.getState(null).players;
  const b = classicGame({ skills: [build, build], setup: { firstPlayer: 'p2' } }).game.getState(null).players;
  const pick = (p) => ({ castleMaxHp: p.castleMaxHp, maxMp: p.maxMp, maxHand: p.maxHand, skills: p.skills });
  assert.deepEqual(pick(a.p1), pick(a.p2));
  // 先攻を入れかえると、城壁・MP（後攻の補正）も入れかわる
  assert.equal(a.p1.armor, b.p2.armor);
  assert.equal(a.p2.armor, b.p1.armor);
  assert.equal(a.p1.mp, b.p2.mp);
  assert.equal(a.p2.mp, b.p1.mp);
});

// ================= (5) CPU のビルドの選び方 =================

test('chooseSkillBuild：random はいつも決まりに合い、ポイントを使い切る。プリセット・none・戦い方の名前・ノードのIDを+でつなぐ', () => {
  const tree = TREE();
  const rng = seededRng(5);
  for (let i = 0; i < 200; i++) {
    const b = chooseSkillBuild(tree, rng, 'random');
    assert.equal(checkSkillBuild(tree, b).ok, true, b.join());
    assert.deepEqual(availableSkillNodes(tree, b), [], '取れるノードが残っていない');
  }
  assert.deepEqual(chooseSkillBuild(tree, rng, 'none'), []);
  assert.deepEqual(chooseSkillBuild(tree, rng, 'shield'), tree.presets.shield.nodes);
  assert.deepEqual(chooseSkillBuild(tree, rng, 'smart'), tree.presets[SKILL_STYLE_OF.smart].nodes);
  assert.deepEqual(chooseSkillBuild(tree, rng, 'siegecraft+warcry'), ['siegecraft', 'warcry']);
  assert.throws(() => chooseSkillBuild(tree, rng, 'zzz'), /ありません/);
  for (const name of Object.keys(STRATEGIES)) assert.ok(Object.hasOwn(SKILL_STYLE_OF, name), name);
});
