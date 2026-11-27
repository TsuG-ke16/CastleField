// スキルツリー画面・対戦中のスキル表示の「DOM を使わない」部分（テストできるように分けた）。
// 取得・解除・検証のルールはすべて js/game/SkillTree.js の API を呼ぶ（ここで別のルールを作らない）。
// ここにあるのは表示用の分類（取得済み／取得可能／未接続／条件不足）・検索・経路の強調・保存の読み書き・
// 対戦中の状態表示の行の組み立てだけ。

import {
  treeIndex, canAcquire, release, cost, validate, normalizeBuild, serializeBuild, deserializeBuild, emptyBuild,
} from '../game/SkillTree.js';
import { HANDLERS, CORE_IMPLEMENTED, STATIC_IMPLEMENTED } from '../game/skills/handlers/index.js';
// 攻撃魔法（B03 が読む表）・単体攻撃魔法（X27 が読む表）は、効果ハンドラと同じものを読む
import { ATTACK_SPELL_EFFECTS } from '../game/skills/blood.js';
import { SINGLE_ATTACK_EFFECTS as SINGLE_LIST } from '../game/skills/c2util.js';

const SINGLE_ATTACK_EFFECTS = new Set(SINGLE_LIST);

/** localStorage のキー（中身は SkillTree.serializeBuild の形：{ version, ids, config, budget }） */
export const SKILL_BUILD_KEY = 'cf-classic-skilltree';

/** ノードの種類：start / normal / ultimate / cross */
export function nodeKind(node) {
  if (!node) return 'start';
  return node.cross ? 'cross' : node.ultimate ? 'ultimate' : 'normal';
}

export const KIND_LABEL = { start: 'スタート', normal: '通常', ultimate: '奥義', cross: '横断' };
export const STATE_LABEL = { start: 'スタート', owned: '取得済み', available: '取得できる', unconnected: '未接続', blocked: '条件不足' };

/**
 * ノードの表示状態。判定は canAcquire（SkillTree.js）に任せ、理由もその文をそのまま使う。
 * owned：取得済み／available：今取れる／unconnected：取得済みノードとつながっていない／blocked：つながっているが必須・奥義・ポイントで取れない
 * @returns {{ state: string, reason: string|null }}
 */
export function nodeStatus(tree, picked, id, budget) {
  const ix = treeIndex(tree);
  if (id === ix.startId) return { state: 'start', reason: null };
  if (picked.includes(id)) return { state: 'owned', reason: null };
  const check = canAcquire(tree, picked, id, budget);
  if (check.ok) return { state: 'available', reason: null };
  const adjacent = [...ix.adj.get(id)].some((x) => x === ix.startId || picked.includes(x));
  return { state: adjacent ? 'blocked' : 'unconnected', reason: check.reason };
}

/** 全ノードの表示状態（Map id → { state, reason }。START を含む） */
export function allStatuses(tree, picked, budget) {
  const ix = treeIndex(tree);
  const out = new Map([[ix.startId, { state: 'start', reason: null }]]);
  for (const id of ix.order) out.set(id, nodeStatus(tree, picked, id, budget));
  return out;
}

/** 残りポイント・奥義数・取得数 */
export function buildSummary(tree, picked, budget) {
  const ix = treeIndex(tree);
  const b = budget ?? tree.budget;
  const spent = cost(tree, picked);
  return {
    budget: b, spent, left: b - spent, count: picked.length,
    ultimates: picked.filter((id) => ix.byId.get(id)?.ultimate).length,
  };
}

/** 無向の辺の一覧（重複なし。[a, b] は index の順） */
export function edgeList(tree) {
  const ix = treeIndex(tree);
  const out = [];
  const seen = new Set();
  for (const [a, set] of ix.adj) {
    for (const b of set) {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(a < b ? [a, b] : [b, a]);
    }
  }
  return out;
}

/**
 * 辺の表示：path（両端が取得済み/START＝選んだ経路）・next（取得済みと取得できるノードの間）・plain
 */
