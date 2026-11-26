// 系統 R（回復）の効果ハンドラ。R01（回復魔法の基礎回復+1）は SkillTree.js の STATIC が接続済み。
// クラシックの実カードの回復魔法は城を回復する healOwnCastle（小回復・ヒール）だけ。兵士を回復する回復魔法（healSoldier など）は
// 現行のクラシックのカードにないが、R03〜R08 は「対象が城か兵士か」を見て両方に対応する（兵士側は将来のカード・R05 用）。
// 余剰回復の順：X08（order 10：城壁に変換）→ R02（order 20：貯蔵）。
import { isHandHeal, cleanseCastle, cleanseOne, HEAL_EFFECTS } from '../helpers-c4.js';

const castleOf = (api) => api.player.castle;
const soldierOf = (api, ev) => (ev.targetId === 'castle' ? null : api.player.soldiers.find((s) => s.soldierId === ev.targetId) ?? null);

export default {
  // 生命の蓄積：手札の回復魔法の余剰回復を最大5まで貯蔵し、次の手札の回復魔法の最初の対象へ全量加算して消費
  R02: {
    mods: {
      healOverflow: {
        order: 20,
        fn(api, ctx) {
          if (ctx.origin !== 'hand' || !(ctx.remaining > 0)) return;
          const got = api.gain('healStore', Math.min(ctx.remaining, api.params.storeMax ?? 5));
          if (got <= 0 || !api.trigger({ stored: got })) return;
          ctx.remaining -= got;
        },
      },
      healAmount(api, ctx) {
        if (ctx.origin !== 'hand' || api.rt.root?.origin !== 'hand' || !HEAL_EFFECTS.has(ctx.card?.def?.effect)) return;
        const stored = api.state.res.healStore;
        if (!(stored > 0) || !api.spend('healStore', stored)) return;
        ctx.amount += stored;
        api.trigger({ consumed: stored });
      },
    },
  },

  // 浄化：手札の回復魔法の対象から、解除できる有害状態を1つ解除
  R03: {
    on: {
      onHeal(api, ev) {
        if (ev.ownerId !== api.playerId || !isHandHeal(api, ev)) return;
        const s = soldierOf(api, ev);
        const cleared = ev.targetId === 'castle' ? cleanseCastle(api, api.player) : s ? cleanseOne(api, api.player, s) : null;
        if (cleared) api.trigger({ targetId: ev.targetId, status: cleared });
      },
    },
  },

  // 癒しの残響：手札の回復魔法の対象は、次の自ターン開始にHP1回復（各対象1件まで予約）
  R04: {
    on: {
      onHeal(api, ev) {
        if (ev.ownerId !== api.playerId || !isHandHeal(api, ev)) return;
        if (api.state.scheduled.some((x) => x.skillId === 'R04' && x.targetId === ev.targetId)) return;
        if (!api.trigger({ targetId: ev.targetId })) return;
        api.schedule({ targetId: ev.targetId, data: { heal: api.params.heal ?? 1 } });
      },
    },
    scheduled(api, item) {
      const heal = item.data?.heal ?? 1;
      if (item.targetId === 'castle') {
        const castle = castleOf(api);
        const healed = castle.heal(heal);
        if (healed > 0) api.game.emit('castleHealed', { playerId: api.playerId, amount: healed, hp: castle.hp, source: { kind: 'skill', skill: 'R04' } });
        return healed > 0;
      }
      const s = api.player.soldiers.find((x) => x.soldierId === item.targetId);
      if (!s || s.hp >= s.maxHp) return false;
      api.game.healOneSoldier(api.player, s, heal);
      return true;
    },
  },

  // 生命循環：手札の魔法で城の実HPが回復したら、傷ついた味方兵士すべてをHP1回復（各自ターン1回）
  R05: {
    on: {
      onHeal(api, ev) {
        if (ev.ownerId !== api.playerId || ev.targetId !== 'castle' || !(ev.amount > 0)) return;
        if (ev.origin !== 'hand' || ev.isExtra || api.rt.root?.origin !== 'hand' || !api.canUse()) return;
        const hurt = api.player.soldiers.filter((s) => s.hp < s.maxHp);
        if (hurt.length === 0 || !api.trigger({ count: hurt.length })) return;
        api.consume();
        api.as('chain', () => {
          for (const s of hurt) api.game.healOneSoldier(api.player, s, api.params.heal ?? 1);
        });
      },
    },
  },

  // 奇跡の治癒：手札の回復魔法を20%で威力50%再発動（各自ターン1回）。再発動では貯蔵・城壁変換・回復の誘発をしない
  R06: {
    on: {
      onHeal(api, ev) {
        if (ev.ownerId !== api.playerId || !isHandHeal(api, ev) || !api.canUse()) return;
        const card = api.rt.handCard;
        const base = card?.def?.amount ?? 0;
        const amount = Math.floor(base * (api.params.powerRatio ?? 0.5));
        if (amount <= 0 || !api.roll(api.params.chance ?? 0.2)) return;
        if (!api.spawnExtra('extraAttack').ok || !api.trigger({ targetId: ev.targetId, amount })) return;
        api.consume();
        api.as('extraAttack', () => {
          if (ev.targetId === 'castle') {
            const castle = castleOf(api);
            const healed = castle.heal(amount);
            api.game.emit('castleHealed', { playerId: api.playerId, amount: healed, hp: castle.hp, source: { kind: 'skill', skill: 'R06' } });
          } else {
            const s = soldierOf(api, ev);
            if (s) api.game.healOneSoldier(api.player, s, amount);
          }
        });
      },
    },
  },

  // 守りの癒し：手札の回復魔法で兵士の実HPが回復したら、その兵士にシールド1（各自ターン合計2回）
  R07: {
    on: {
      onHeal(api, ev) {
        if (ev.ownerId !== api.playerId || ev.targetId === 'castle' || !(ev.amount > 0) || !isHandHeal(api, ev) || !api.canUse()) return;
        const s = soldierOf(api, ev);
        if (!s || !api.trigger({ targetId: s.soldierId })) return;
        if (api.addShield(api.playerId, s, api.params.shield ?? 1) > 0) api.consume();
      },
    },
  },

  // 奥義：生命創造。手札の回復魔法の対象の最大HP+1（各自ターン1回・同一対象は試合中+3まで）。現在HPは増やさない
  R08: {
    on: {
      onHeal(api, ev) {
        if (ev.ownerId !== api.playerId || !isHandHeal(api, ev) || !api.canUse()) return;
        const vars = (api.state.vars.R08 ??= {});
        const key = ev.targetId === 'castle' ? 'castle' : ev.targetId;
        if ((vars[key] ?? 0) >= (api.params.perTargetMax ?? 3)) return;
        const target = key === 'castle' ? castleOf(api) : soldierOf(api, ev);
        if (!target || !api.trigger({ targetId: key })) return;
        target.maxHp += api.params.maxHp ?? 1;
        vars[key] = (vars[key] ?? 0) + (api.params.maxHp ?? 1);
        api.consume();
      },
    },
  },
};
