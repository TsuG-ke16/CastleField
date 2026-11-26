// 魔力(P)・手札(H)・時間(T)・模倣(I)と、横断 X04/X05/X18/X22/X24/X44/X47 のハンドラが共有する小さな補助（段階C・skillC2）。
// 定義だけ。状態は持たない（状態は Runtime の PlayerSkillState.vars / pub / peek に置く）。

/** 単体攻撃魔法（敵兵士1体に当たる）。chainBlast は周囲にも当たるので含めない */
export const SINGLE_ATTACK_EFFECTS = ['singleDamage', 'randomElementDamage'];
/** 攻撃魔法（ダメージを与える魔法。サイコロ・精霊は含めない） */
export const ATTACK_EFFECTS = [
  'damageEnemyCastle', 'damageEnemySoldiers', 'singleDamage', 'randomElementDamage', 'chainBlast', 'ignitionBurst', 'armorBlast', 'purifyFlare',
  'drainCastle', 'sacrificeAttack', 'damageAllSoldiers', 'breathAttack', 'damageEnemyAll', 'damageCastleAndHeal',
];
/** 回復魔法（手札から使う回復） */
export const HEAL_EFFECTS = ['healOwnCastle', 'healSoldier', 'healCastleAndSoldiers', 'healAndArmor'];
/** 模倣系のノードが作る一時コピーの skillId（I04・X22・X47 の「模倣由来カード」） */
export const IMITATION_SKILLS = ['I02', 'I03'];

export const isSingleAttackSpell = (def) => def?.kind === 'spell' && SINGLE_ATTACK_EFFECTS.includes(def.effect);
export const isAttackSpell = (def) => def?.kind === 'spell' && ATTACK_EFFECTS.includes(def.effect);
export const isHealSpell = (def) => def?.kind === 'spell' && HEAL_EFFECTS.includes(def.effect);
export const isImitationCard = (card) => Boolean(card?.skillCopy && IMITATION_SKILLS.includes(card.skillCopy.skillId));

/** spellHit に渡す「元のカードの代わり」（予約・再発動・追加で、カードの実体がもう手札にないとき） */
export function pseudoCard(game, type, cardId = null) {
  return { cardId: cardId ?? `pseudo:${type}`, type, def: game.cardDefs[type] ?? {}, isSpell: true, isSoldier: false };
}

/** 本人だけが見られる確認情報（Runtime の stateFor が本人にだけ返す peek）を skillId ごとに置く */
export function setPeek(st, key, value) {
  st.peek = { ...(st.peek ?? {}), [key]: value };
}

/** 敵（別の陣営）の見える兵士。安定順（道 → 位置 → ID） */
export function enemySoldiers(game, playerId) {
  const out = [];
  for (const foe of game.opponentsOf(playerId)) {
    for (const s of foe.visibleSoldiers) out.push({ owner: foe, soldier: s });
  }
  return out.sort((a, b) => String(a.soldier.roadId).localeCompare(String(b.soldier.roadId)) || a.soldier.position - b.soldier.position || a.soldier.soldierId.localeCompare(b.soldier.soldierId));
}