export function edgeState(statuses, a, b) {
  const on = (id) => ['owned', 'start'].includes(statuses.get(id)?.state);
  if (on(a) && on(b)) return 'path';
  if ((on(a) && statuses.get(b)?.state === 'available') || (on(b) && statuses.get(a)?.state === 'available')) return 'next';
  return 'plain';
}

/**
 * 取得済み（と START）から id までの最短の道（表示用の案内。取得の可否は canAcquire が決める）。
 * 途中のノード（取得済みを除く）を id まで順に返す。たどれなければ null
 */
export function routeTo(tree, picked, id) {
  const ix = treeIndex(tree);
  if (!ix.byId.has(id)) return null;
  const have = new Set([ix.startId, ...picked]);
  if (have.has(id)) return [];
  const prev = new Map();
  const queue = [...have];
  for (const s of have) prev.set(s, null);
  while (queue.length) {
    const cur = queue.shift();
    for (const nx of ix.adj.get(cur)) {
      if (prev.has(nx)) continue;
      prev.set(nx, cur);
      if (nx === id) {
        const path = [];
        for (let x = id; x !== null && !have.has(x); x = prev.get(x)) path.unshift(x);
        return path;
      }
      queue.push(nx);
    }
  }
  return null;
}

/** 検索：ID・名前・効果文・系統名（部分一致、大文字小文字を区別しない）。group を指定するとその系統だけ */
export function searchNodes(tree, query = '', group = null) {
  treeIndex(tree);
  const q = String(query ?? '').trim().toLowerCase();
  return tree.nodes.filter((n) => {
    if (group && n.group !== group && !(group !== 'X' && n.cross && n.ends.some((e) => e[0] === group))) return false;
    if (!q) return true;
    const gname = n.cross ? tree.crossGroup?.name ?? '横断' : tree.groups[n.group]?.name ?? '';
    return [n.id, n.name, n.desc, gname].some((s) => String(s).toLowerCase().includes(q));
  }).map((n) => n.id);
}

/** 系統の一覧（ボタン用）：[{ id, name, color }]。横断 X を最後に */
export function groupList(tree) {
  const list = Object.entries(tree.groups).map(([id, g]) => ({ id, name: g.name, color: g.color ?? '#999' }));
  if (tree.crossGroup) list.push({ id: 'X', name: tree.crossGroup.name ?? '横断', color: tree.crossGroup.color ?? '#fff' });
  return list;
}

/** ノードの効果の実装状況（handlers/index.js の登録）：handler / core / static / null（休眠） */
export function implementationOf(id) {
  const h = HANDLERS[id];
  if (h && (h.on || h.mods || h.actions || h.scheduled || h.mulligan)) return 'handler';
  if (CORE_IMPLEMENTED.has(id)) return 'core';
  if (STATIC_IMPLEMENTED.has(id)) return 'static';
  return null;
}

/** 回数の説明（params の perTurn / perMatch など） */
export function limitText(node) {
  const p = node?.params ?? {};
  const parts = [];
  if (p.perTurn !== undefined) parts.push(`各自ターン${p.perTurn}回`);
  if (p.perMatch !== undefined) parts.push(`試合中${p.perMatch}回`);
  if (p.chance !== undefined) parts.push(`確率${Math.round(p.chance * 100)}%`);
  return parts.join('・');
}

/** ノードの詳細（パネル用の文字列だけ）。状態と理由は nodeStatus の結果 */
export function nodeDetail(tree, picked, id, budget) {
  const ix = treeIndex(tree);
  if (id === ix.startId) {
    return { id, name: tree.start.name ?? 'スタート', kind: 'start', kindLabel: KIND_LABEL.start, group: null, desc: 'ここから隣のノードを取っていきます（0pt）。', status: { state: 'start', reason: null }, requires: [], ends: [], limit: '', implemented: 'core', config: null };
  }
  const node = ix.byId.get(id);
  if (!node) return null;
  const kind = nodeKind(node);
  const status = nodeStatus(tree, picked, id, budget);
  const name = (x) => `${x}「${ix.byId.get(x)?.name ?? x}」`;
  return {
    id, name: node.name, kind, kindLabel: KIND_LABEL[kind],
    group: node.cross ? (tree.crossGroup?.name ?? '横断') : tree.groups[node.group]?.name,
    desc: node.desc, status, requires: node.requires.map(name), ends: (node.ends ?? []).map(name),
    limit: limitText(node), implemented: implementationOf(id), config: node.config ?? null,
    releaseCheck: status.state === 'owned' ? release(tree, picked, id, budget) : null,
  };
}

