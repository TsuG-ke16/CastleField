// スキルツリー画面の DOM を使わない部分（js/ui/skillTreeModel.js）。ルールは SkillTree.js のものをそのまま使っているかを確かめる
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOptionalData } from './helpers.js';
import { canAcquire, serializeBuild } from '../js/game/SkillTree.js';
import {
  nodeStatus, allStatuses, buildSummary, edgeList, edgeState, routeTo, searchNodes, acquire, releaseNode, setConfig,
  applyPreset, buildForGame, loadSavedBuild, saveBuild, SKILL_BUILD_KEY, skillStatusRows, cardSkillQuestions, answersToOptions, nodeDetail,
} from '../js/ui/skillTreeModel.js';

const tree = loadOptionalData('classic').skillTree;
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };

test('表示状態は canAcquire と一致し、未接続と条件不足を分ける', () => {
  const picked = ['M01', 'M02'];
  const st = allStatuses(tree, picked, tree.budget);
  assert.equal(st.size, 201);
  for (const n of tree.nodes) {
    const s = st.get(n.id);
    if (picked.includes(n.id)) assert.equal(s.state, 'owned');
    else assert.equal(s.state === 'available', canAcquire(tree, picked, n.id).ok, n.id);
  }
  assert.equal(nodeStatus(tree, [], 'C02').state, 'unconnected');
  assert.equal(nodeStatus(tree, ['M01'], 'M08').state, 'unconnected');
  // M08 はつながっているが M02 が必須
  const ids = ['M01', 'M03', 'M05', 'M07'];
  const m08 = nodeStatus(tree, ids, 'M08');
  assert.equal(m08.state, 'blocked');
  assert.equal(m08.reason, canAcquire(tree, ids, 'M08').reason);
});

test('取得・解除・設定・おすすめ・残pt', () => {
  let b = { ids: [], config: {} };
  assert.equal(acquire(tree, b, 'C02').ok, false);
  b = acquire(tree, b, 'E01').build;
  b = acquire(tree, b, 'E02').build;
  b = acquire(tree, b, 'E04').build;
  assert.deepEqual(b.config, { E04: 'annihilation' });
  b = setConfig(tree, b, 'E04', 'chaos').build;
  assert.equal(b.config.E04, 'chaos');
  assert.equal(setConfig(tree, b, 'E04', 'nope').ok, false);
  // 途中を外すとつながらなくなるので拒否
  const r = releaseNode(tree, b, 'E01');
  assert.equal(r.ok, false);
  assert.match(r.reason, /外せません/);
  assert.equal(releaseNode(tree, b, 'E04').ok, true);
  const s = buildSummary(tree, b.ids);
  assert.deepEqual([s.spent, s.left, s.count, s.ultimates], [3, tree.budget - 3, 3, 0]);
  for (const id of Object.keys(tree.presets)) {
    const p = applyPreset(tree, id);
    assert.equal(p.ok, true);
    assert.deepEqual(p.build.ids, tree.presets[id].ids);
    assert.equal(buildSummary(tree, p.build.ids).ultimates, 1);
  }
  // 取っていないノードの設定は対戦に渡さない
  const pre = setConfig(tree, { ids: [], config: {} }, 'X25', 'ice').build;
  assert.equal(pre.config.X25, 'ice');
  assert.deepEqual(buildForGame(tree, pre), { ids: [], config: {} });
});

test('辺・経路・検索・詳細', () => {
  const edges = edgeList(tree);
  assert.equal(edges.length, 19 * 10 + 48 * 2);
  const st = allStatuses(tree, ['C01'], tree.budget);
  assert.equal(edgeState(st, 'C01', 'START'), 'path');
  assert.equal(edgeState(st, 'C01', 'C02'), 'next');
  assert.deepEqual(routeTo(tree, ['C01'], 'C04'), ['C02', 'C04']);
  assert.deepEqual(routeTo(tree, [], 'C01'), ['C01']);
  assert.ok(searchNodes(tree, '会心').includes('C01'));
  assert.deepEqual(searchNodes(tree, 'X25'), ['X25']);
  assert.ok(searchNodes(tree, '', 'B').includes('X26')); // 系統の横断ノードも系統で絞り込める
  const d = nodeDetail(tree, ['C01'], 'C01');
  assert.equal(d.status.state, 'owned');
  assert.equal(d.releaseCheck.ok, true);
  assert.equal(nodeDetail(tree, [], 'M08').requires[0], 'M02「魔法のやまびこ」');
});

