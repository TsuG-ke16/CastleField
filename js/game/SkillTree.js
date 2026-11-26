// スキルツリー（クラシック。CLAUDE.md「クラシックのスキルツリー」・docs/classic-skilltree.md）。
// 試合の前に、決まったポイント（両者同じ）でノードを選ぶ「ビルド」。試合中には育たない。
// ここには DOM も Game も出てこない：データ（data/classic/skilltree.json）のチェックと、ビルドの確認と、効果の合計だけ。
// Game は skillMods() の結果（プレイヤーごとの補正）だけを見る。モードごとにデータを差し替えれば、ほかのモード（4陣営など）にも使える。

/**
 * ノードの効果に書けるキーと、その「よい向き」。
 *   up：大きいほど得（数値）／flag：true だと得（真偽）
 * Game はこの表のキーだけを読む。新しいキーを足すときは Game の効く場所も足し、ここに書く。
 */
export const SKILL_EFFECTS = {
  castleHp: 'up', // 城HPの上限と最初の城HP（城の種類の hpBonus に足す）
  armor: 'up', // 最初から持っている城壁（後攻の城壁に足す。armorMax まで）
  initialMp: 'up', // 最初の MP（rules.initialMp に足す。0〜最大MP）
  maxMp: 'up', // MP の上限（rules.maxMp に足す。最低1。maxMp が0のルールでは効かない）
  mpPerTurn: 'up', // 自分のターンの始めの MP の回復（rules.mpPerTurn に足す。0より少なくはならない）
  initialHand: 'up', // 最初の手札の枚数（rules.initialHand に足す。0より少なくはならない）
  maxHand: 'up', // 手札の上限（城の種類の maxHandBonus に足す）
  soldierAttack: 'up', // 出した兵士の攻撃（城の種類の soldierAttackBonus に足す。兵舎と同じ）
  castleSpell: 'up', // 城への魔法が城に当たったときのダメージ（城の種類の castleSpellBonus に足す。魔法の塔と同じ）
  reactionDamage: 'up', // 自分の攻撃で起きた属性の反応の追加ダメージ（reactions を渡したゲームだけ）
  randomAttach: 'flag', // ターン開始時のランダム付着（rules.randomAttachTurnStart をこのプレイヤーだけに効かせる）
  randomAttachTurns: 'up', // ランダム付着の残る回数に足す
  coinPerTurn: 'up', // 自分のターンの始めにもらうコイン（rules.coinPerTurn に足す。0より少なくはならない）
  // ---- ノードを増やしたときに足したキー（どれも今ある処理に足すだけ）----
  spellDamage: 'up', // 兵士へのダメージの魔法（damageEnemySoldiers・singleDamage・randomElementDamage）のダメージ
  healBonus: 'up', // 城を回復する魔法（healOwnCastle）の回復量
  castleRegen: 'up', // 自分のターンの始めに、城HPがこれだけ回復する（上限まで。castleHealed の source.kind "skill"）
  armorFloor: 'up', // 自分のターンの始めに、城壁がこれより少なければ、この値まで戻る（castleArmored に skill: true）
  soldiersPerTurn: 'up', // 1ターンに出せる兵士の枚数（rules.soldiersPerTurn に足す）
  archerRange: 'up', // 出した弓兵・魔法使い（射程のある兵士）の射程（rangeBonus に足す）
  soldierHp: 'up', // 出した兵士のHP（コインの強化「鍛錬」と同じ armyHp の最初の値）
  monsterCoins: 'up', // 魔物にとどめを刺したときにもらうコインに足す
  annihilationDamage: 'up', // 自分の攻撃で起きた対消滅（光＋闇）の追加ダメージ
  blackIceDamage: 'up', // 同じく黒氷（闇＋氷）
  shatterDamage: 'up', // 同じく砕氷（氷＋混沌）
  chaosDamage: 'up', // 同じく混沌反応
};
/** 反応ごとのダメージのキー（反応のID → キー）。reactionDamage（どの反応にも）に足す */
export const REACTION_DAMAGE_KEYS = { annihilation: 'annihilationDamage', blackIce: 'blackIceDamage', shatter: 'shatterDamage', chaos: 'chaosDamage' };
/** 属性の反応があるゲーム（reactions を渡したゲーム）でしか意味のない効果 */
export const REACTION_SKILL_EFFECTS = ['reactionDamage', 'randomAttach', 'randomAttachTurns', ...Object.values(REACTION_DAMAGE_KEYS)];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const posInt = (v) => Number.isInteger(v) && v > 0;