// ================= 操作（すべて SkillTree.js の判定を通す） =================

/** 取得：canAcquire が ok のときだけ足す。{ ok, reason?, build } */
export function acquire(tree, build, id, budget) {
  const check = canAcquire(tree, build.ids, id, budget);
  if (!check.ok) return { ok: false, reason: check.reason, build };
  const ids = [...build.ids, id];
  const n = normalizeBuild(tree, { ids, config: build.config }, budget);
  return n.ok ? { ok: true, build: n.build } : { ok: false, reason: n.reason, build };
}

/** 解除：release が ok のときだけ外す */
export function releaseNode(tree, build, id, budget) {
  const r = release(tree, build.ids, id, budget);
  if (!r.ok) return { ok: false, reason: r.reason, build };
  const n = normalizeBuild(tree, { ids: r.picked, config: build.config }, budget);
  return n.ok ? { ok: true, build: n.build } : { ok: false, reason: n.reason, build };
}

/** 設定（E04・X25）を変える。取得済みでなくても選んでおける（取得したときにその値になる） */
export function setConfig(tree, build, id, value, budget) {
  const config = { ...build.config, [id]: value };
  const n = normalizeBuild(tree, { ids: build.ids, config: Object.fromEntries(Object.entries(config).filter(([k]) => build.ids.includes(k))) }, budget);
  if (!n.ok) return { ok: false, reason: n.reason, build };
  // 取っていないノードの選択は、取ったときに使えるように持っておく（normalizeBuild は捨てるので戻す）
  return { ok: true, build: { ids: n.build.ids, config: { ...config, ...n.build.config } } };
}

/** おすすめ（tree.presets）を適用 */
export function applyPreset(tree, presetId, budget) {
  const p = tree.presets?.[presetId];
  if (!p) return { ok: false, reason: 'そのおすすめはありません', build: emptyBuild() };
  const n = normalizeBuild(tree, { ids: p.ids, config: p.config ?? {} }, budget);
  return n.ok ? { ok: true, build: n.build } : { ok: false, reason: n.reason, build: emptyBuild() };
}

/** 対戦に渡す形（取っていないノードの設定は落とす）。{ ids, config } */
export function buildForGame(tree, build, budget) {
  const n = normalizeBuild(tree, { ids: build.ids, config: Object.fromEntries(Object.entries(build.config ?? {}).filter(([k]) => build.ids.includes(k))) }, budget);
  return n.ok ? n.build : emptyBuild();
}

// ================= 保存 =================

/**
 * 保存したビルドを読む（SkillTree.deserializeBuild。旧版は振り直し＝空ビルド＋理由）。
 * @param {{ getItem(k: string): string|null }} storage
 * @returns {{ build, notice: string|null }}
 */
export function loadSavedBuild(tree, storage) {
  let raw = null;
  try { raw = storage?.getItem(SKILL_BUILD_KEY) ?? null; } catch { raw = null; }
  if (raw === null) return { build: emptyBuild(), notice: null };
  let saved;
  try { saved = JSON.parse(raw); } catch { return { build: emptyBuild(), notice: '保存したスキルが読めなかったので、空にしました' }; }
  const r = deserializeBuild(tree, saved);
  if (r.migrated) return { build: r.build, notice: r.reason };
  if (!r.ok) return { build: r.build, notice: `保存したスキルが今の決まりに合わないので、空にしました（${r.reason}）` };
  return { build: r.build, notice: null };
}