test('保存は serializeBuild の版つき・旧版は振り直し', () => {
  const store = memory();
  assert.deepEqual(loadSavedBuild(tree, store).build, { ids: [], config: {} });
  const b = applyPreset(tree, 'elementManaMagic').build;
  assert.equal(saveBuild(tree, store, b), true);
  assert.deepEqual(JSON.parse(store.m.get(SKILL_BUILD_KEY)), serializeBuild(tree, b));
  assert.deepEqual(loadSavedBuild(tree, store), { build: b, notice: null });
  store.setItem(SKILL_BUILD_KEY, JSON.stringify({ version: 2, ids: ['castleHp1'] }));
  const old = loadSavedBuild(tree, store);
  assert.deepEqual(old.build, { ids: [], config: {} });
  assert.match(old.notice, /振り直/);
  store.setItem(SKILL_BUILD_KEY, '{');
  assert.match(loadSavedBuild(tree, store).notice, /読めなかった/);
});

test('対戦中の状態の行は、関係するノードを取ったときだけ・本人だけの値は own のときだけ', () => {
  const ss = { resources: { soul: 2, blood: 3, storedMp: 0, healStore: 0, sp: 4 }, debt: 0, tokens: 0, scheduledCount: 0, graveCount: 1, public: {}, critStack: 0.1, peek: { I01: { type: 'x', name: '火球' } } };
  assert.deepEqual(skillStatusRows(['C01'], { ...ss, peek: null }, true).map((r) => r.label), []);
  const mine = skillStatusRows(['G02', 'G06', 'C02', 'I01'], ss, true).map((r) => r.label);
  assert.deepEqual(mine, ['魂', '墓地', '会心の蓄積', '確認したカード']);
  const foe = skillStatusRows(['G02', 'G06', 'C02', 'I01'], { ...ss, critStack: undefined, peek: undefined }, false).map((r) => r.label);
  assert.deepEqual(foe, ['魂', '墓地']);
});

test('カード使用前の選択（HP置換・血の刃・血のやまびこ）と skillOptions', () => {
  const spell = { kind: 'spell', effect: 'singleDamage' };
  assert.deepEqual(cardSkillQuestions(['C01'], spell, { mp: 0, cost: 3 }), []);
  const b01 = cardSkillQuestions(['B01'], spell, { mp: 1, cost: 3 });
  assert.equal(b01[0].type, 'toggle');
  assert.deepEqual(answersToOptions(b01, { hpForMp: false }), { hpForMp: 0 });
  assert.deepEqual(answersToOptions(b01, {}), {});
  const q = cardSkillQuestions(['B01', 'B08', 'B03', 'X27'], spell, { mp: 1, cost: 3 });
  assert.deepEqual(q.map((x) => x.key), ['hpForMp', 'bloodBlade', 'bloodEcho']);
  assert.deepEqual([q[0].min, q[0].max], [2, 3]);
  assert.deepEqual(answersToOptions(q, { hpForMp: 9, bloodBlade: true }), { hpForMp: 3, bloodBlade: true });
  assert.deepEqual(cardSkillQuestions(['B03', 'X27'], { kind: 'soldier' }, { mp: 5, cost: 1 }), []);
});

test('PR #200 のプレビュー向けの書き出し（200ノード・19系統・辺はそのまま・START は含めない）', async () => {
  const { toPreviewJson } = await import('../js/ui/skillTreeExport.js');
  const { readFileSync } = await import('node:fs');
  const j = toPreviewJson(tree);
  assert.equal(j.version, 1);
  assert.equal(j.nodes.length, 200);
  assert.equal(j.groups.length, 19);
  assert.equal(j.maxPoints, tree.budget);
  const ids = new Set(j.nodes.map((n) => n.id));
  assert.equal(ids.size, 200);
  assert.ok(j.edges.every((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target));
  assert.equal(j.edges.length, edgeList(tree).length - 19); // START–01 の19本だけ除く
  assert.ok(j.edges.some((e) => e.source === 'C04' && e.target === 'X01') || j.edges.some((e) => e.source === 'X01' && e.target === 'C04'));
  assert.deepEqual(j.nodes.filter((n) => n.state === 'available').map((n) => n.id).sort(), j.nodes.filter((n) => canAcquire(tree, [], n.id).ok).map((n) => n.id).sort());
  assert.ok(j.nodes.filter((n) => n.group === null).every((n) => n.id.startsWith('X') && n.kind === 'normal'));
  assert.equal(j.nodes.filter((n) => n.kind === 'ultimate').length, 19);
  assert.ok(j.nodes.every((n) => /^(ui|cards)\/[\w/-]+\.png$/.test(n.icon)));
  // docs/skilltree-200-preview.json は書き出しと同じ（tools/export-skilltree-preview.mjs で作り直す）
  assert.deepEqual(JSON.parse(readFileSync(new URL('../docs/skilltree-200-preview.json', import.meta.url), 'utf8')), j);
});
