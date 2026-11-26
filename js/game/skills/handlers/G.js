// 系統 G（墓地）の効果ハンドラ。墓地・魂・蘇生は基盤（Units.js）の規則：トークンは墓地に入らない、自動蘇生は1インスタンス1回・合計2回まで、
// 蘇生した兵士は元の履歴IDを継承、同じ死亡で蘇生と手札回収の両方は成立させない（回収したら墓地から取り除く）。
// 死亡の誘発は onUnitDeath（killed の非トークン兵士だけ。生贄・トークンの消滅は来ない）。
import { isEnemySide } from '../helpers-c4.js';
import * as Units from '../Units.js';

const mine = (api, ev) => ev.ownerId === api.playerId && !ev.snapshot?.token;
const findEntry = (api, historyId) => api.state.grave.find((g) => g.historyId === historyId) ?? null;

export default {
  // 死の爆発：味方兵士の死亡位置に隣接する敵兵士へ固定2ダメージ（1回の爆発で隣接する敵すべて。各自ターン合計2回の爆発）
  G01: {
    on: {
      onUnitDeath(api, ev) {
        if (!mine(api, ev) || !api.canUse()) return;
        const targets = api.adjacentSoldiers(ev.snapshot, { side: api.playerId }).filter((x) => isEnemySide(api.game, x.owner.id, api.playerId));
        if (targets.length === 0 || !api.trigger({ targets: targets.length, position: ev.snapshot.position })) return;
        api.consume();
        for (const t of targets) api.fixedDamage(t.owner.id, t.soldier, api.params.damage ?? 2, 'chain');
      },
    },
  },

  // 魂の回収：味方の非トークン兵士が死亡すると魂+1（最大6）
  G02: {
    on: {
      onUnitDeath: { stage: 'resource', fn(api, ev) {
        if (!mine(api, ev)) return;
        const got = api.gain('soul', api.params.souls ?? 1);
        if (got > 0) api.trigger({ souls: got });
      } },
    },
  },

  // 死者の魔力：味方兵士の死亡時MP+1（各自ターン1回）
  G03: {
    on: {
      onUnitDeath: { stage: 'resource', fn(api, ev) {
        if (!mine(api, ev) || !api.canUse()) return;
        if (api.mp(api.params.mp ?? 1) > 0 && api.trigger({ mp: api.params.mp ?? 1 })) api.consume();
      } },
    },
  },

  // 冥界の門：メイン行動中、墓地の非トークン兵士1体のカードを捨て札から手札へ戻す（試合中1回）。その兵士は墓地から外れる（蘇生と二重にしない）
  G04: {
    actions: {
      G04: {
        label: '冥界の門',
        list: (api) => api.state.grave
          .filter((g) => g.cardId && api.game.pileOf(api.playerId).discard.some((c) => c.cardId === g.cardId))
          .map((g) => ({ args: { historyId: g.historyId }, label: `${g.type}（${g.historyId}）` })),
        check(api, args) {
          const g = findEntry(api, args.historyId);
          if (!g?.cardId) return { ok: false, reason: '墓地にその兵士のカードがありません' };
          if (!api.game.pileOf(api.playerId).discard.some((c) => c.cardId === g.cardId)) return { ok: false, reason: '捨て札にそのカードがありません' };
          if (api.player.hand.length >= api.player.maxHand) return { ok: false, reason: '手札がいっぱいです' };
          return { ok: true, cost: {}, preview: `${g.type} を手札へ` };
        },
        run(api, args) {
          const g = findEntry(api, args.historyId);
          const r = api.recover(g.cardId);
          if (!r.ok) return r;
          api.state.grave = api.state.grave.filter((x) => x !== g);
          if (api.rt.lastFallenEntry.get(api.playerId) === g) {
            api.player.lastFallen = null;
            api.rt.lastFallenEntry.delete(api.playerId);
          }
          return r;
        },
      },
    },
  },

  // 遺志の継承：非トークン味方兵士の死亡時、次に手札から出撃する味方兵士へ死亡時攻撃力の25%（最大3）を付与（非累積＝大きい方）
  G05: {
    on: {
      onUnitDeath: { stage: 'resource', fn(api, ev) {
        if (!mine(api, ev)) return;
        const bonus = Math.min(api.params.max ?? 3, Math.floor((ev.snapshot.attack ?? 0) * (api.params.ratio ?? 0.25)));
        if (bonus <= 0) return;
        const cur = api.state.vars.G05 ?? 0;
        api.state.vars.G05 = Math.max(cur, bonus);
      } },
      onSummon: { stage: 'state', fn(api, ev) {
        const bonus = api.state.vars.G05;
        if (!bonus || ev.ownerId !== api.playerId || ev.origin !== 'hand' || ev.token) return;
        const found = api.findSoldier(ev.targetId);
        if (!found || !api.trigger({ targetId: ev.targetId, bonus })) return;
        found.soldier.baseAttack += bonus;
        delete api.state.vars.G05;
      } },
    },
  },

  // 蘇生術：メイン行動中、魂3で墓地の非トークン兵士1体を最大HP50%で蘇生（各自ターン1回）
  G06: {
    actions: {
      G06: {
        label: '蘇生術',
        list: (api) => api.state.grave
          .filter((g) => api.rt.stateOf(api.playerId) && Units.canRevive(api.rt, api.playerId, g).ok)
          .map((g) => ({ args: { historyId: g.historyId }, label: `${g.type}（${g.historyId}）` })),
        check(api, args) {
          const g = findEntry(api, args.historyId);
          if (!g) return { ok: false, reason: '墓地にその兵士がいません' };
          const c = Units.canRevive(api.rt, api.playerId, g);
          if (!c.ok) return c;
          return { ok: true, cost: { soul: api.params.soulCost ?? 3 }, preview: `${g.type} をHP${Math.max(1, Math.floor(g.maxHp * (api.params.hpRatio ?? 0.5)))}で蘇生` };
        },
        run(api, args) {
          const g = findEntry(api, args.historyId);
          return api.revive(g, { hpRatio: api.params.hpRatio ?? 0.5 });
        },
      },
    },
  },

  // 冥府の護り：蘇生した兵士にシールド2（各自ターン1体）
  G07: {
    on: {
      onRevive: { stage: 'state', fn(api, ev) {
        if (ev.ownerId !== api.playerId || !api.canUse()) return;
        const found = api.findSoldier(ev.targetId);
        if (!found) return;
        if (api.addShield(api.playerId, found.soldier, api.params.shield ?? 2) > 0 && api.trigger({ targetId: ev.targetId })) api.consume();
      } },
    },
  },

  // 奥義：死霊術。各自ターンの最初の合法な非トークン味方兵士の死亡時、死亡処理が終わったあとHP50%で自動蘇生
  G08: {
    on: {
      onUnitDeath: { stage: 'death', fn(api, ev) {
        if (!mine(api, ev) || !ev.graveEntry || !api.canUse()) return;
        const g = findEntry(api, ev.snapshot.historyId);
        if (!g || !Units.canRevive(api.rt, api.playerId, g, { auto: true }).ok) return;
        const r = api.revive(g, { auto: true, hpRatio: api.params.hpRatio ?? 0.5 });
        if (r.ok && api.trigger({ targetId: r.soldier.soldierId, historyId: g.historyId })) api.consume();
      } },
    },
  },
};