/** ビルドを保存（SkillTree.serializeBuild。版つき）。成功なら true */
export function saveBuild(tree, storage, build, budget) {
  try {
    storage?.setItem(SKILL_BUILD_KEY, JSON.stringify(serializeBuild(tree, buildForGame(tree, build, budget), budget)));
    return true;
  } catch {
    return false;
  }
}

/** ビルドが今の決まりに合うか（validate の結果。表示用） */
export const checkBuild = (tree, build, budget) => validate(tree, build.ids, budget);

// ================= 対戦中の表示 =================

const RESOURCE_ROWS = [
  // [資源キー, 表示名, 必要なノード（どれかを持っていれば表示）]
  ['soul', '魂', ['G02', 'G06']],
  ['blood', '血気', ['B06', 'B07', 'X29', 'X31']],
  ['storedMp', '貯蔵MP', ['P02', 'P08', 'X03', 'X04']],
  ['healStore', '回復貯蔵', ['R02', 'X08']],
  ['sp', 'SP', ['Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06', 'Q07', 'Q08', 'C07', 'X20', 'X33', 'X36', 'X48']],
];
const CAPS = { soul: 6, blood: 8, storedMp: 5, healStore: 5, sp: 30 };

/**
 * 対戦中の状態の行（取得しているノードに関係する資源だけ）。skillState は getState の players[id].skillState
 * （相手のときは公開部分だけが入っているので、本人だけの値は own のときだけ読む）
 * @returns {{ label: string, value: string }[]}
 */
export function skillStatusRows(skills, skillState, own) {
  if (!skillState) return [];
  const have = new Set(skills ?? []);
  const rows = [];
  for (const [key, label, needs] of RESOURCE_ROWS) {
    if (!needs.some((n) => have.has(n))) continue;
    rows.push({ label, value: `${skillState.resources?.[key] ?? 0} / ${CAPS[key]}` });
  }
  if (skillState.debt > 0 || have.has('X35')) rows.push({ label: 'HP債務', value: String(skillState.debt ?? 0) });
  if (skillState.scheduledCount > 0 || ['T01', 'T05', 'T06', 'R04', 'X07', 'I07', 'V06', 'X24'].some((n) => have.has(n))) rows.push({ label: '予約', value: `${skillState.scheduledCount ?? 0}件` });
  if (skillState.tokens > 0 || ['V01', 'V02', 'V07', 'I08', 'X19', 'X31', 'X46'].some((n) => have.has(n))) rows.push({ label: 'トークン', value: `${skillState.tokens ?? 0}体` });
  if (have.has('G06') || have.has('G04') || have.has('G08')) rows.push({ label: '墓地', value: `${skillState.graveCount ?? 0}体` });
  if (own) {
    if (have.has('C02') && skillState.critStack) rows.push({ label: '会心の蓄積', value: `+${Math.round(skillState.critStack * 100)}pt` });
    if (skillState.critFocus) rows.push({ label: '集中', value: `+${Math.round(skillState.critFocus * 100)}pt` });
    if (skillState.critForcedNext) rows.push({ label: '次の会心', value: '確定' });
    if (have.has('L03') && skillState.luckStack) rows.push({ label: '運命の蓄積', value: `+${Math.round(skillState.luckStack * 100)}pt` });
    if (skillState.peek && Object.keys(skillState.peek).length) rows.push({ label: '確認したカード', value: Object.entries(skillState.peek).map(([k, v]) => `${k}: ${peekText(v)}`).join(' ／ ') });
  }
  if (skillState.public?.x31 !== undefined) rows.push({ label: '血の眷属', value: `${skillState.public.x31} / 5` });
  if (skillState.public?.M07ready) rows.push({ label: '詠唱の準備', value: '次の魔法MP-1' });
  return rows;
}

function peekText(v) {
  if (v === null || v === undefined) return 'なし';
  if (Array.isArray(v)) return v.map(peekText).join('・');
  if (typeof v === 'object') return v.name ?? v.type ?? v.cardType ?? JSON.stringify(v);
  return String(v);
}