/**
 * スキルツリーのデータのチェック。間違っていれば Error を投げる（Setup.js と同じ流儀：どこが・どう直すかを書く）。
 * 形：{ points, branches: { <id>: { name } }, nodes: { <id>: { name, branch, tier, cost, requires?, requiresAny?, effects, description? } }, presets?: { <id>: { name, nodes } } }
 * - requires は全部、requiresAny はどれか1つを先に取る（同じ段に選択肢があるとき）
 * - どのノードにも効果が1つ以上ある。マイナスの値（短所）も書けるが、必須ではない（人間の決定：クラシックは短所なし・ポイントだけで制限する）
 * - requires は同じツリーのノード。輪にならない
 * - presets（おすすめのビルド）は、それ自体が決まりに合う
 */
export function validateSkillTree(tree) {
  const where = 'skilltree.json';
  if (!isObj(tree)) throw new Error(`${where}: { points, branches, nodes } のオブジェクトにしてください`);
  if (!posInt(tree.points)) throw new Error(`${where}: points（使えるポイント）は1以上の整数にしてください`);
  if (!isObj(tree.branches) || Object.keys(tree.branches).length === 0) throw new Error(`${where}: branches（枝）を1つ以上書いてください`);
  for (const [id, b] of Object.entries(tree.branches)) {
    if (!isObj(b) || typeof b.name !== 'string' || b.name === '') throw new Error(`${where}: branches の "${id}" に name（表示名）を書いてください`);
  }
  if (!isObj(tree.nodes) || Object.keys(tree.nodes).length === 0) throw new Error(`${where}: nodes（ノード）を1つ以上書いてください`);
  for (const [id, n] of Object.entries(tree.nodes)) {
    const w = `${where}: nodes の "${id}"`;
    if (!isObj(n)) throw new Error(`${w} はオブジェクトにしてください`);
    if (typeof n.name !== 'string' || n.name === '') throw new Error(`${w}: name（表示名）を書いてください`);
    if (!Object.hasOwn(tree.branches, n.branch)) throw new Error(`${w}: branch の "${n.branch}" は branches にありません`);
    if (!posInt(n.tier)) throw new Error(`${w}: tier（段）は1以上の整数にしてください`);
    if (!posInt(n.cost)) throw new Error(`${w}: cost（使うポイント）は1以上の整数にしてください`);
    for (const key of ['requires', 'requiresAny']) {
      if (n[key] !== undefined && (!Array.isArray(n[key]) || n[key].length === 0 || n[key].some((r) => !Object.hasOwn(tree.nodes, r) || r === id))) {
        throw new Error(`${w}: ${key}（先に取るノード。requires は全部、requiresAny はどれか1つ）は、ほかのノードのIDの配列にしてください`);
      }
    }
    if (!isObj(n.effects)) throw new Error(`${w}: effects（効果）を { キー: 値 } で書いてください`);
    if (Object.keys(n.effects).length === 0) throw new Error(`${w}: effects（効果）を1つ以上書いてください`);
    for (const [key, v] of Object.entries(n.effects)) {
      const kind = SKILL_EFFECTS[key];
      if (!kind) throw new Error(`${w}: effects の "${key}" は知らない効果です（${Object.keys(SKILL_EFFECTS).join(' / ')}）`);
      if (kind === 'flag') {
        if (v !== true) throw new Error(`${w}: effects.${key} は true だけ書けます`);
      } else if (!Number.isInteger(v) || v === 0) {
        throw new Error(`${w}: effects.${key} は0でない整数にしてください（マイナスも書ける。今のクラシックは強化だけ）`);
      }
    }
  }
  // 上位互換のノードを作らない：効果がほかのノードをすべて含み（同じか大きい）、コストが同じか安いノードはエラー
  const [better] = dominatedPairs(tree);
  if (better) throw new Error(`${where}: "${better[0]}" は "${better[1]}" の上位互換です（効果がすべて同じか大きく、コストが同じか安い）`);
  // requires が輪になっていないか（たどって自分に戻らない）
  const visiting = new Set();
  const done = new Set();
  const walk = (id) => {
    if (done.has(id)) return;
    if (visiting.has(id)) throw new Error(`${where}: nodes の requires が輪になっています（"${id}"）`);
    visiting.add(id);
    for (const r of [...(tree.nodes[id].requires ?? []), ...(tree.nodes[id].requiresAny ?? [])]) walk(r);
    visiting.delete(id);
    done.add(id);
  };
  for (const id of Object.keys(tree.nodes)) walk(id);
  if (tree.presets !== undefined) {
    if (!isObj(tree.presets)) throw new Error(`${where}: presets は { <id>: { name, nodes } } にしてください`);
    for (const [id, p] of Object.entries(tree.presets)) {
      if (!isObj(p) || typeof p.name !== 'string' || p.name === '') throw new Error(`${where}: presets の "${id}" に name を書いてください`);
      if (Object.hasOwn(tree.nodes, id)) throw new Error(`${where}: presets の "${id}" はノードと同じIDです（ちがうIDにしてください）`);
      const check = checkSkillBuild(tree, p.nodes);
      if (!check.ok) throw new Error(`${where}: presets の "${id}" が決まりに合いません：${check.reason}`);
    }
  }
}

