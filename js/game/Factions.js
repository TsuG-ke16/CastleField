// 四大陣営（PR-A）：陣営のデータ（data/factions.json）のチェックと、陣営モードで使えるカードの決まり。DOM は使わない。
//
// - カードの faction：kingdom / forest / demon / dragon（factions.json のキー）か、全陣営共通の "common"
// - faction を書いていないカード＝旧カード（陣営なし）。陣営モードの候補にはならないが、今までのモード・カスタムデッキ・魔物のごほうびでは今までどおり使える
// - implemented: false のカードは、陣営モードの候補から外す（台帳だけあって効果がまだないカード用。省略すると true）

/** 全陣営共通のカードの印（factions.json には入れない） */
export const COMMON_FACTION = 'common';

/**
 * モードの分離（人間の指示）：通常モードと四大陣営モードは、ルール上も完全に分けて管理する。
 *   - cards.json の定義そのものは「通常モード」のもの（既存の合成ルート・名前・属性）。陣営モードで違うところだけ、
 *     カードの factionOverride（FACTION_OVERRIDE_KEYS の項目）に書く。陣営モード（setup.faction）のときだけ Game が重ねる
 *   - ルールの数値の違い（MP上限・付着・反応）は data/faction-rules.json。陣営モードのときだけ rules に重ねる
 *   - 属性の相性（elements.json の倍率）・属性の反応（reactions.json）は、陣営モードのときだけ有効
 *   - factionOnly のカードは、陣営モードの候補でだけ引き当てる。デッキ編成（コスト制）にも入れられない
 */
export const FACTION_OVERRIDE_KEYS = ['name', 'fuseTo', 'element'];

/**
 * 陣営モード用のカード定義を作る（cards は変えない）。factionOverride のあるカードに、その項目を重ねる。
 * 値が null のもの（fuseTo: null：合成しない）はそのまま入れる。factionOverride のキー自体は残す（どこが違うか分かるように）
 */
export function applyFactionOverrides(cards) {
  const out = {};
  for (const [type, def] of Object.entries(cards)) {
    out[type] = def.factionOverride ? { ...def, ...def.factionOverride } : def;
  }
  return out;
}

/**
 * 通常モードのカード（factionOnly を除く）。図鑑・遊び方・デッキ編成など、通常モードの画面が一覧にするときに使う。
 * 通常モードの合成の系統は、この中で閉じている（陣営専用のカードへつながらない）
 */
export function normalModeCards(cards) {
  return Object.fromEntries(Object.entries(cards).filter(([, def]) => def.factionOnly !== true));
}

/** factions.json の中身をチェックする（間違いは例外） */
export function validateFactions(factions) {
  if (!factions || typeof factions !== 'object' || Array.isArray(factions)) {
    throw new Error('factions.json は陣営のIDをキーにしたオブジェクトにしてください');
  }
  const ids = Object.keys(factions);
  if (ids.length === 0) throw new Error('factions.json に陣営がありません');
  for (const id of ids) {
    const def = factions[id];
    const where = `factions.json の "${id}"`;
    if (id === COMMON_FACTION) throw new Error(`${where}: "${COMMON_FACTION}" は全陣営共通の印なので、陣営のIDには使えません`);
    if (!def || typeof def !== 'object') throw new Error(`${where}: 定義がオブジェクトではありません`);
    if (typeof def.name !== 'string' || def.name === '') throw new Error(`${where}: name を書いてください`);
    if (def.description !== undefined && typeof def.description !== 'string') throw new Error(`${where}: description は文字列にしてください`);
  }
}

/** カードの faction として書ける値か（factions を渡さなければ、文字列かどうかだけ） */
export function isValidFactionId(value, factions = null) {
  if (typeof value !== 'string' || value === '') return false;
  if (!factions) return true;
  return value === COMMON_FACTION || Object.hasOwn(factions, value);
}

/**
 * 陣営モード（factionId を選んだとき）の候補に入るカードか。
 * 入るのは「その陣営のカード」と「全陣営共通（common）」だけ。ただし次は入れない：
 * weight が 0（排出されない）／魔物のカード（monster。ごほうび専用）／implemented: false（まだ効果がない）。
 * faction のないカード（旧カード・特殊サイコロ・解毒薬・天候の呪文など）は入らない。
 */
export function isLegalForFaction(def, factionId) {
  if (!def || def.implemented === false) return false;
  if (def.monster !== undefined) return false;
  if ((def.weight ?? 1) <= 0) return false;
  return def.faction === factionId || def.faction === COMMON_FACTION;
}

/** 陣営モードの候補（カード種類の Set） */
export function factionPool(cards, factionId) {
  return new Set(Object.entries(cards).filter(([, def]) => isLegalForFaction(def, factionId)).map(([type]) => type));
}
