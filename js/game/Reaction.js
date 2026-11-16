// リアクション型防御の決まり（攻撃を受けた側が、その場でカードを使って対応する）。
// 計算だけをここにまとめる：Game（本物の処理）・CPU・画面（効果の見積もり）が同じ計算を使う。
// DOM もファイルも使わない。数値は cards.json の定義から受け取る（コードに数値を書かない）。
//
// 攻撃（attack）の形：
//   { source: "soldier" | "spell", damage, unblockable?, soldier?: { hp, shield } }
//   damage は、防御する前に城へ届くダメージ（兵士は 攻撃力 × soldierCastleDamageMultiplier、魔法は値そのまま）
//
// 防御の決まり：
//   - 1回の攻撃に使えるのは、最大 maxCards 枚（rules.reactionMaxCards）。同じ効果のカードは1枚まで
//   - 防御不能の攻撃（unblockable）には使えない
//   - 計算の順番：迎撃 → 受け流し・カウンターの軽減 → 城へのダメージ → カウンターの反撃
//     迎撃で兵士を倒せたら、攻撃は無効（ダメージも反撃も起きない）
//   - 城が落ちたら、カウンターの反撃は起きない（先に決着する）

/** 防御カードの効果の名前 */
export const REACTION_EFFECTS = ['guard', 'intercept', 'counter'];

/**
 * そのカードを、この攻撃に使えるか
 * @param {object} attack 攻撃（上の形）
 * @param {object} def cards.json のカード定義
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function canReactWith(attack, def) {
  if (!def || def.kind !== 'reaction') return { ok: false, reason: 'このカードは防御には使えません' };
  if (attack.unblockable) return { ok: false, reason: 'この攻撃は防げません' };
  if (def.effect === 'intercept' && attack.source !== 'soldier') {
    return { ok: false, reason: '迎撃は兵士の攻撃にしか使えません（魔法は止められません）' };
  }
  return { ok: true };
}

/**
 * 使うカードの組み合わせが正しいか
 * @param {object} attack
 * @param {object[]} defs 使うカードの定義（使う順）
 * @param {number} maxCards 1回の攻撃に使える最大枚数
 */
export function checkCombo(attack, defs, maxCards) {
  if (defs.length > maxCards) return { ok: false, reason: `防御に使えるカードは1回の攻撃に${maxCards}枚までです` };
  const seen = new Set();
  for (const def of defs) {
    const c = canReactWith(attack, def);
    if (!c.ok) return c;
    if (seen.has(def.effect)) return { ok: false, reason: '同じ効果のカードは、1回の攻撃に1枚までです' };
    seen.add(def.effect);
  }
  return { ok: true };
}

/**
 * 防御の結果を見積もる（読むだけ。Game は同じ計算で本当の処理をする）
 * @param {object} attack
 * @param {object[]} defs 使うカードの定義
 * @returns {{
 *   intercepted: boolean, interceptDamage: number, soldierHpAfter: number|null,
 *   reduced: number, damage: number, counterDamage: number, effects: string[]
 * }}
 *   intercepted：迎撃で兵士を倒せる（攻撃は無効になる）
 *   reduced：受け流し・カウンターで減らす量
 *   damage：城に届くダメージ（城壁の前）
 *   counterDamage：相手の城に返すダメージ
 */
export function previewReaction(attack, defs) {
  const effects = defs.map((d) => d.effect);
  let interceptDamage = 0;
  let soldierHpAfter = attack.soldier ? attack.soldier.hp : null;
  for (const d of defs) if (d.effect === 'intercept') interceptDamage += d.amount;
  if (attack.soldier && interceptDamage > 0) {
    // 盾が先に受ける。盾で止められたぶんはHPに届かない
    const through = Math.max(0, interceptDamage - (attack.soldier.shield ?? 0));
    soldierHpAfter = Math.max(0, attack.soldier.hp - through);
  }
  const intercepted = Boolean(attack.soldier) && interceptDamage > 0 && soldierHpAfter <= 0;
  if (intercepted) {
    return { intercepted, interceptDamage, soldierHpAfter, reduced: attack.damage, damage: 0, counterDamage: 0, effects };
  }
  let reduced = 0;
  let counterDamage = 0;
  for (const d of defs) {
    if (d.effect === 'guard') reduced += d.amount;
    if (d.effect === 'counter') {
      reduced += d.block;
      counterDamage += d.amount;
    }
  }
  reduced = Math.min(reduced, attack.damage);
  return { intercepted, interceptDamage, soldierHpAfter, reduced, damage: attack.damage - reduced, counterDamage, effects };
}

/** 画面や CPU が見る、1枚ごとの「何をするカードか」の短い説明 */
export function describeReaction(def) {
  switch (def.effect) {
    case 'guard': return `この攻撃のダメージを${def.amount}減らす`;
    case 'intercept': return `攻撃してくる兵士に${def.amount}ダメージ。倒せたら攻撃は無効（魔法には使えない）`;
    case 'counter': return `ダメージを${def.block}減らし、相手の城に${def.amount}ダメージ`;
    default: return '';
  }
}