/**
 * 上位互換の組 [[よい方, 悪い方], ...]。a の効果がすべて b 以上で（flag は true を1と数える）、
 * どれかが大きいかコストが安く、コストが b 以下なら、a は b の上位互換
 */
export function dominatedPairs(tree) {
  const keys = Object.keys(SKILL_EFFECTS);
  const val = (n, k) => (SKILL_EFFECTS[k] === 'flag' ? (n.effects[k] ? 1 : 0) : n.effects[k] ?? 0);
  const out = [];
  for (const [a, na] of Object.entries(tree.nodes)) {
    for (const [b, nb] of Object.entries(tree.nodes)) {
      if (a === b || na.cost > nb.cost) continue;
      if (!keys.every((k) => val(na, k) >= val(nb, k))) continue;
      if (keys.some((k) => val(na, k) > val(nb, k)) || na.cost < nb.cost) out.push([a, b]);
    }
  }
  return out;
}

/**
 * ビルド（選んだノードのIDの配列）が決まりに合うか。{ ok, reason?, spent }
 * 決まり：知っているノード・重ならない・先に取るノード（requires）も選んでいる・使うポイントの合計が points 以下。
 * 0個（何も取らない）もよい
 */
export function checkSkillBuild(tree, build) {
  if (!Array.isArray(build)) return { ok: false, reason: 'スキルは、ノードのIDの配列で選んでください' };
  const seen = new Set();
  let spent = 0;
  for (const id of build) {
    if (typeof id !== 'string' || !Object.hasOwn(tree.nodes, id)) return { ok: false, reason: `「${id}」というスキルはありません` };
    if (seen.has(id)) return { ok: false, reason: `「${tree.nodes[id].name}」を2回選んでいます` };
    seen.add(id);
    spent += tree.nodes[id].cost;
  }
  for (const id of build) {
    for (const r of tree.nodes[id].requires ?? []) {
      if (!seen.has(r)) return { ok: false, reason: `「${tree.nodes[id].name}」を取るには、先に「${tree.nodes[r].name}」が要ります` };
    }
    const any = tree.nodes[id].requiresAny;
    if (any && !any.some((r) => seen.has(r))) {
      return { ok: false, reason: `「${tree.nodes[id].name}」を取るには、先に${any.map((r) => `「${tree.nodes[r].name}」`).join('か')}が要ります` };
    }
  }
  if (spent > tree.points) return { ok: false, reason: `ポイントが足りません（${spent}使う・使えるのは${tree.points}）` };
  return { ok: true, spent };
}

/**
 * ビルドの効果を合計する（数値は足し算、flag はどれかが true なら true）。
 * 返す形は SKILL_EFFECTS の全部のキー（数値は0、flag は false が既定）。ビルドはチェック済みのものを渡す
 */
export function skillMods(tree, build) {
  const mods = Object.fromEntries(Object.entries(SKILL_EFFECTS).map(([k, kind]) => [k, kind === 'flag' ? false : 0]));
  for (const id of build) {
    for (const [k, v] of Object.entries(tree.nodes[id].effects)) {
      if (SKILL_EFFECTS[k] === 'flag') mods[k] = mods[k] || v;
      else mods[k] += v;
    }
  }
  return mods;
}

/** そのビルドで、次に取れるノード（まだ取っていない・先のノードがそろっている・ポイントが足りる） */
export function availableSkillNodes(tree, build) {
  const have = new Set(build);
  const left = tree.points - build.reduce((n, id) => n + tree.nodes[id].cost, 0);
  return Object.keys(tree.nodes).filter((id) => !have.has(id)
    && tree.nodes[id].cost <= left
    && (tree.nodes[id].requires ?? []).every((r) => have.has(r))
    && (!tree.nodes[id].requiresAny || tree.nodes[id].requiresAny.some((r) => have.has(r))));
}
