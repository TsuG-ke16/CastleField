// 段階C（担当4：防御・回復・墓地・状態異常・召喚・横断の一部）の共通補助。ハンドラ（handlers/{D,R,G,S,V,X_c4}.js）だけが使う。
// Game の内部を直接書き換えるのは、既存の付与（毒の霧・溶岩）と同じ形で状態を置く箇所だけ（付与元は statusApplied の文脈から Runtime が記録する）。

/** 回復魔法の effect（クラシックの実カードは healOwnCastle だけ。兵士を回復する effect は将来のカード・他データ用） */
export const HEAL_EFFECTS = new Set(['healOwnCastle', 'healSoldier', 'healCastleAndSoldiers']);

export const isEnemySide = (game, a, b) => game.side(a) !== game.side(b);

/** 今の「手札からの回復魔法」の解決中か（onHeal など。追加発動・予約・スキル由来は除く） */
export function isHandHeal(api, ev) {
  if (ev.origin !== 'hand' || ev.isExtra) return false;
  if (api.rt.root?.origin !== 'hand') return false;
  return HEAL_EFFECTS.has(api.rt.handCard?.def?.effect);
}

/** 兵士に今ある有害状態の付与元 [{ status, sourceId }]（毒・やけど・出血・凍結・呪い・砂・凍傷。付与元が分からないものは sourceId null） */
export function harmfulStatuses(rt, soldier) {
  const src = rt.statusSource.get(soldier.soldierId) ?? {};
  const out = [];
  if (soldier.poison) out.push({ status: 'poison', sourceId: src.poison ?? null });
  if (soldier.burn) out.push({ status: 'burn', sourceId: src.burn ?? null });
  if (soldier.skillBleed) out.push({ status: 'bleed', sourceId: soldier.skillBleed.sourceId ?? src.bleed ?? null });
  if (soldier.frozen > 0) out.push({ status: 'frozen', sourceId: src.frozen ?? null });
  if (soldier.weakened) out.push({ status: 'weakened', sourceId: src.weakened ?? null });
  if (soldier.sand) out.push({ status: 'sand', sourceId: src.sand ?? null });
  if (soldier.frostbite) out.push({ status: 'frostbite', sourceId: src.frostbite ?? null });
  return out;
}

/** playerId が付与した有害状態（種類のリスト） */
export const ownHarm = (rt, soldier, playerId) => harmfulStatuses(rt, soldier).filter((x) => x.sourceId === playerId);

/** 敵兵士に毒を付ける（同種は量・期限の大きい方。ward 中は付かない）。付けたら true。api.as の中で呼ぶ */
export function applyPoison(api, owner, soldier, { amount = 1, turns = 2 } = {}) {
  const game = api.game;
  if (!owner.soldiers.includes(soldier) || game.wardsStatus(soldier)) return false;
  const cur = soldier.poison;
  const t = cur && cur.turns === null ? null : Math.max(turns, cur?.turns ?? 0);
  soldier.poison = { amount: game.capPoison(Math.max(amount, cur?.amount ?? 0)), turns: t };
  game.emit('statusApplied', { playerId: owner.id, soldierId: soldier.soldierId, status: 'poison', turns: t, amount: soldier.poison.amount });
  return true;
}

/** 敵兵士にやけどを付ける（毒と同じ規則） */
export function applyBurn(api, owner, soldier, { amount = 1, turns = 1 } = {}) {
  const game = api.game;
  if (!owner.soldiers.includes(soldier) || game.wardsStatus(soldier)) return false;
  const cur = soldier.burn;
  soldier.burn = { amount: Math.max(amount, cur?.amount ?? 0), turns: Math.max(turns, cur?.turns ?? 0) };
  game.emit('statusApplied', { playerId: owner.id, soldierId: soldier.soldierId, status: 'burn', turns: soldier.burn.turns, amount: soldier.burn.amount });
  return true;
}

/** 解除できる有害状態を1つ解除（毒 → やけど → 出血 → 呪い → 砂 → 凍傷の順）。解除した状態名か null */
export function cleanseOne(api, owner, soldier) {
  const game = api.game;
  for (const status of ['poison', 'burn', 'weakened', 'sand', 'frostbite']) {
    if (!soldier[status]) continue;
    soldier[status] = null;
    game.emit('statusCleared', { playerId: owner.id, soldierId: soldier.soldierId, status });
    return status;
  }
  if (soldier.skillBleed) {
    soldier.skillBleed = null;
    game.emit('statusCleared', { playerId: owner.id, soldierId: soldier.soldierId, status: 'bleed' });
    return 'bleed';
  }
  return null;
}

/** 城の毒を解除 */
export function cleanseCastle(api, owner) {
  if (!owner.castle.poison) return null;
  owner.castle.poison = null;
  owner.castle.poisonTurns = null;
  api.game.emit('castleCured', { playerId: owner.id });
  return 'poison';
}

/** 味方の兵士のうち、安定順（レーン → 位置 → ID）の一覧 */
export function mySoldiers(api) {
  return [...api.player.soldiers].sort((a, b) => a.roadId.localeCompare(b.roadId) || a.position - b.position || a.soldierId.localeCompare(b.soldierId));
}

/** 敵（別の陣営）の見える兵士 */
export function enemySoldiers(api) {
  const out = [];
  for (const foe of api.game.opponentsOf(api.playerId)) for (const s of foe.visibleSoldiers) out.push({ owner: foe, soldier: s });
  return out.sort((a, b) => a.soldier.roadId.localeCompare(b.soldier.roadId) || a.soldier.position - b.soldier.position || a.soldier.soldierId.localeCompare(b.soldier.soldierId));
}
