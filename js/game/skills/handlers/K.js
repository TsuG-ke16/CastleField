// 系統 K（戦術）のスキル効果。盤面のルールは skills/Tactics.js（既存のレーン・隣接・進軍の規則）。
// K01（挟撃）の読み替え：クラシックの通常攻撃は同じ道（レーン）の敵にしか届かないので、「異なるレーンの味方」は
// 「同じ自ターンに、ほかの味方兵士がすでに通常攻撃した敵」と読む。「兵士防御」＝盾（人間に確認して決めた）。

import * as T from '../Tactics.js';

const mine = (api, soldierId) => api.player.soldiers.find((s) => s.soldierId === soldierId) ?? null;

/** K03：最後尾の兵士の射程+1 を今の盤面に合わせて付け外しする（盤面が変わりうるイベントのたびに呼ぶ） */
function refreshColumn(api) {
  const rears = new Set(T.columnRears(api.player));
  for (const s of api.player.soldiers) {
    const had = Boolean(s.skillRange?.K03);
    T.setRangeAdd(s, 'K03', rears.has(s) ? api.params.range ?? 1 : 0);
    if (!had && s.skillRange?.K03) api.trigger({ targetId: s.soldierId }); // 射程が伸びた回数
  }
}

/** K01：自ターンの通常攻撃の履歴（区間ごとにリセット）。敵兵士ID → 攻撃した味方兵士IDの集合 */
function k01State(api) {
  const st = api.state;
  if (st.vars.k01?.interval !== st.interval) st.vars.k01 = { interval: st.interval, hist: {} };
  return st.vars.k01;
}

