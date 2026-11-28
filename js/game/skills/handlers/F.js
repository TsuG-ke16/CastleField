// 系統 F（兵器・罠）のスキル効果。
// 固定兵器：クラシックに固定兵器はないので、既存の「武器カード／武器を装備した兵士（weaponEquipped）」に対応づける：
//   固定兵器 ＝ 武器を装備した味方兵士　／　固定兵器の通常攻撃 ＝ その兵士の通常攻撃　／　兵器の配置 ＝ 手札から武器カードを兵士に装備すること
// 罠：js/game/Traps.js（クラシックの罠のカード kind: "trap" と、スキルが作る罠）。スキルイベント onTrap（phase "set" / "triggered" / "removed"）

import * as T from '../Tactics.js';

const mine = (api, soldierId) => api.player.soldiers.find((s) => s.soldierId === soldierId) ?? null;

/** 手札から置いた罠が、発動して・期限で消えた（自分の罠） */
const handTrapGone = (api, ev) => ev.phase === 'removed' && ev.ownerId === api.playerId && ev.fromHand && (ev.reason === 'triggered' || ev.reason === 'expired');

/** 罠の victim（発動した相手の兵士）。まだ場にいて、罠の対象になれる（見える相手の兵士）ときだけ { owner, soldier } */
function trapVictim(api, ev) {
  const found = ev.targetId ? api.findSoldier(ev.targetId) : null;
  if (!found || !api.game.trapCanHit(api.player, found.owner, found.soldier)) return null;
  return found;
}

/** F08：trap の隣の自分の罠（同じ道の前後のマスか、となりのレーンの同じマス）。近い順（同じ道 → となりのレーン） */
function adjacentTraps(game, player, roadId, square) {
  const road = game.findRoad(roadId);
  const sameRoad = player.traps.filter((t) => t.roadId === roadId && Math.abs(t.square - square) === 1);
  const sideLanes = road
    ? player.traps.filter((t) => {
      if (t.square !== square || t.roadId === roadId) return false;
      const r = game.findRoad(t.roadId);
      return r && r.players[0] === road.players[0] && r.players[1] === road.players[1] && Math.abs(r.lane - road.lane) === 1;
    })
    : [];
  return [...sameRoad, ...sideLanes];
}

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

  // 再設置：手札から置いた罠が発動・消滅したあと20%で、同じマスに同じ罠を作り直す（各自ターン1回。作り直した罠は再設置しない）
  F02: {
    on: {
      onTrap(api, ev) {
        if (!handTrapGone(api, ev) || ev.noRegen || !api.canUse()) return;
        const def = api.game.cardDefs[ev.trapType];
        if (!def || def.kind !== 'trap') return;
        if (!api.game.trapSlots(api.player).some((s) => s.roadId === ev.roadId && s.square === ev.square)) return;
        if (!api.roll(api.params.chance ?? 0.2)) return;
        if (!api.trigger({ trapId: ev.trapId })) return;
        api.as('skillActive', () => api.game.placeTrap(api.player, ev.trapType, def, ev.roadId, ev.square, { generated: true, noRegen: true, source: 'F02' }));
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

  // 連動装置：自分の罠が相手に発動したあと、その敵が射程に入っている固定兵器（武器を装備した味方兵士）1体が、威力50%で追加攻撃（各自ターン1回）
  F05: {
    on: {
      onTrap(api, ev) {
        if (ev.phase !== 'triggered' || ev.ownerId !== api.playerId || !api.canUse()) return;
        const victim = trapVictim(api, ev);
        if (!victim) return;
        for (const s of api.player.soldiers) {
          if (!s.weapon) continue;
          const target = T.attackTargets(api.game, api.player, s).find((c) => c.soldier === victim.soldier);
          if (!target) continue;
          if (!api.spawnExtra('extraAttack').ok || !api.trigger({ targetId: victim.soldier.soldierId, soldierId: s.soldierId })) return;
          T.strike(api, s, target, { ratio: api.params.powerRatio ?? 0.5 });
          api.consume();
          return;
        }
      },
    },
  },

  // 罠の回収：手札から置いた罠が消える（発動・期限）と MP+1（各自ターン1回）
  F06: {
    on: {
      onTrap(api, ev) {
        if (!handTrapGone(api, ev) || ev.generated || !api.canUse()) return;
        if (!api.trigger({ trapId: ev.trapId })) return;
        api.mp(api.params.mp ?? 1);
        api.consume();
      },
    },
  },

  // 工兵の知恵：手札から自ターン最初の武器（兵器）か罠を出すときのMPコスト-1（最低1）
  F07: {
    mods: {
      mpCost(api, ctx) {
        if (!['weapon', 'trap'].includes(ctx.card?.def?.kind) || !api.canUse('first')) return;
        const min = api.params.mpMin ?? 1;
        if (ctx.cost > min) ctx.cost = Math.max(min, ctx.cost - (api.params.mpReduce ?? 1));
      },
    },
    on: {
      onCardPlayed(api, ev) {
        if (ev.ownerId !== api.playerId || !['weapon', 'trap'].includes(ev.kind) || !api.canUse('first')) return;
        api.consume('first'); // 自ターン最初の武器か罠
        if (ev.baseCost !== null && ev.mpPaid !== null && ev.mpPaid < ev.baseCost) api.trigger({ cardId: ev.sourceCardId });
      },
    },
  },

  // 奥義：連鎖起爆：自分の罠が発動すると、隣の自分の罠（同じ道の前後のマスか、となりのレーンの同じマス）1つを、同じ敵に発動させる
  // （各自ターン1回。つられて発動した罠からは連鎖しない。元の敵がもういない・見えないときは起きない）
  F08: {
    on: {
      onTrap(api, ev) {
        if (ev.phase !== 'triggered' || ev.ownerId !== api.playerId || ev.chained || !api.canUse()) return;
        const victim = trapVictim(api, ev);
        if (!victim) return;
        const next = adjacentTraps(api.game, api.player, ev.roadId, ev.square)[0];
        if (!next) return;
        if (!api.spawnExtra('chain').ok || !api.trigger({ trapId: next.trapId, targetId: victim.soldier.soldierId })) return;
        api.as('chain', () => api.game.triggerTrap(api.player, next, victim.owner, victim.soldier, { chained: true }));
        api.consume();
      },
    },
  },
};
