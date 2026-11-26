// スキルツリー（クラシック。200ノードのグラフ版。仕様 docs/skilltree-200-spec.md・要約 docs/classic-skilltree.md）。
// 試合の前に、決まったポイント（budget。両者同じ）でノードを選ぶ「ビルド」。試合中は変えられない。
// ここには DOM も Game も出てこない：データ（data/classic/skilltree.json）のチェック、取得・解除の判定、
// ビルドの正規化・保存、効果ハンドラのうち「試合の始めの数値」だけの合計（skillMods）。
// 戦闘中の効果ハンドラ（会心・やまびこ など）は段階B/C で足す（ノードの handler と params はデータにある）。

/** このファイルが読めるツリー・保存データの版 */
export const SKILLTREE_VERSION = 3;

/**
 * skillMods で合計する効果のキー（Game が読む）。旧24ノード版から引き継いだもの。
 *   up：大きいほど得（数値）／flag：true だと得（真偽）
 * 今の200ノードで使っているのは STATIC_HANDLERS が返すキーだけ。ほかのキーは Game 側の処理を残してある（休眠：新ハンドラ未実装）
 */
export const SKILL_EFFECTS = {
  castleHp: 'up', // 休眠
  armor: 'up', // D01 石垣（最初の城壁）
  initialMp: 'up', // P01 魔力の泉
  maxMp: 'up', // P07 魔力の器
  mpPerTurn: 'up', // 休眠
  initialHand: 'up', // 休眠
  maxHand: 'up', // 休眠
  soldierAttack: 'up', // 休眠
  castleSpell: 'up', // 休眠
  reactionDamage: 'up', // E06 元素共鳴（自分の攻撃で起きた反応のダメージ）
  randomAttach: 'flag', // E01 混沌の目（ターン開始時のランダム付着をその人だけに）
  randomAttachTurns: 'up', // 休眠
  coinPerTurn: 'up', // 休眠
  spellDamage: 'up', // 休眠
  healBonus: 'up', // R01 癒しの祈り（城を回復する魔法 healOwnCastle の回復量）
  castleRegen: 'up', // 休眠
  armorFloor: 'up', // D05 城壁再生（ターンの始めに城壁がこれ未満ならこの値まで）
  soldiersPerTurn: 'up', // U01 増援
  archerRange: 'up', // U04 長弓（射程のある兵士の射程）
  soldierHp: 'up', // 休眠
  monsterCoins: 'up', // 休眠（P04 魔物狩りは「試合中2回まで」なので段階B/C で別に作る）
  annihilationDamage: 'up', // E04 反応特化（選んだ反応）
  blackIceDamage: 'up',
  shatterDamage: 'up',
  chaosDamage: 'up',
};
/** 反応ごとのダメージのキー（反応のID → キー） */
export const REACTION_DAMAGE_KEYS = { annihilation: 'annihilationDamage', blackIce: 'blackIceDamage', shatter: 'shatterDamage', chaos: 'chaosDamage' };
/** 属性の反応があるゲーム（reactions を渡したゲーム）でしか意味のない効果 */
export const REACTION_SKILL_EFFECTS = ['reactionDamage', 'randomAttach', 'randomAttachTurns', ...Object.values(REACTION_DAMAGE_KEYS)];

/**
 * 試合の始めの数値だけで済む効果ハンドラ（handler ID → (params, 設定値, node) => skillMods の一部）。
 * 数値はデータ（params・config の選択肢）から読む。ここにないハンドラは「新ハンドラ未実装」（段階B/C で戦闘処理に接続する）
 */
