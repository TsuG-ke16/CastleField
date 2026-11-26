// スキル効果ハンドラの登録表（ノードID → 定義）。系統ごとに1ファイル（handlers/<系統英字>.js。横断ノードは X.js）。
// 段階C は自分の系統のファイルだけを書けばよい（このファイルと Game.js は触らない）。
// 登録のないノードは休眠（取得はできるが戦闘で何も起きない。counters は null）。
//
// 定義の形：
//   {
//     on?: { <SKILL_EVENTS の名前>: fn(api, ev) | { stage: 'state'|'lethal'|'death'|'resource'|'extra', fn } },
//     stage?: 既定の段階（書かなければ 'extra'）,
//     mods?: { <mods 名>: fn(api, ctx) | { order: number, fn } },
//     actions?: { <actionId>: { label?, scope?: 'turn'|'match', limit?, key?, list?(api), check?(api, args), run(api, args, plan) } },
//     scheduled?(api, item),
//   }
// mods 名：hitEvade, hitBaseAdd, hitBasePct, hitReduce, critChance, critMultiplier, castlePierce, castleReduce, castleLethal,
//   reactionDamage, dotAmount, dotHold, healAmount, healOverflow, mpOverflow, mpCost, mpToHp, hpPayWaive, hpPayDefer,
//   luckFinalFail, beforeNormalDraw, turnEnd（呼ばれる場所と ctx の中身は docs/skilltree-200-progress.md の段階B）

import C from './C.js';
import M from './M.js';
import E from './E.js';
import L from './L.js';
import P from './P.js';
import H from './H.js';
import U from './U.js';
import G from './G.js';
import R from './R.js';
import D from './D.js';
import A from './A.js';
import T from './T.js';
import S from './S.js';
import K from './K.js';
import F from './F.js';
import Q from './Q.js';
import V from './V.js';
import I from './I.js';
import B from './B.js';
import X from './X.js';
import X_c1 from './X_c1.js'; // 横断（C1：X01・X02・X03・X12・X13・X14・X15・X16・X19）
import X_c2 from './X_c2.js'; // 横断（C2：X04・X05・X18・X22・X24・X44・X47）
import X_c3 from './X_c3.js'; // 横断（C3：X10・X25・X39〜X43）
import X_c4 from './X_c4.js'; // 横断（C4：X07 X08 X09 X20 X21 X36 X37 X38 X45 X46）
import X_c5 from './X_c5.js'; // 横断（C5：X26〜X35）

const GROUPS = { C, M, E, L, P, H, U, G, R, D, A, T, S, K, F, Q, V, I, B, X, X_c1, X_c2, X_c3, X_c4, X_c5 };

/** @type {Record<string, object>} */
export const HANDLERS = {};
for (const [group, defs] of Object.entries(GROUPS)) {
  const letter = group[0]; // X_c1 などの分割ファイルは先頭の英字の系統
  for (const [id, def] of Object.entries(defs ?? {})) {
    if (!id.startsWith(letter)) throw new Error(`handlers/${group}.js に別の系統のノード ${id} があります`);
    if (Object.hasOwn(HANDLERS, id)) throw new Error(`ノード ${id} のハンドラが2つあります`);
    HANDLERS[id] = def;
  }
}

/**
 * 基盤（Luck.js・Crit.js）が直接実装しているノード（ハンドラの登録はいらない。counters は数える）。
 * L01/L02/L03/L08：幸運のパイプライン。C01/C02/C03/C05：会心の解放・蓄積・倍率・処刑。X11：豪運。X17：持続ダメージの会心。X48：SP20以上の会心率
 */
export const CORE_IMPLEMENTED = new Set(['L01', 'L02', 'L03', 'L08', 'C01', 'C02', 'C03', 'C05', 'X11', 'X17', 'X48']);

/** 試合開始時の数値（SkillTree.js の STATIC_HANDLERS → skillMods → Game の既存処理）で効いているノード（counters は null） */
export const STATIC_IMPLEMENTED = new Set(['P01', 'P07', 'D01', 'D05', 'U01', 'U04', 'R01', 'E01', 'E04', 'E06']);
