// 系統 U（兵士）のスキル効果。U01（出撃枚数+1）・U04（弓兵・魔法使いの射程+1）は試合開始時の数値（SkillTree.js の STATIC_HANDLERS）で効いている。
// 盤面のルール（隣接・レーン・射程・進軍）は skills/Tactics.js にまとめてあり、既存の Game の規則に従う。
//
// 進軍は自分のターンの始めに自動で進む（Game.advanceSoldiers）ので、進軍中に起きた命中に対する追加効果（U02・U08）は、
// 基盤の決まり（原アクションの終わりでキューを処理）どおり進軍が終わったあとに解決される。

import * as T from '../Tactics.js';

const mine = (api, soldierId) => api.player.soldiers.find((s) => s.soldierId === soldierId) ?? null;

/** U02：自ターンの兵士の通常攻撃の履歴（区間ごとにリセット）。命中した瞬間（mods）に数え、追加ダメージは命中の解決後（on）に与える */
function u02State(api) {
  const st = api.state;
  if (st.vars.u02?.interval !== st.interval) st.vars.u02 = { interval: st.interval, hist: {}, pending: {} };
  return st.vars.u02;
}

export default {
  // 連携攻撃：同一レーンの異なる味方兵士が同一敵兵士に自ターン中2回目以降の通常攻撃をすると追加固定ダメージ2（対象ごと1回）
  U02: {
    mods: {
      hitBaseAdd(api, ctx) {
        if ((ctx.kind !== 'fight' && ctx.kind !== 'shot') || ctx.origin !== 'normalAttack' || !ctx.enemy || !ctx.attacker) return 0;
        if (api.game.currentPlayer !== api.playerId) return 0;
        const s = u02State(api);
        const targetId = ctx.victim.soldierId;
        const hist = (s.hist[targetId] ??= []);
        const earlier = hist.some((h) => h.by !== ctx.attacker.soldierId && h.roadId === ctx.attacker.roadId);
        hist.push({ by: ctx.attacker.soldierId, roadId: ctx.attacker.roadId });
        if (earlier && api.canUse(`t:${targetId}`, 1)) s.pending[targetId] = true;
        return 0;
      },
    },
    on: {
      onAttackResolve(api, ev) {
        if (ev.ownerId !== api.playerId || ev.origin !== 'normalAttack' || ev.isExtra || !ev.enemy) return;
        const s = u02State(api);
        if (!s.pending[ev.targetId]) return;
        delete s.pending[ev.targetId];
        if (!api.canUse(`t:${ev.targetId}`, 1)) return;
        const found = api.findSoldier(ev.targetId);
        if (!found) return;
        if (!api.spawnExtra('chain').ok || !api.trigger({ targetId: ev.targetId })) return;
        api.fixedDamage(found.owner.id, found.soldier, api.params.damage ?? 2, 'chain');
        api.consume(`t:${ev.targetId}`);
      },
    },
  },

  // 先制部隊：手札から出撃した兵士が、既存射程内の合法な敵兵士1体を即時通常攻撃（各自ターン1回）
  U03: {
    on: {
      onSummon(api, ev) {
        if (ev.ownerId !== api.playerId || ev.origin !== 'hand' || ev.token || !api.canUse()) return;
        const soldier = mine(api, ev.targetId);
        if (!soldier) return;
        const target = T.attackTargets(api.game, api.player, soldier)[0];
        if (!target) return;
        if (!api.spawnExtra('extraAttack').ok || !api.trigger({ targetId: target.soldier.soldierId })) return;
        T.strike(api, soldier, target);
        api.consume();
      },
    },
  },

  // 戦術支援：隣接味方兵士が1体以上いる兵士の攻撃力+1（動的。重複しない）。通常攻撃（戦い・射撃・城への到達）の基礎ダメージに足す
  U05: {
    mods: {
      hitBaseAdd(api, ctx) {
        let soldier = null;
        if ((ctx.kind === 'fight' || ctx.kind === 'shot') && ctx.attacker) soldier = ctx.attacker;
        else if (ctx.kind === 'castle' && ctx.source?.kind === 'soldier') soldier = api.findSoldier(ctx.source.soldierId)?.soldier ?? null;
        if (!soldier || !api.player.soldiers.includes(soldier)) return 0;
        const near = api.adjacentSoldiers(soldier).some((x) => x.owner.id === api.playerId);
        return near ? api.params.attack ?? 1 : 0;
      },
    },
  },

  // 戦術転換：メイン行動中、味方兵士1体を同じ進軍位置の隣接レーンの空き枠へ移す（各自ターン1回）
  U06: {
    actions: {
      U06: {
        label: '戦術転換（兵士を隣のレーンへ）',
        list(api) {
          return T.laneMoveCandidates(api.game, api.player).map(({ soldier, road }) => ({
            args: { soldierId: soldier.soldierId, roadId: road.roadId },
            label: `${soldier.soldierId}を${road.lane + 1}番レーンへ`,
          }));
        },
        check(api, args) {
          const r = T.checkLaneMove(api.game, api.player, args);
          return r.ok ? { ok: true, cost: {}, preview: { soldierId: r.soldier.soldierId, roadId: r.road.roadId, position: r.soldier.position } } : r;
        },
        run(api, args) {
          const r = T.checkLaneMove(api.game, api.player, args);
          if (!r.ok) return { ok: false, reason: r.reason };
          T.moveLane(api.game, api.player, r.soldier, r.road);
          return { soldierId: r.soldier.soldierId, roadId: r.road.roadId };
        },
      },
    },
  },

  // 進軍の旗：手札から出撃した最初の兵士へシールド2（各自ターン1回）
  U07: {
    on: {
      onSummon(api, ev) {
        if (ev.ownerId !== api.playerId || ev.origin !== 'hand' || ev.token || !api.canUse()) return;
        const soldier = mine(api, ev.targetId);
        if (!soldier || !api.trigger({ targetId: ev.targetId })) return;
        api.addShield(api.playerId, soldier, api.params.shield ?? 2);
        api.consume();
      },
    },
  },

  // 奥義：軍団指揮：味方兵士が通常攻撃で敵兵士を倒すと、既存の合法な対象に即時追加通常攻撃（各兵士・各自ターン1回）
  U08: {
    on: {
      onAttackResolve(api, ev) {
        if (ev.ownerId !== api.playerId || !ev.killed || ev.origin !== 'normalAttack' || ev.isExtra || !ev.enemy || !ev.attackerSoldierId) return;
        const key = `s:${ev.attackerSoldierId}`;
        if (!api.canUse(key, api.params.perTurn ?? 1)) return;
        const soldier = mine(api, ev.attackerSoldierId);
        if (!soldier) return;
        const target = T.attackTargets(api.game, api.player, soldier)[0];
        if (!target) return;
        if (!api.spawnExtra('extraAttack').ok || !api.trigger({ targetId: target.soldier.soldierId })) return;
        T.strike(api, soldier, target);
        api.consume(key);
      },
    },
  },
};