/** 取得スキルの回数（本人だけ）：skillState.uses と params から「n/m」 */
export function usesText(tree, skillState, id) {
  const node = treeIndex(tree).byId.get(id);
  const p = node?.params ?? {};
  const turn = Object.entries(skillState?.uses?.turn ?? {}).filter(([k]) => k.startsWith(`${id}:`)).reduce((s, [, v]) => s + v, 0);
  const match = Object.entries(skillState?.uses?.match ?? {}).filter(([k]) => k.startsWith(`${id}:`)).reduce((s, [, v]) => s + v, 0);
  if (p.perMatch !== undefined) return `試合中 ${match}/${p.perMatch}`;
  if (p.perTurn !== undefined) return `このターン ${turn}/${p.perTurn}`;
  return '';
}

/**
 * スキルの発動ログ（game.skillEvents / observeSkills の1件）を1行の文にする。自分の発動（kind "trigger"）と
 * 自分の HP 支払・診断だけ。相手のものや、本人だけの情報が入る行は viewerId でしぼる。表示しないものは null
 */
export function skillLogText(tree, entry, viewerId) {
  if (!entry || entry.playerId !== viewerId) return null;
  const name = (id) => treeIndex(tree).byId.get(id)?.name ?? id;
  if (entry.kind === 'trigger' && entry.skillId) return `${name(entry.skillId)}（${entry.skillId}）が発動${entry.count > 1 ? `・${entry.count}回目` : ''}`;
  if (entry.kind === 'diagnostic') return `スキルの上限に達しました（${entry.type ?? entry.reason ?? entry.code ?? ''}）`;
  return null;
}

/** L06 の出目の選び方 */
const DICE_CHOICES = [['high', '大きい方'], ['low', '小さい方'], ['first', '1回目'], ['second', '2回目']];
/** 城HPを払う選択（X35 の延期を聞くきっかけ） */
const HP_KEYS = new Set(['hpForMp', 'bloodBlade', 'bloodEcho']);

/**
 * 対戦中に切り替えるスキルの設定（Game.setSkillPrefs。js/game/skills/Runtime.js の SKILL_PREFS）の行。取ったノードだけ、今の値つき。
 * @param {string[]} skills 取得済みID
 * @param {object} prefs skillState.prefs（＋画面で変えたばかりの値）
 * @returns {{ skillId: string, key: string, type: 'choice'|'toggle', label: string, value: any, choices?: [string, string][], note: string }[]}
 */
export function skillPrefRows(skills, prefs = {}) {
  const have = new Set(skills ?? []);
  const out = [];
  if (have.has('X15')) {
    out.push({ skillId: 'X15', key: 'pick', type: 'choice', label: '運命の引き寄せ（X15）：2枚からの選び方', value: prefs?.X15?.pick ?? 'cost',
      choices: [['cost', '自動：MPコストの大きい方（既定）'], ['ask', '毎回選ぶ'], ['first', '自動：1枚目'], ['second', '自動：2枚目']],
      note: '「毎回選ぶ」は、発動したとき2枚を見せて選んでもらいます。選ばずにほかの操作をすると、MPコストの大きい方になります。' });
  }
  if (have.has('L06')) {
    out.push({ skillId: 'L06', key: 'diceChoice', type: 'choice', label: '幸運の賽（L06）：2つの出目からの選び方', value: prefs?.L06?.diceChoice ?? 'high', choices: DICE_CHOICES,
      note: '出目を見てから選ぶことはできないので、先に決めておきます（サイコロのカードを使うとき、カードごとにも選べます）。クラシックの山札にはサイコロのカードがないため、ふだんは発動しません。' });
  }
  if (have.has('X35')) {
    out.push({ skillId: 'X35', key: 'autoDefer', type: 'toggle', label: '遅延代償（X35）：任意のHP支払を自動で延期する', value: Boolean(prefs?.X35?.autoDefer),
      note: 'ONにすると、各ターン最初の任意のHP支払のうち最大2を次の自分のターンの始めに払います。延期した分（債務）が残るあいだは、そのターンのほかの任意のHP支払（血の代償・血の刃・血のやまびこ・血の契約など）ができなくなります。カードごとにも選べます。' });
  }
  return out;
}

