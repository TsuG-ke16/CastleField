// クラシックの200ノードのスキルツリー（data/classic/skilltree.json）を作るスクリプト。
//   node tools/build-skilltree.mjs          … 書き出す
//   node tools/build-skilltree.mjs --check  … 書き出さずに、今のファイルと同じか確かめる（違えば終了コード1）
// ノードのID・名称・効果文・横断の端点は仕様書（docs/skilltree-200-spec.md の第3・4章の表）をそのまま読む。
// 数値（params）・個別必須・選択肢・系統の色・おすすめ・画面用の座標（layout）はこのスクリプトに書く（出力は data/ に置く）。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = join(root, 'docs/skilltree-200-spec.md');
const OUT = join(root, 'data/classic/skilltree.json');

// ---------------- 仕様書の表を読む ----------------
const spec = readFileSync(SPEC, 'utf8').split('\n');
const groups = []; // { id, name, nodes: [...] }
const cross = [];
let current = null;
let inCross = false;
for (const line of spec) {
  const h = line.match(/^### (.+)系統（([A-Z])）/);
  if (h) {
    current = { id: h[2], name: h[1], nodes: [] };
    groups.push(current);
    continue;
  }
  if (/^## 4\./.test(line)) { inCross = true; current = null; continue; }
  if (/^## 5\./.test(line)) { inCross = false; continue; }
  const cells = line.startsWith('|') ? line.split('|').slice(1, -1).map((c) => c.trim()) : null;
  if (!cells || !/^[A-Z]\d\d$/.test(cells[0])) continue;
  if (inCross) {
    const [id, ends, name, desc] = cells;
    const [a, b] = ends.split('↔').map((s) => s.trim());
    cross.push({ id, name, desc, ends: [a, b] });
  } else if (current) {
    const [id, rawName, desc] = cells;
    const ult = rawName.match(/^\*\*奥義：(.+)\*\*$/);
    current.nodes.push({ id, name: ult ? ult[1] : rawName, desc, ultimate: Boolean(ult) });
  }
}

// ---------------- 設計値 ----------------
/** リング配置の順（仕様 第2章）。幸運（L）は中央 */
const RING = ['C', 'M', 'E', 'S', 'T', 'P', 'H', 'I', 'V', 'G', 'B', 'R', 'D', 'Q', 'U', 'K', 'F', 'A'];
const CENTER = 'L';
/** 系統の色（UIのヒント。色だけで区別しないよう、形は nodeShapes と glyph で補う） */
const GROUP_HINTS = {
  C: { color: '#e0533d', glyph: 'blade' },
  M: { color: '#5b6ee1', glyph: 'star' },
  E: { color: '#3fb6c9', glyph: 'drop' },
  S: { color: '#7cb342', glyph: 'skull' },
  T: { color: '#8e7cc3', glyph: 'hourglass' },
  P: { color: '#3d7fe0', glyph: 'crystal' },
  H: { color: '#c9a03f', glyph: 'card' },
  I: { color: '#9e9e9e', glyph: 'mirror' },
  V: { color: '#4db6ac', glyph: 'portal' },
  G: { color: '#5d4e75', glyph: 'tomb' },
  B: { color: '#b71c1c', glyph: 'blood' },
  R: { color: '#66bb6a', glyph: 'cross' },
  D: { color: '#78909c', glyph: 'shield' },
  Q: { color: '#ff8f00', glyph: 'flame' },
  U: { color: '#a1887f', glyph: 'helmet' },
  K: { color: '#6d8b3a', glyph: 'flag' },
  F: { color: '#8d6e63', glyph: 'gear' },
  A: { color: '#d84315', glyph: 'ram' },
  L: { color: '#ffd54f', glyph: 'clover' },
};

/** 個別必須（仕様 第2章。接続とは別の AND 条件） */
const REQUIRES = { M08: ['M02'], P08: ['P02'], G06: ['G02'], B07: ['B06'], B08: ['B01'], X04: ['P02'], X18: ['M02'], X22: ['M02'], X40: ['K02'] };

/**
 * ノードの数値（仕様の効果文の数値。確率は 0〜1、倍率・割合は小数）。
 * perTurn＝各自ターンn回、perMatch＝試合中n回、perTurnMax＝各自ターン合計の上限量
 */
const PARAMS = {
  C01: { critChance: 0.15, critMultiplier: 1.5 }, C02: { chanceStep: 0.1, chanceMax: 0.3 }, C03: { multiplierAdd: 0.3 },
  C04: { status: 'bleed', turns: 2 }, C05: { hpRatio: 0.2 }, C06: { chance: 0.2, powerRatio: 0.5, perTurn: 1 },
  C07: { sp: 1, perTurn: 1 }, C08: { perTurn: 1 },
  M01: { mp: 1, perTurn: 1 }, M02: { chance: 0.2, powerRatio: 0.5 }, M03: { chance: 0.25 }, M04: { overflowMax: 3, perTurn: 1 },
  M05: { chance: 0.05, perTurn: 1 }, M06: { chance: 0.2, draw: 1, perTurn: 1 }, M07: { spellsNeeded: 2, mpReduce: 1, mpMin: 1, perTurn: 1 },
  M08: { chance: 0.5, maxExtra: 3 },
  E01: { targets: 1 }, E02: { extraCount: 1 }, E03: { chance: 0.2, perTurn: 1 }, E04: {}, E05: { perTurn: 1 }, E06: { damage: 2 },
  E07: { perTurn: 1 }, E08: { perTurn: 1 },
  L01: { chanceMultiplier: 1.1 }, L02: { chance: 0.1 }, L03: { step: 0.02, max: 0.1 }, L04: { chance: 0.1, draw: 1 },
  L05: { chance: 0.05, perTurn: 1 }, L06: { rolls: 2 }, L07: { failures: 3, mp: 1, perTurn: 1 }, L08: { rolls: 2 },
  P01: { initialMp: 2 }, P02: { storeMax: 5, autoTransfer: 1 }, P03: { coinCost: 1, mp: 2, perTurn: 1 }, P04: { coins: 1, perMatch: 2 },
  P05: { chance: 0.1, mpReduce: 1, mpMin: 1 }, P06: { damage: 2 }, P07: { maxMp: 2 }, P08: { perTurn: 1 },
  H01: { maxCards: 2, perMatch: 1 }, H02: { chance: 0.1, perTurn: 1 }, H03: { perMatch: 1 }, H04: { perMatch: 1 }, H05: { perMatch: 1 },
  H06: { nthCard: 3, draw: 1, perTurn: 1 }, H07: { perTurn: 1 }, H08: { reveal: 3, perTurn: 1 },
  U01: { soldiersPerTurn: 1 }, U02: { damage: 2 }, U03: { perTurn: 1 }, U04: { range: 1 }, U05: { attack: 1 }, U06: { perTurn: 1 },
  U07: { shield: 2, perTurn: 1 }, U08: { perTurn: 1 },
  G01: { damage: 2, perTurn: 2 }, G02: { souls: 1, max: 6 }, G03: { mp: 1, perTurn: 1 }, G04: { perMatch: 1 }, G05: { ratio: 0.25, max: 3 },
  G06: { soulCost: 3, hpRatio: 0.5, perTurn: 1 }, G07: { shield: 2, perTurn: 1 }, G08: { hpRatio: 0.5, perTurn: 1 },
  R01: { heal: 1 }, R02: { storeMax: 5 }, R03: { cleanse: 1 }, R04: { heal: 1 }, R05: { heal: 1, perTurn: 1 },
  R06: { chance: 0.2, powerRatio: 0.5, perTurn: 1 }, R07: { shield: 1, perTurn: 2 }, R08: { maxHp: 1, perTurn: 1, perTargetMax: 3 },
  D01: { armor: 4 }, D02: { ratio: 0.2, perTurnMax: 4 }, D03: { chance: 0.1 }, D04: { ratio: 0.5, perTurn: 1 }, D05: { armorFloor: 2 },
  D06: { absorb: 3, perTurn: 1 }, D07: { reduce: 2, perTurn: 1 }, D08: { armor: 5, perMatch: 1 },
  A01: { damage: 2, perTurn: 1 }, A02: { range: 1 }, A03: { damage: 2 }, A04: { draw: 1, perTurn: 1 }, A05: { ratio: 0.2 },
  A06: { perTurn: 1 }, A07: { damage: 2, perTurn: 1 }, A08: { pierceRatio: 1 },
  T01: { powerRatio: 0.5 }, T02: { chance: 0.2, maxExtend: 1 }, T03: { mpThreshold: 2, mp: 1 }, T04: { perTurn: 1 },
  T05: { heal: 1, perTurn: 1 }, T06: { draw: 1, perMatch: 2 }, T07: { mp: 1, perTurn: 1 }, T08: { powerRatio: 1, perMatch: 1 },
  S01: { turns: 1, perTurn: 1 }, S02: { statusCount: 2, damage: 2 }, S03: { chance: 0.15, status: 'poison', turns: 2, perTurn: 1 },
  S04: { damage: 1 }, S05: { chance: 0.2, status: 'burn', turns: 1, perTurn: 1 }, S06: { damage: 1 }, S07: { mp: 1, perTurn: 1 },
  S08: { max: 8, perTurn: 1 },
  K01: { ignoreDefense: 1 }, K02: { reduce: 1 }, K03: { range: 1 }, K04: { shield: 1, perTurn: 1 }, K05: { perTurn: 1 },
  K06: { shield: 2, perTurn: 1 }, K07: { steps: 1, perTurn: 1 }, K08: { steps: 1, perTurn: 1 },
  F01: { chance: 0.2, powerRatio: 0.5, perTurn: 1 }, F02: { chance: 0.2, perTurn: 1 }, F03: { shield: 2, perTurn: 1 }, F04: { damage: 2 },
  F05: { powerRatio: 0.5, perTurn: 1 }, F06: { mp: 1, perTurn: 1 }, F07: { mpReduce: 1, mpMin: 1 }, F08: { perTurn: 1 },
  Q01: { sp: 1, perTurnMax: 3 }, Q02: { spThreshold: 15, damage: 1 }, Q03: { spCost: 3, shield: 3, perTurn: 1 }, Q04: { sp: 1, perTurn: 1 },
  Q05: { spCost: 3, critChanceAdd: 0.2, perTurn: 1 }, Q06: { spCost: 5, attack: 1, perTurn: 1 }, Q07: { mp: 2, perTurn: 1 },
  Q08: { spCost: 10, attack: 3, shield: 3, perTurn: 1 },
  V01: { chance: 0.15, perTurn: 1 }, V02: { spellsNeeded: 3, perTurn: 1 }, V03: { shield: 1 }, V04: { tokensNeeded: 2, damage: 1 },
  V05: { mp: 1, perTurn: 1 }, V06: { chance: 0.2, perTurn: 1 }, V07: { mpCost: 3, perTurn: 1 }, V08: { familiarAttack: 1 },
  I01: { perTurn: 1 }, I02: { chance: 0.15, perTurn: 1 }, I03: { chance: 0.2, perTurn: 1 }, I04: { mpReduce: 1, mpMin: 1 },
  I05: { damage: 1, perTurn: 1 }, I06: { heal: 2, perTurn: 1 }, I07: { cardsNeeded: 3, draw: 1, perTurn: 1 }, I08: { perMatch: 1 },
  B01: { hpPerMp: 2, hpFloor: 1 }, B02: { hpCost: 3, draw: 1, perTurn: 1 }, B03: { hpCost: 2, damage: 4, perTurn: 1 },
  B04: { ratio: 0.1, perTurnMax: 3 }, B05: { hpRatio: 0.3, damageRatio: 0.2 }, B06: { max: 8, mpCost: 3, mp: 1, perTurn: 1 },
  B07: { min: 1, max: 4, perTurn: 1 }, B08: { hpPerMp: 1 },
  X01: { chance: 0.25, powerRatio: 0.5, perTurn: 1 }, X02: { powerRatio: 0.5, perTurn: 1 }, X03: { mp: 1, perTurn: 1 },
  X04: { storeCost: 2, draw: 1, perTurn: 1 }, X05: { draw: 1, perTurn: 1 }, X06: { perTurn: 1 }, X07: { heal: 2, perTurn: 1 },
  X08: { perTurnMax: 3 }, X09: { damage: 3, perTurn: 1 }, X10: { critChance: 0.15, critMultiplier: 1.5, pierceChance: 0.3 },
  X11: { chance: 0.1, multiplier: 2, totalMax: 3 }, X12: { chance: 0.1, perTurn: 1 }, X13: { chance: 0.1, powerRatio: 0.5, perTurn: 1 },
  X14: { chance: 0.2, perMatch: 1 }, X15: { chance: 0.2, reveal: 2, perTurn: 1, pick: 'cost' }, X16: { chance: 0.2, multiplier: 2, perTurn: 1 },
  X17: { critChance: 0.15, critMultiplier: 1.5 }, X18: { maxEcho: 1 }, X19: { chance: 0.2, perTurn: 1 }, X20: { sp: 1, perTurnMax: 2 },
  X21: { element: 'light', perTurn: 1 }, X22: { maxEcho: 1 }, X23: { damage: 2, perTurn: 1 }, X24: { perTurn: 1 }, X25: {},
  X26: { heal: 1, perTurnMax: 2 }, X27: { hpCost: 2, powerRatio: 0.5, perTurn: 1 }, X28: { heal: 2, perTurn: 1 },
  X29: { castleHp: 2, mp: 2, perTurn: 1 }, X30: { ratio: 0.25, perTurnMax: 2 }, X31: { hpPerFamiliar: 5, carryMax: 9, perTurn: 1 },
  X32: { chance: 0.2, perTurn: 1 }, X33: { spPerHp: 1, perTurnMax: 3 }, X34: { armorPerHp: 1, perTurnMax: 3 },
  X35: { deferMax: 2, perTurn: 1, autoDefer: false }, X36: { healThreshold: 3, sp: 2, perTurn: 1 }, X37: { attack: 1, perTurnMax: 2 },
  X38: { redirectMax: 2, perTurn: 1 }, X39: { overflowMax: 3, perTurn: 1 }, X40: { shield: 1, perTurn: 1 },
  X41: { powerRatio: 0.5, perTurn: 1 }, X42: { perTurn: 1 }, X43: { mpCost: 2, attack: 3, perTurn: 1 },
  X44: { handMin: 2, reveal: 2, perTurn: 1 }, X45: { damage: 2, perTurnMax: 2 }, X46: { perTurn: 1 }, X47: { draw: 1, perTurn: 1 },
  X48: { spThreshold: 20, critChanceAdd: 0.1 },
};

/** ノード内の設定（取得ノード数は増えない）。選択肢は実データ（反応・属性）のIDを使う */
const reactions = JSON.parse(readFileSync(join(root, 'data/classic/reactions.json'), 'utf8'));
const elements = JSON.parse(readFileSync(join(root, 'data/classic/elements.json'), 'utf8'));
const E04_AMOUNTS = { annihilation: 4, blackIce: 4, shatter: 4, chaos: 5 };
const CONFIG = {
  E04: {
    key: 'reaction',
    default: 'annihilation',
    options: Object.entries(E04_AMOUNTS).map(([id, amount]) => {
      const name = id === 'chaos' ? reactions.chaos.name : reactions.reactions[id]?.name;
      if (!name) throw new Error(`E04: 反応 ${id} が data/classic/reactions.json にありません`);
      return { id, name, amount };
    }),
  },
  X25: {
    key: 'element',
    default: 'fire',
    options: Object.entries(elements.elements).map(([id, e]) => ({ id, name: e.name })),
  },
};

/** 仕様 第10章の合法ビルド例（取得順）。おすすめ（CPU とはじめての人向け） */
const PRESETS = {
  critMagicLuck: { name: '会心＋魔法＋幸運', ids: ['C01', 'C02', 'C04', 'X01', 'M02', 'M01', 'M04', 'M06', 'M08', 'L01', 'L02', 'X11'] },
  bloodHealDefense: { name: '血魔術＋回復＋防御', ids: ['B01', 'B02', 'X28', 'R02', 'R01', 'X08', 'D05', 'D03', 'D01', 'D07', 'D08', 'B03'] },
  elementManaMagic: { name: '属性＋魔力＋魔法', ids: ['E01', 'E03', 'E05', 'E07', 'E08', 'X02', 'M03', 'M01', 'M02', 'E04', 'E06', 'X03'] },
  graveTroopsSummon: { name: '墓地＋兵士＋召喚', ids: ['G01', 'G03', 'G05', 'X06', 'U05', 'U03', 'U01', 'G07', 'G08', 'X46', 'V03', 'V01'] },
};

const EDGES = [['START', '01'], ['01', '02'], ['01', '03'], ['02', '04'], ['03', '05'], ['04', '05'], ['04', '06'], ['05', '07'], ['06', '08'], ['07', '08']];

// ---------------- 座標（画面用。リング配置） ----------------
/** 系統内の形：[半径方向の距離, 扇の中での横のずれ（-1〜1）] */
const SHAPE = { '01': [0, 0], '02': [1, -0.6], '03': [1, 0.6], '04': [2, -0.6], '05': [2, 0.6], '06': [3, -0.6], '07': [3, 0.6], '08': [4, 0] };
const layout = {};
const sector = (2 * Math.PI) / RING.length;
const pos = (angle, r) => ({ x: Math.round(Math.cos(angle) * r), y: Math.round(Math.sin(angle) * r) });
RING.forEach((g, i) => {
  const center = -Math.PI / 2 + i * sector; // 会心が真上、時計回り
  for (const [suffix, [step, side]] of Object.entries(SHAPE)) {
    const r = 340 + step * 95;
    layout[`${g}${suffix}`] = pos(center + side * sector * 0.32 * (340 / r) * (1 + step * 0.25), r);
  }
});
// 幸運（中央寄り）：START の下側に小さく同じ形で置く
for (const [suffix, [step, side]] of Object.entries(SHAPE)) {
  layout[`${CENTER}${suffix}`] = { x: Math.round(side * 70), y: Math.round(70 + step * 45) };
}
for (const x of cross) {
  const [a, b] = x.ends.map((e) => layout[e]);
  layout[x.id] = { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
}
// 重なった座標は少しずらす（決まった順なので毎回同じ）
const taken = new Map();
for (const id of [...Object.keys(layout)].sort()) {
  let p = layout[id];
  while ([...taken.values()].some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 24)) p = { x: p.x + 18, y: p.y + 14 };
  layout[id] = p;
  taken.set(id, p);
}

// ---------------- 組み立て ----------------
const order = [...RING, CENTER];
const nodes = [];
for (const gid of order) {
  const g = groups.find((x) => x.id === gid);
  if (!g) throw new Error(`仕様書に系統 ${gid} がありません`);
  for (const n of g.nodes) {
    nodes.push({
      id: n.id, group: gid, name: n.name, desc: n.desc, cost: 1, ultimate: n.ultimate, cross: false, ends: null,
      requires: REQUIRES[n.id] ?? [], handler: n.id, params: PARAMS[n.id] ?? fail(n.id),
      ...(CONFIG[n.id] ? { config: CONFIG[n.id] } : {}), layout: layout[n.id],
    });
  }
}
for (const x of cross) {
  nodes.push({
    id: x.id, group: 'X', name: x.name, desc: x.desc, cost: 1, ultimate: false, cross: true, ends: x.ends,
    requires: REQUIRES[x.id] ?? [], handler: x.id, params: PARAMS[x.id] ?? fail(x.id),
    ...(CONFIG[x.id] ? { config: CONFIG[x.id] } : {}), layout: layout[x.id],
  });
}
function fail(id) { throw new Error(`PARAMS に ${id} がありません`); }

const tree = {
  _note: 'クラシックの200ノードのスキルツリー（仕様 docs/skilltree-200-spec.md・要約 docs/classic-skilltree.md）。このファイルは tools/build-skilltree.mjs が作る（手で直さない）。全ノード1pt・budget pt まで・奥義は1個まで。START から取得済みノードを通じて辺（edges の系統内テンプレート＋横断ノードの ends）でつながるノードを取れる。requires は接続とは別の必須。handler は効果ハンドラのID、params は効果の数値（初期値・未調整）。layout は画面用の座標',
  version: 3,
  budget: 12,
  start: { id: 'START', name: 'スタート', cost: 0, layout: { x: 0, y: 0 } },
  edges: EDGES,
  ring: RING,
  center: CENTER,
  nodeShapes: { start: 'star', normal: 'circle', ultimate: 'hexagon', cross: 'diamond' },
  groups: Object.fromEntries(order.map((gid) => {
    const g = groups.find((x) => x.id === gid);
    return [gid, { name: g.name, ring: gid === CENTER ? null : RING.indexOf(gid), ...GROUP_HINTS[gid] }];
  })),
  /** 横断ノード（group は "X"。19系統には数えない）の表示のヒント */
  crossGroup: { id: 'X', name: '横断', color: '#ffffff', glyph: 'bridge' },
  nodes,
  presets: PRESETS,
};

const json = `${JSON.stringify(tree, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const now = readFileSync(OUT, 'utf8');
  if (now !== json) {
    console.error('data/classic/skilltree.json が tools/build-skilltree.mjs の出力と違います');
    process.exit(1);
  }
  console.log('同じです');
} else {
  writeFileSync(OUT, json);
  console.log(`書き出しました：${nodes.length} ノード（系統 ${groups.length}・横断 ${cross.length}）`);
}
