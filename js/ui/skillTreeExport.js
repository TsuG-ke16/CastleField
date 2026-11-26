// スキルツリーのデータ（data/classic/skilltree.json v3）を、PR #200 の独立プレビュー（previews/skill-tree/）の
// 「仕様データ読込」が読める JSON（version 1・groups 19・nodes 200・edges）に書き出す。DOM を使わない。
// - PR200 は nodes をちょうど200件に固定している。こちらは取得ノード200件＋START（0pt・取得ノード数に数えない）なので、
//   START はノードに入れず、START とつながる辺（各系統の 01 との19本）も書き出さない。代わりに 01 の condition に
//   「START に隣接（最初から取得できる）」と書く（docs/skilltree-200-notes/skillD1.md）
// - 横断ノード（X01〜X48）は PR200 に系統がないので group: null・kind "normal"（PR200 では group null は position の位置に置かれる）
// - 辺は SkillTree の索引（系統内テンプレート＋横断の ends）をそのまま。系統間の接続（横断）も保持する
// - state は SkillTree.canAcquire の結果（build を渡せばその取得状態。既定は空ビルド＝01 と L01 だけ available）
// - 取得の可否・コスト・条件はこちらの本番データ・API の値で、PR200 の仮ルールは使わない

import { treeIndex } from '../game/SkillTree.js';
import { nodeStatus, edgeList } from './skillTreeModel.js';

/** 系統のアイコン（既存の assets/ui の絵。PR200 の asset() が受け付ける "ui/..." の形） */
export const GROUP_ICONS = {
  C: 'ui/icon-kind-weapon.png', M: 'ui/icon-kind-spell.png', E: 'ui/icon-fire.png', S: 'ui/factions/crest-demon.png',
  T: 'ui/icon-help.png', P: 'ui/icon-mp.png', H: 'ui/home/deck.png', I: 'ui/icon-kind-wild.png', V: 'ui/factions/crest-forest.png',
  G: 'ui/icon-rarity-epic.png', B: 'ui/icon-heart.png', R: 'ui/icon-water.png', D: 'ui/icon-kind-defense.png', Q: 'ui/icon-rarity-legendary.png',
  U: 'ui/icon-kind-soldier.png', K: 'ui/home/rank.png', F: 'ui/icon-earth.png', A: 'ui/factions/crest-dragon.png', L: 'ui/icon-luck.png',
};
export const CROSS_ICON = 'ui/icon-wind.png';
export const START_ICON = 'ui/kingdom-crest.png';

/** 書き出しの座標の倍率（PR200 のノードの大きさ（半径26〜52）に合わせて間を広げる） */
export const PREVIEW_SCALE = 2;

/**
 * @param {object} tree data/classic/skilltree.json
 * @param {{ build?: { ids: string[] }, scale?: number }} [o]
 */
export function toPreviewJson(tree, { build = { ids: [] }, scale = PREVIEW_SCALE } = {}) {
  const ix = treeIndex(tree);
  const name = (id) => `${id}「${ix.byId.get(id)?.name ?? id}」`;
  const groups = Object.entries(tree.groups).map(([id, g]) => ({ id, name: g.name, icon: GROUP_ICONS[id] ?? 'ui/icon-kind-spell.png' }));
  const startNeighbors = ix.adj.get(ix.startId);
  const nodes = tree.nodes.map((n) => {
    const st = nodeStatus(tree, build.ids, n.id, tree.budget).state;
    const cond = [];
    if (startNeighbors.has(n.id)) cond.push('START に隣接（最初から取得できる）');
    if (n.cross) cond.push(`${name(n.ends[0])} か ${name(n.ends[1])} のどちらかを取得`);
    else cond.push('隣のノードを取得済み');
    if (n.requires.length) cond.push(`必須：${n.requires.map(name).join('・')}`);
    if (n.ultimate) cond.push('奥義は1つまで');
    return {
      id: n.id,
      name: n.name,
      group: n.cross ? null : n.group,
      kind: n.ultimate ? 'ultimate' : 'normal',
      state: st === 'owned' ? 'acquired' : st === 'available' ? 'available' : 'locked',
      cost: n.cost,
      description: n.desc,
      condition: cond.join(' ／ '),
      icon: n.cross ? CROSS_ICON : GROUP_ICONS[n.group] ?? 'ui/icon-kind-spell.png',
      position: { x: n.layout.x * scale, y: n.layout.y * scale },
    };
  });
  const edges = edgeList(tree).filter(([a, b]) => a !== ix.startId && b !== ix.startId).map(([a, b]) => ({ source: a, target: b }));
  return {
    version: 1,
    id: `castle-field-classic-skilltree-v${tree.version}`,
    title: 'クラシック スキルツリー（200ノード）',
    maxPoints: tree.budget,
    groups,
    nodes,
    edges,
  };
}