/**
 * カード使用前に聞くスキルの選択（playCard の skillOptions）。表示に必要な「どれを聞くか」だけを決める。
 * 実際の費用はセッションの previewCardCost（Game の費用計画）で確かめる。
 * @param {string[]} skills 取得済みID
 * @param {object} def カードの定義（cards[type]）
 * @param {{ mp: number, cost: number, prefs?: object }} ctx 今のMPと、カードのMPコスト（mpCosts）、本人の設定（skillState.prefs。既定の答えに使う）
 * @returns {{ key: string, skillId: string, type: 'range'|'toggle'|'choice', label: string, min?: number, max?: number, choices?: [string, string][] }[]}
 */
export function cardSkillQuestions(skills, def, { mp = 0, cost: mpCost = 0, prefs = {} } = {}) {
  const have = new Set(skills ?? []);
  if (!def) return [];
  const isSpell = def.kind === 'spell';
  const attack = isSpell && ATTACK_SPELL_EFFECTS.has(def.effect);
  const single = isSpell && SINGLE_ATTACK_EFFECTS.has(def.effect);
  const out = [];
  if (isSpell && mpCost > 0 && have.has('B08')) {
    const shortage = Math.max(0, mpCost - mp);
    out.push({ key: 'hpForMp', skillId: 'B08', type: 'range', label: 'MPの代わりに城HPで払う量（血の支配者 MP1=HP1）', min: shortage, max: mpCost });
  } else if (isSpell && mpCost > mp && have.has('B01')) {
    out.push({ key: 'hpForMp', skillId: 'B01', type: 'toggle', label: `足りないMP${mpCost - mp}を城HPで払う（血の代償 MP1=HP2）`, default: true });
  }
  if (attack && have.has('B03')) out.push({ key: 'bloodBlade', skillId: 'B03', type: 'toggle', label: '血の刃：城HP2を払って最初の命中+4（各自ターン1回）', default: false });
  if (single && have.has('X27')) out.push({ key: 'bloodEcho', skillId: 'X27', type: 'toggle', label: '血のやまびこ：命中後に城HP2を払って威力50%で再発動（各自ターン1回）', default: false });
  if (def.effect === 'dice' && have.has('L06')) out.push({ key: 'diceChoice', skillId: 'L06', type: 'choice', label: '幸運の賽：2回振った出目のどちらを使うか', choices: DICE_CHOICES, default: prefs?.L06?.diceChoice ?? 'high' });
  // X35：このカードで城HPを払う選択があるときだけ、延期するかを聞く（既定は本人の設定）。false も送るので、設定の ON を1枚だけ止められる
  if (have.has('X35') && out.some((q) => HP_KEYS.has(q.key))) {
    out.push({ key: 'deferHp', skillId: 'X35', type: 'toggle', label: '遅延代償：払う城HPのうち2を次の自分のターンへ延期（延期した債務が残るあいだ、ほかの任意のHP支払はできません）', default: Boolean(prefs?.X35?.autoDefer), always: true });
  }
  return out;
}

/** 質問への答えを skillOptions にする（B01 の toggle false は hpForMp: 0＝置換しない） */
export function answersToOptions(questions, answers) {
  const out = {};
  for (const q of questions) {
    const v = answers?.[q.key] ?? q.default ?? (q.type === 'range' ? q.min : undefined);
    if (q.key === 'hpForMp') {
      if (q.type === 'toggle') { if (!v) out.hpForMp = 0; } else out.hpForMp = Math.max(q.min, Math.min(q.max, Number(v) || 0));
    } else if (q.type === 'toggle') {
      if (q.always) out[q.key] = Boolean(v);
      else if (v) out[q.key] = true;
    } else if (v !== undefined) out[q.key] = v;
  }
  return out;
}