export default {
  // 挟撃（読み替え）：同じ自ターンに、ほかの味方兵士がすでに通常攻撃した敵兵士へ、別の味方兵士が通常攻撃すると、盾を1無視（対象ごと各自ターン1回）。
  // 盾を1無視する＝盾があるとき基礎ダメージ+1（HPに入る量は同じ。盾は1多く削れる）
  K01: {
    mods: {
      hitBaseAdd(api, ctx) {
        if ((ctx.kind !== 'fight' && ctx.kind !== 'shot') || ctx.origin !== 'normalAttack' || !ctx.enemy || !ctx.attacker || !ctx.victim) return 0;
        if (api.game.currentPlayer !== api.playerId || !api.player.soldiers.includes(ctx.attacker)) return 0;
        const hist = (k01State(api).hist[ctx.victim.soldierId] ??= []);
        const earlier = hist.some((id) => id !== ctx.attacker.soldierId);
        if (!hist.includes(ctx.attacker.soldierId)) hist.push(ctx.attacker.soldierId);
        const key = `t:${ctx.victim.soldierId}`;
        if (!earlier || !(ctx.victim.shield > 0) || !api.canUse(key, 1)) return 0;
        api.consume(key);
        api.trigger({ targetId: ctx.victim.soldierId });
        return Math.min(api.params.ignoreDefense ?? 1, ctx.victim.shield);
      },
    },
  },

  // 横隊：同じ進軍位置の全レーン（3本）に味方兵士が揃う間、該当兵士は直接被ダメージ-1（最低0）
  K02: {
    mods: {
      hitReduce(api, ctx) {
        if (!ctx.victim || !api.player.soldiers.includes(ctx.victim) || !ctx.enemy) return 0;
        if (!T.formationAt(api.game, api.player, ctx.victim)) return 0;
        api.trigger({ targetId: ctx.victim.soldierId });
        return api.params.reduce ?? 1;
      },
    },
  },

  // 縦隊：同一レーンで前後に隣接する味方兵士が2体以上いる間、最後尾兵士の射程+1（盤面が変わるたびに付け直す）
  K03: {
    on: {
      onTurnStart: refreshColumn,
      onSummon: refreshColumn,
      onUnitDeath: refreshColumn,
      onTokenGone: refreshColumn,
      onUnitMoved: refreshColumn,
      onCardPlayed: refreshColumn,
      onEnemyCardPlayed: refreshColumn,
    },
  },

  // 迂回：メイン行動中、味方兵士1体を隣接レーン同位置の空き枠へ移動し、シールド1（各自ターン1回）
  K04: {
    actions: {
      K04: {
        label: '迂回（兵士を隣のレーンへ・シールド）',
        list(api) {
          return T.laneMoveCandidates(api.game, api.player).map(({ soldier, road }) => ({
            args: { soldierId: soldier.soldierId, roadId: road.roadId },
            label: `${soldier.soldierId}を${road.lane + 1}番レーンへ`,
          }));
        },
        check(api, args) {
          const r = T.checkLaneMove(api.game, api.player, args);
          return r.ok ? { ok: true, cost: {}, preview: { soldierId: r.soldier.soldierId, roadId: r.road.roadId, shield: api.params.shield ?? 1 } } : r;
        },
        run(api, args) {
          const r = T.checkLaneMove(api.game, api.player, args);
          if (!r.ok) return { ok: false, reason: r.reason };
          T.moveLane(api.game, api.player, r.soldier, r.road);
          api.addShield(api.playerId, r.soldier, api.params.shield ?? 1);
          return { soldierId: r.soldier.soldierId, roadId: r.road.roadId };
        },
      },
    },
  },

  // 交代：メイン行動中、同レーンで前後隣接の味方兵士2体の位置を交換（各自ターン1回）
  K05: {
    actions: {
      K05: {
        label: '交代（前後の兵士の位置を入れ替える）',
        list(api) {
          return T.columnPairs(api.player).map(({ back, front }) => ({ args: { backId: back.soldierId, frontId: front.soldierId }, label: `${back.soldierId}と${front.soldierId}` }));
        },
        check(api, args) {
          const back = mine(api, args?.backId);
          const front = mine(api, args?.frontId);
          if (!back || !front) return { ok: false, reason: '味方の兵士を2体選んでください' };
          if (back.roadId !== front.roadId || front.position !== back.position + 1) return { ok: false, reason: '同じレーンで前後に隣り合う兵士を選んでください' };
          return { ok: true, cost: {}, preview: { backId: back.soldierId, frontId: front.soldierId } };
        },
        run(api, args) {
          const back = mine(api, args.backId);
          const front = mine(api, args.frontId);
          T.swapPositions(api.game, api.player, back, front);
          return { backId: back.soldierId, frontId: front.soldierId };
        },
      },
    },
  },

  // 待ち伏せ：自分の空だったレーンに手札から最初の兵士を出すとシールド2（各自ターン1回）
  K06: {
    on: {
      onSummon(api, ev) {
        if (ev.ownerId !== api.playerId || ev.origin !== 'hand' || ev.token || !api.canUse()) return;
        const soldier = mine(api, ev.targetId);
        if (!soldier) return;
        if (api.player.soldiers.some((s) => s !== soldier && s.roadId === soldier.roadId)) return; // そのレーンはもう空ではない
        if (!api.trigger({ targetId: ev.targetId })) return;
        api.addShield(api.playerId, soldier, api.params.shield ?? 2);
        api.consume();
      },
    },
  },

  // 追い風：敵兵士を通常攻撃で倒した味方兵士が、空き枠へ1マス追加進軍できる（各自ターン1回。自分の進軍中の撃破が対象）
  K07: {
    on: {
      onAttackResolve(api, ev) {
        if (ev.ownerId !== api.playerId || !ev.killed || ev.origin !== 'normalAttack' || ev.isExtra || !ev.enemy || !ev.attackerSoldierId) return;
        if (api.game.currentPlayer !== api.playerId || !api.canUse()) return;
        const soldier = mine(api, ev.attackerSoldierId);
        if (!soldier || !T.stepCheck(api.game, api.player, soldier, { needFree: true }).ok) return;
        if (!api.spawnExtra('extraAttack').ok || !api.trigger({ targetId: soldier.soldierId })) return;
        T.stepForward(api, soldier);
        api.consume();
      },
    },
  },

  // 奥義：電撃作戦：メイン行動中、味方兵士1体を既存の移動制約に従い追加で1マス進軍（各自ターン1回）
  K08: {
    actions: {
      K08: {
        label: '電撃作戦（兵士を1マス進軍）',
        list(api) {
          return api.player.soldiers
            .filter((s) => T.stepCheck(api.game, api.player, s).ok)
            .sort((a, b) => T.soldierNumber(a) - T.soldierNumber(b))
            .map((s) => ({ args: { soldierId: s.soldierId }, label: `${s.soldierId}を${s.position + 1}マス目へ` }));
        },
        check(api, args) {
          const s = mine(api, args?.soldierId);
          if (!s) return { ok: false, reason: '味方の兵士を選んでください' };
          const c = T.stepCheck(api.game, api.player, s);
          return c.ok ? { ok: true, cost: {}, preview: { soldierId: s.soldierId, from: s.position, to: s.position + (api.params.steps ?? 1) } } : c;
        },
        run(api, args) {
          const s = mine(api, args.soldierId);
          return T.stepForward(api, s);
        },
      },
    },
  },
};