export const STATIC_HANDLERS = {
  P01: (p) => ({ initialMp: p.initialMp }),
  P07: (p) => ({ maxMp: p.maxMp }),
  D01: (p) => ({ armor: p.armor }),
  D05: (p) => ({ armorFloor: p.armorFloor }),
  U01: (p) => ({ soldiersPerTurn: p.soldiersPerTurn }),
  U04: (p) => ({ archerRange: p.range }),
  R01: (p) => ({ healBonus: p.heal }),
  E01: () => ({ randomAttach: true }),
  E06: (p) => ({ reactionDamage: p.damage }),
  E04: (p, choice, node) => {
    const opt = node.config.options.find((o) => o.id === choice);
    return { [REACTION_DAMAGE_KEYS[opt.id]]: opt.amount };
  },
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const posInt = (v) => Number.isInteger(v) && v > 0;
const ID_RE = /^[A-Z]\d\d$/;

// ================= データのチェックと索引 =================

const INDEX = new WeakMap();

/**
 * ツリーの索引（同じオブジェクトなら作り直さない。初めてのときにデータをチェックする）。
 * { byId: Map<id, node>, order: id[]（データの順＝安定順）, adj: Map<id, Set<id>>（無向。START を含む）, startId }
 */
export function treeIndex(tree) {
  if (!INDEX.has(tree)) validateSkillTree(tree);
  return INDEX.get(tree);
}

/**
 * スキルツリーのデータのチェック。間違っていれば Error を投げる（どこが・どう直すかを書く）。
 * 形（version 3）：{ version, budget, start: { id }, edges: [[a, b], ...]（系統内の辺のテンプレート。"START" と "01"〜"08"）,
 *   groups: { <英字>: { name } }, nodes: [{ id, group, name, desc, cost, ultimate, cross, ends, requires, handler, params, config? }], presets? }
 */
export function validateSkillTree(tree) {
  const where = 'skilltree.json';
  if (!isObj(tree)) throw new Error(`${where}: オブジェクトにしてください`);
  if (tree.version !== SKILLTREE_VERSION) throw new Error(`${where}: version は ${SKILLTREE_VERSION} にしてください（今は ${tree.version}）`);
  if (!posInt(tree.budget)) throw new Error(`${where}: budget（使えるポイント）は1以上の整数にしてください`);
  if (!isObj(tree.start) || typeof tree.start.id !== 'string') throw new Error(`${where}: start に { id } を書いてください`);
  const startId = tree.start.id;
  if (!isObj(tree.groups) || Object.keys(tree.groups).length === 0) throw new Error(`${where}: groups（系統）を書いてください`);
  for (const [g, def] of Object.entries(tree.groups)) {
    if (!/^[A-Z]$/.test(g) || g === 'X') throw new Error(`${where}: groups の "${g}" は X 以外の英大文字1字にしてください（X は横断）`);
    if (!isObj(def) || typeof def.name !== 'string' || def.name === '') throw new Error(`${where}: groups の "${g}" に name を書いてください`);
  }
  if (!Array.isArray(tree.edges) || tree.edges.some((e) => !Array.isArray(e) || e.length !== 2 || e.some((s) => typeof s !== 'string'))) {
    throw new Error(`${where}: edges は [["START","01"], ["01","02"], ...] の形にしてください`);
  }
  if (!Array.isArray(tree.nodes) || tree.nodes.length === 0) throw new Error(`${where}: nodes（ノードの配列）を書いてください`);
  const byId = new Map();
  for (const [i, n] of tree.nodes.entries()) {
    const w = `${where}: nodes[${i}]${n?.id ? `（${n.id}）` : ''}`;
    if (!isObj(n) || typeof n.id !== 'string' || !ID_RE.test(n.id)) throw new Error(`${w}: id は "C01" のような英大文字1字＋2桁にしてください`);
    if (byId.has(n.id) || n.id === startId) throw new Error(`${w}: id が重なっています`);
    if (typeof n.name !== 'string' || n.name === '' || typeof n.desc !== 'string' || n.desc === '') throw new Error(`${w}: name・desc を書いてください`);
    if (!posInt(n.cost)) throw new Error(`${w}: cost は1以上の整数にしてください`);
    if (typeof n.ultimate !== 'boolean' || typeof n.cross !== 'boolean') throw new Error(`${w}: ultimate・cross は true / false にしてください`);
    if (n.cross) {
      if (n.group !== 'X' || n.ultimate) throw new Error(`${w}: 横断ノードは group "X"・奥義ではないものにしてください`);
      if (!Array.isArray(n.ends) || n.ends.length !== 2 || n.ends[0] === n.ends[1]) throw new Error(`${w}: ends（横断の2端点）を2つ書いてください`);
    } else {
      if (!Object.hasOwn(tree.groups, n.group)) throw new Error(`${w}: group "${n.group}" は groups にありません`);
      if (n.id[0] !== n.group) throw new Error(`${w}: id の英字と group をそろえてください`);
      if (n.ends !== null && n.ends !== undefined) throw new Error(`${w}: 横断でないノードに ends は書けません`);
    }
    if (!Array.isArray(n.requires)) throw new Error(`${w}: requires（個別必須）は配列にしてください（なしは []）`);
    if (typeof n.handler !== 'string' || n.handler === '') throw new Error(`${w}: handler（効果ハンドラのID）を書いてください`);
    if (!isObj(n.params)) throw new Error(`${w}: params は { } にしてください`);
    if (n.config !== undefined) {
      const c = n.config;
      if (!isObj(c) || typeof c.key !== 'string' || !Array.isArray(c.options) || c.options.length === 0) throw new Error(`${w}: config は { key, default, options: [{ id }] } にしてください`);
      if (!c.options.some((o) => o.id === c.default)) throw new Error(`${w}: config.default "${c.default}" が options にありません`);
    }
    byId.set(n.id, n);
  }
  for (const n of tree.nodes) {
    for (const r of n.requires) if (!byId.has(r) || r === n.id) throw new Error(`${where}: ${n.id} の requires "${r}" はほかのノードのIDにしてください`);
    if (n.cross) for (const e of n.ends) if (!byId.has(e) || byId.get(e).cross) throw new Error(`${where}: ${n.id} の ends "${e}" は系統のノードにしてください`);
  }
  // 無向の辺：系統ごとにテンプレートを当てはめる＋横断ノードと2端点。表以外の辺は作らない
  const adj = new Map([[startId, new Set()], ...tree.nodes.map((n) => [n.id, new Set()])]);
  const link = (a, b) => {
    adj.get(a).add(b);
    adj.get(b).add(a);
  };
  for (const g of Object.keys(tree.groups)) {
    const id = (s) => (s === 'START' ? startId : `${g}${s}`);
    for (const [a, b] of tree.edges) {
      if (!adj.has(id(a)) || !adj.has(id(b))) throw new Error(`${where}: 系統 ${g} に辺 ${a}–${b} のノードがありません`);
      link(id(a), id(b));
    }
  }
  for (const n of tree.nodes) if (n.cross) for (const e of n.ends) link(n.id, e);
  INDEX.set(tree, { byId, order: tree.nodes.map((n) => n.id), adj, startId });
  // おすすめはそれ自体が決まりに合う
  if (tree.presets !== undefined) {
    try {
      if (!isObj(tree.presets)) throw new Error(`${where}: presets は { <id>: { name, ids, config? } } にしてください`);
      for (const [id, p] of Object.entries(tree.presets)) {
        if (!isObj(p) || typeof p.name !== 'string') throw new Error(`${where}: presets の "${id}" に name を書いてください`);
        if (byId.has(id)) throw new Error(`${where}: presets の "${id}" はノードと同じIDです`);
        const check = normalizeBuild(tree, { ids: p.ids, config: p.config ?? {} }, tree.budget);
        if (!check.ok) throw new Error(`${where}: presets の "${id}" が決まりに合いません：${check.reason}`);
      }
    } catch (err) {
      INDEX.delete(tree);
      throw err;
    }
  }
}

// ================= 取得・解除の判定 =================

const nameOf = (ix, id) => (ix.byId.get(id)?.name ? `${id}「${ix.byId.get(id).name}」` : String(id));
const budgetOf = (tree, budget) => (budget === undefined || budget === null ? tree.budget : budget);

/** ノードの一覧（データの順）。QA の adapter 用：[{ id, group, name, ultimate, cross }] */
export function nodes(tree) {
  treeIndex(tree);
  return tree.nodes.map((n) => ({ id: n.id, group: n.group, name: n.name, ultimate: n.ultimate, cross: n.cross }));
}

/** 実際に払うポイントの合計（知らないIDは数えない） */
export function cost(tree, picked) {
  const ix = treeIndex(tree);
  return picked.reduce((sum, id) => sum + (ix.byId.get(id)?.cost ?? 0), 0);
}

/**
 * 今の取得済み（picked。取得順の配列）に、id を1つ足せるか。{ ok, reason? }
 * 条件：知っているノード・未取得・START か取得済みノードと辺でつながる・個別必須・奥義は1個まで・残りポイント
 */
export function canAcquire(tree, picked, id, budget) {
  const ix = treeIndex(tree);
  const b = budgetOf(tree, budget);
  if (!Number.isInteger(b) || b < 0) return { ok: false, reason: 'ポイント（budget）は0以上の整数にしてください' };
  if (!Array.isArray(picked)) return { ok: false, reason: 'スキルは、ノードのIDの配列で選んでください' };
  const node = typeof id === 'string' ? ix.byId.get(id) : undefined;
  if (!node) return { ok: false, reason: `「${id}」というスキルはありません` };
  const have = new Set(picked);
  if (have.has(id)) return { ok: false, reason: `${nameOf(ix, id)}はもう取っています` };
  const adjacent = [...ix.adj.get(id)].some((x) => x === ix.startId || have.has(x));
  if (!adjacent) return { ok: false, reason: `${nameOf(ix, id)}は、取ったノードとつながっていません` };
  const missing = node.requires.filter((r) => !have.has(r));
  if (missing.length) return { ok: false, reason: `${nameOf(ix, id)}を取るには、先に${missing.map((r) => nameOf(ix, r)).join('と')}が要ります` };
  if (node.ultimate && picked.some((p) => ix.byId.get(p)?.ultimate)) return { ok: false, reason: '奥義は1つまでです' };
  const spent = cost(tree, picked);
  if (spent + node.cost > b) return { ok: false, reason: `ポイントが足りません（${spent + node.cost}使う・使えるのは${b}）` };
  return { ok: true };
}

/** 取得順のビルドを先頭から canAcquire で確かめる（順序に依存する）。{ ok, reason?, spent } */
export function validate(tree, picked, budget) {
  treeIndex(tree);
  if (!Array.isArray(picked)) return { ok: false, reason: 'スキルは、ノードのIDの配列で選んでください' };
  for (let i = 0; i < picked.length; i++) {
    const check = canAcquire(tree, picked.slice(0, i), picked[i], budget);
    if (!check.ok) return { ok: false, reason: `${i + 1}番目：${check.reason}` };
  }
  return { ok: true, spent: cost(tree, picked) };
}

/** 次に取れるノードのID（データの順＝安定順） */
export function acquirableIds(tree, picked, budget) {
  const ix = treeIndex(tree);
  return ix.order.filter((id) => canAcquire(tree, picked, id, budget).ok);
}

/**
 * 取得済みの「集合」として決まりに合うか（順序は見ない）。解除の確認に使う。
 * 全取得ノードが START から取得済みノードだけを通じて（無向で）つながる・個別必須がそろう・奥義1個まで・ポイント
 */
export function checkSet(tree, ids, budget) {
  const ix = treeIndex(tree);
  const have = new Set(ids);
  if (have.size !== ids.length) return { ok: false, reason: '同じノードを2回選んでいます' };
  for (const id of ids) if (!ix.byId.has(id)) return { ok: false, reason: `「${id}」というスキルはありません` };
  const seen = new Set([ix.startId]);
  const queue = [ix.startId];
  while (queue.length) {
    for (const x of ix.adj.get(queue.shift())) {
      if (have.has(x) && !seen.has(x)) {
        seen.add(x);
        queue.push(x);
      }
    }
  }
  const cut = ids.find((id) => !seen.has(id));
  if (cut) return { ok: false, reason: `${nameOf(ix, cut)}が START とつながらなくなります` };
  for (const id of ids) {
    const miss = ix.byId.get(id).requires.find((r) => !have.has(r));
    if (miss) return { ok: false, reason: `${nameOf(ix, id)}には${nameOf(ix, miss)}が必要です` };
  }
  if (ids.filter((id) => ix.byId.get(id).ultimate).length > 1) return { ok: false, reason: '奥義は1つまでです' };
  const spent = cost(tree, ids);
  const b = budgetOf(tree, budget);
  if (spent > b) return { ok: false, reason: `ポイントが足りません（${spent}使う・使えるのは${b}）` };
  return { ok: true, spent };
}

/**
 * 集合として正しい取得済みを、canAcquire を順に当てはめて取れる並びにする（元の順をできるだけ保つ）。
 * 並べられなければ null
 */
export function orderBuild(tree, ids, budget) {
  const rest = [...ids];
  const out = [];
  while (rest.length) {
    const i = rest.findIndex((id) => canAcquire(tree, out, id, budget).ok);
    if (i === -1) return null;
    out.push(rest.splice(i, 1)[0]);
  }
  return out;
}

/**
 * 解除：id を外したビルド。外したあとも全取得ノードが START とつながり、必須・奥義の制限に合うときだけ。
 * { ok, reason?, picked }（picked は取得順を保ち、必要なら取れる順に並べ直したもの）
 */
export function release(tree, picked, id, budget) {
  const ix = treeIndex(tree);
  if (!Array.isArray(picked) || !picked.includes(id)) return { ok: false, reason: `${nameOf(ix, id)}は取っていません` };
  const rest = picked.filter((x) => x !== id);
  const check = checkSet(tree, rest, budget);
  if (!check.ok) return { ok: false, reason: `外せません：${check.reason}` };
  const ordered = orderBuild(tree, rest, budget);
  if (!ordered) return { ok: false, reason: '外したあとの取得順を作れません' };
  return { ok: true, picked: ordered };
}

// ================= 設定値（ノード内の選択肢） =================

/**
 * 設定値（E04 の反応・X25 の属性）を確かめて、取得済みノードのうち省略したものを初期値で埋める。
 * 取っていないノードの設定は捨てる。{ ok, reason?, config }
 */
export function validateConfig(tree, ids, config = {}) {
  const ix = treeIndex(tree);
  if (config !== null && config !== undefined && !isObj(config)) return { ok: false, reason: '設定は { ノードID: 選択肢のID } にしてください' };
  for (const [id, v] of Object.entries(config ?? {})) {
    const node = ix.byId.get(id);
    if (!node?.config) return { ok: false, reason: `${nameOf(ix, id)}には設定がありません` };
    if (!node.config.options.some((o) => o.id === v)) return { ok: false, reason: `${nameOf(ix, id)}の設定「${v}」は選べません（${node.config.options.map((o) => o.id).join(' / ')}）` };
  }
  const out = {};
  for (const id of ids) {
    const node = ix.byId.get(id);
    if (node?.config) out[id] = config?.[id] ?? node.config.default;
  }
  return { ok: true, config: out };
}

// ================= ビルドの正規化・保存 =================

/** 空のビルド */
export const emptyBuild = () => ({ ids: [], config: {} });

/**
 * ビルドの入力（ID の配列か { ids, config }）を確かめて、{ ids, config } にする（config は取得済みの設定を初期値で埋める）。
 * { ok, reason?, build }
 */
export function normalizeBuild(tree, input, budget) {
  const raw = Array.isArray(input) ? { ids: input, config: {} } : input;
  if (!isObj(raw) || !Array.isArray(raw.ids)) return { ok: false, reason: 'スキルは、ノードのIDの配列か { ids, config } で選んでください' };
  const check = validate(tree, raw.ids, budget);
  if (!check.ok) return { ok: false, reason: check.reason };
  const conf = validateConfig(tree, raw.ids, raw.config ?? {});
  if (!conf.ok) return { ok: false, reason: conf.reason };
  return { ok: true, build: { ids: [...raw.ids], config: conf.config } };
}

/** 保存する形（ツリーの版・取得順のID配列・選択肢・予算）。決まりに合わなければ例外 */
export function serializeBuild(tree, build, budget) {
  const b = budgetOf(tree, budget);
  const n = normalizeBuild(tree, build, b);
  if (!n.ok) throw new Error(`保存できません：${n.reason}`);
  return { version: SKILLTREE_VERSION, ids: n.build.ids, config: n.build.config, budget: b };
}

/**
 * 保存データを読む。version 3 は確かめて返す（予算は保存したもの）。version が3より前・版なし（旧24ノード版）は
 * 新しいIDに対応できないので振り直し（空のビルド＋理由）。{ ok, build, budget, migrated?, reason? }
 */
export function deserializeBuild(tree, saved) {
  treeIndex(tree);
  if (!isObj(saved) && !Array.isArray(saved)) return { ok: false, build: emptyBuild(), budget: tree.budget, reason: '保存データの形が違います' };
  if (Array.isArray(saved) || saved.version === undefined || saved.version < SKILLTREE_VERSION) return migrateBuild(tree, saved);
  if (saved.version !== SKILLTREE_VERSION) return { ok: false, build: emptyBuild(), budget: tree.budget, reason: `知らない版です（${saved.version}）` };
  const budget = posInt(saved.budget) ? saved.budget : tree.budget;
  const n = normalizeBuild(tree, { ids: saved.ids, config: saved.config ?? {} }, budget);
  if (!n.ok) return { ok: false, build: emptyBuild(), budget, reason: n.reason };
  return { ok: true, build: n.build, budget };
}

/** 旧版（version 3 より前・24ノード版）の保存データ：新IDに対応づけられないので、空のビルドに振り直す */
export function migrateBuild(tree, saved) {
  return {
    ok: true,
    migrated: true,
    build: emptyBuild(),
    budget: tree.budget,
    reason: `スキルツリーが新しくなりました（旧版 ${Array.isArray(saved) ? '版なし' : saved?.version ?? '版なし'} の選択は新しいノードに対応しないので、振り直してください）`,
  };
}

// ================= 効果（試合の始めの数値だけ） =================

/** ノードの効果ハンドラが今のコードで効くか（STATIC_HANDLERS にあるか）。ほかは「新ハンドラ未実装」 */
export const isHandlerImplemented = (node) => Object.hasOwn(STATIC_HANDLERS, node.handler);

/**
 * ビルドの効果を合計する（数値は足し算、flag はどれかが true なら true）。STATIC_HANDLERS のあるノードだけ。
 * build は正規化済みの { ids, config }（ID の配列も読める。設定は初期値）
 */
export function skillMods(tree, build) {
  const ix = treeIndex(tree);
  const ids = Array.isArray(build) ? build : build.ids;
  const config = Array.isArray(build) ? {} : build.config ?? {};
  const mods = Object.fromEntries(Object.entries(SKILL_EFFECTS).map(([k, kind]) => [k, kind === 'flag' ? false : 0]));
  for (const id of ids) {
    const node = ix.byId.get(id);
    const h = STATIC_HANDLERS[node.handler];
    if (!h) continue;
    for (const [k, v] of Object.entries(h(node.params, config[id] ?? node.config?.default, node))) {
      if (SKILL_EFFECTS[k] === 'flag') mods[k] = mods[k] || v;
      else mods[k] += v;
    }
  }
  return mods;
}

/** QA の adapter 用：ツリーを閉じこめた関数の組（nodes / canAcquire / validate / cost / acquirableIds / release） */
export function skillTreeApi(tree) {
  treeIndex(tree);
  return {
    nodes: () => nodes(tree),
    canAcquire: (picked, id, budget) => canAcquire(tree, picked, id, budget),
    validate: (picked, budget) => validate(tree, picked, budget),
    cost: (picked) => cost(tree, picked),
    acquirableIds: (picked, budget) => acquirableIds(tree, picked, budget),
    release: (picked, id, budget) => release(tree, picked, id, budget),
  };
}
