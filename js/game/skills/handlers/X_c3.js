// 横断ノード（担当C3）：X10・X25・X39・X40・X41・X43。handlers/index.js が X 系統に合流させる。
// X06（戦士の遺産）は休眠：クラシックの兵士に「固有能力」がなく、「安全リスト」の定義も仕様書にない（docs/skilltree-200-notes/skillC3.md）。
// X42（伏兵配置）は休眠：罠が既存仕様にない。
// X25・X43 の「固定兵器」は、F系統と同じく「武器を装備した味方兵士」に対応づける。

import * as T from '../Tactics.js';

const mine = (api, soldierId) => api.player.soldiers.find((s) => s.soldierId === soldierId) ?? null;

export default {
  // 破壊衝動：城への直接攻撃にも会心を解放（率・倍率は params。基盤の Crit.js が処理）。ここでは城への会心時30%で城壁を貫通する部分だけ
  X10: {
    mods: {
      castlePierce(api, ctx) {
        if (!ctx.crit || !api.roll(api.params.pierceChance ?? 0.3)) return;
        ctx.pierce = Math.max(ctx.pierce ?? 0, ctx.amount);
        api.trigger({ pierce: ctx.amount });
      },
    },
  },

  // 元素砲：武器を装備した兵士の直接の通常攻撃に、ビルド時に選んだ属性の付着を追加（既存の付着・反応の規則に従う）
  X25: {
    on: {
      onAttackResolve(api, ev) {
        if (ev.ownerId !== api.playerId || ev.killed || ev.origin !== 'normalAttack' || ev.isExtra || !ev.enemy || !ev.attackerSoldierId) return;
        const element = api.config;
        if (!api.game.reactionDefs || !api.game.elementDefs?.elements?.[element]) return; // 付着のないゲーム・存在しない属性は不発
        if (!mine(api, ev.attackerSoldierId)?.weapon) return;
        const found = api.findSoldier(ev.targetId);
        if (!found || !api.trigger({ targetId: ev.targetId, element })) return;
        api.as('chain', () => api.game.elementHit(found.owner, found.soldier, element, { damage: ev.amount, by: api.player }));
        api.game.checkGameOver();
      },
    },
  },

  // 突破戦術：通常攻撃で敵兵士を倒した際の余剰直接ダメージ（最大3）を敵城へ送る（各自ターン1回）。余剰は「攻撃前のHP＋盾」を超えた分
  X39: {
    mods: {
      hitBaseAdd(api, ctx) {
        if ((ctx.kind !== 'fight' && ctx.kind !== 'shot') || ctx.origin !== 'normalAttack' || !ctx.enemy || !ctx.victim) return 0;
        const snap = (api.state.vars.x39 ??= {});
        const ids = Object.keys(snap);
        if (ids.length > 24) delete snap[ids[0]];
        snap[ctx.victim.soldierId] = ctx.victim.hp + ctx.victim.shield;
        return 0;
      },
    },
    on: {
      onAttackResolve(api, ev) {
        const snap = api.state.vars.x39;
        if (ev.ownerId !== api.playerId || ev.origin !== 'normalAttack' || ev.isExtra || !ev.enemy || !snap || !(ev.targetId in snap)) return;
        const before = snap[ev.targetId];
        delete snap[ev.targetId];
        if (!ev.killed || !api.canUse()) return;
        const overflow = Math.min(api.params.overflowMax ?? 3, ev.amount - before);
        if (overflow <= 0 || !api.spawnExtra('chain').ok || !api.trigger({ overflow })) return;
        if (T.fixedCastleDamage(api, ev.victimOwnerId, overflow)) api.consume();
      },
    },
  },

  // 盾の陣形：横隊（同じ進軍位置の全レーンに味方兵士）が成立したとき、該当兵士にシールド1（成立は各自ターン1回）
  X40: {
    on: {
      onSummon: formationShield,
      onUnitMoved: formationShield,
    },
  },

  // 機動射撃：手札由来の兵士がレーン変更した後、射程内の敵1体へ威力50%の追加通常攻撃（各自ターン1回）
  X41: {
    on: {
      onUnitMoved(api, ev) {
        if (ev.ownerId !== api.playerId || ev.kind !== 'lane' || !api.canUse()) return;
        const soldier = mine(api, ev.targetId);
        if (!soldier?.skillCardId) return; // 手札由来の兵士だけ
        const target = T.attackTargets(api.game, api.player, soldier)[0];
        if (!target) return;
        if (!api.spawnExtra('extraAttack').ok || !api.trigger({ targetId: target.soldier.soldierId })) return;
        T.strike(api, soldier, target, { ratio: api.params.powerRatio ?? 0.5 });
        api.consume();
      },
    },
  },

  // 魔力装填：メイン行動中、MP2で武器を装備した味方兵士1体に、次の通常攻撃+3を付与（各自ターン1回）
  X43: {
    mods: {
      hitBaseAdd(api, ctx) {
        const marks = api.state.vars.x43;
        const s = ctx.attacker;
        if (!marks || !s || (ctx.kind !== 'fight' && ctx.kind !== 'shot') || ctx.origin !== 'normalAttack' || !marks[s.soldierId]) return 0;
        const v = marks[s.soldierId];
        delete marks[s.soldierId];
        api.trigger({ targetId: s.soldierId });
        return v;
      },
    },
    actions: {
      X43: {
        label: '魔力装填（武器の兵士の次の通常攻撃+3）',
        list(api) {
          return api.player.soldiers
            .filter((s) => s.weapon && !api.state.vars.x43?.[s.soldierId])
            .sort((a, b) => T.soldierNumber(a) - T.soldierNumber(b))
            .map((s) => ({ args: { soldierId: s.soldierId }, label: `${s.soldierId}（${s.weapon}）` }));
        },
        check(api, args) {
          const s = mine(api, args?.soldierId);
          if (!s?.weapon) return { ok: false, reason: '武器を装備した味方の兵士を選んでください' };
          if (api.state.vars.x43?.[s.soldierId]) return { ok: false, reason: 'もう装填されています' };
          return { ok: true, cost: { mp: api.params.mpCost ?? 2 }, preview: { soldierId: s.soldierId, attack: api.params.attack ?? 3 } };
        },
        run(api, args) {
          (api.state.vars.x43 ??= {})[args.soldierId] = api.params.attack ?? 3;
          return { soldierId: args.soldierId };
        },
      },
    },
  },
};

/** X40：横隊が成り立っていれば、最も後ろの位置の横隊の兵士にシールド1（各自ターン1回） */
function formationShield(api, ev) {
  if (ev.ownerId !== api.playerId || !api.canUse()) return;
  const formation = T.formations(api.game, api.player)[0];
  if (!formation || !api.trigger({ position: formation.position })) return;
  for (const s of formation.members) api.addShield(api.playerId, s, api.params.shield ?? 1);
  api.consume();
}
