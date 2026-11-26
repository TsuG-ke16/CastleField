// 系統 F（兵器・罠）のスキル効果。
// クラシックには罠も固定兵器もない（武器は兵士に付ける装備カード）。新設せず、既存の「武器カード／武器を装備した兵士（weaponEquipped）」に対応づける：
//   固定兵器 ＝ 武器を装備した味方兵士　／　固定兵器の通常攻撃 ＝ その兵士の通常攻撃　／　兵器の配置 ＝ 手札から武器カードを兵士に装備すること
// 罠を必要とする F02・F05・F06・F08 は既存仕様に罠がないので休眠（docs/skilltree-200-notes/skillC3.md）。

import * as T from '../Tactics.js';

const mine = (api, soldierId) => api.player.soldiers.find((s) => s.soldierId === soldierId) ?? null;

export default {
  // 再装填：武器を装備した兵士の通常攻撃のあと20%で、同じ対象に威力50%の追加攻撃（各自ターン1回）
  F01: {
    on: {
      onAttackResolve(api, ev) {
        if (ev.ownerId !== api.playerId || ev.killed || ev.origin !== 'normalAttack' || ev.isExtra || !ev.enemy || !ev.attackerSoldierId) return;
        if (!api.canUse()) return;
        const soldier = mine(api, ev.attackerSoldierId);
        if (!soldier?.weapon) return;
        const target = T.attackTargets(api.game, api.player, soldier).find((c) => c.soldier.soldierId === ev.targetId);
        if (!target) return; // 同じ対象がもう射程内にいない
        if (!api.roll(api.params.chance ?? 0.2)) return;
        if (!api.spawnExtra('extraAttack').ok || !api.trigger({ targetId: ev.targetId })) return;
        T.strike(api, soldier, target, { ratio: api.params.powerRatio ?? 0.5 });
        api.consume();
      },
    },
  },

  // 防衛工事：手札から武器を装備した（配置した）兵士にシールド2（武器の持ち主は既存のHPを持つ）。各自ターン1回
  F03: {
    on: {
      onWeaponEquip(api, ev) {
        if (ev.ownerId !== api.playerId || ev.origin !== 'hand' || !api.canUse()) return;
        const soldier = mine(api, ev.targetId);
        if (!soldier || !api.trigger({ targetId: ev.targetId })) return;
        api.addShield(api.playerId, soldier, api.params.shield ?? 2);
        api.consume();
      },
    },
  },

  // 狙撃照準：武器を装備した弓兵・魔法使いの射撃が射程の最大距離で命中した場合、直接基礎ダメージ+2
  F04: {
    mods: {
      hitBaseAdd(api, ctx) {
        const s = ctx.attacker;
        if (ctx.kind !== 'shot' || ctx.origin !== 'normalAttack' || !s?.weapon || !api.player.soldiers.includes(s)) return 0;
        const entry = api.game.foesOf(s, api.player).find((c) => c.soldier === ctx.victim);
        if (!entry || entry.q - s.position !== T.attackRange(api.game, s)) return 0;
        api.trigger({ targetId: ctx.victim.soldierId });
        return api.params.damage ?? 2;
      },
    },
  },

  // 工兵の知恵：手札から自ターン最初の武器（兵器）を出すときのMPコスト-1（最低1）
  F07: {
    mods: {
      mpCost(api, ctx) {
        if (ctx.card?.def?.kind !== 'weapon' || !api.canUse('first')) return;
        const min = api.params.mpMin ?? 1;
        if (ctx.cost > min) ctx.cost = Math.max(min, ctx.cost - (api.params.mpReduce ?? 1));
      },
    },
    on: {
      onCardPlayed(api, ev) {
        if (ev.ownerId !== api.playerId || ev.kind !== 'weapon' || !api.canUse('first')) return;
        api.consume('first'); // 自ターン最初の武器
        if (ev.baseCost !== null && ev.mpPaid !== null && ev.mpPaid < ev.baseCost) api.trigger({ cardId: ev.sourceCardId });
      },
    },
  },
};
