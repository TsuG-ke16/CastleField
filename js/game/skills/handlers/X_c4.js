// 横断ノード（担当4）：X07 X08 X09 X20 X21 X36 X37 X38 X45 X46。X23（死者の地雷）は休眠（下記）。handlers/index.js が X に合流させる。
//
// X23 死者の地雷：クラシックに「罠」がない（発動・消滅・侵入判定の仕組みもない）ので、新設せず休眠のまま（既存仕様に存在しない）。
import { isHandHeal, ownHarm, isEnemySide } from '../helpers-c4.js';
import * as Units from '../Units.js';

const DIRECT_SOURCES = new Set(['soldier', 'spell']);

export default {
  // 再誕の祝福：自分が蘇生した兵士へ、次の自ターン開始時HP2回復を予約（各自ターン1回）
  X07: {
    on: {
      onRevive(api, ev) {
        if (ev.ownerId !== api.playerId || !ev.targetId || !api.canUse()) return;
        if (!api.trigger({ targetId: ev.targetId })) return;
        api.schedule({ targetId: ev.targetId, data: { heal: api.params.heal ?? 2 } });
        api.consume();
      },
    },
    scheduled(api, item) {
      const s = api.player.soldiers.find((x) => x.soldierId === item.targetId);
      if (!s || s.hp >= s.maxHp) return false;
      api.game.healOneSoldier(api.player, s, item.data?.heal ?? 2);
      return true;
    },
  },

  // 生命障壁：手札の回復魔法の余剰回復を城壁に変換（各自ターン最大3）。R02 の貯蔵より先に取る（二重利用なし）
  X08: {
    mods: {
      healOverflow: {
        order: 10,
        fn(api, ctx) {
          if (ctx.origin !== 'hand' || !(ctx.remaining > 0)) return;
          const left = (api.params.perTurnMax ?? 3) - api.used('armor');
          const want = Math.min(ctx.remaining, left);
          if (want <= 0) return;
          const got = api.addArmor(want);
          if (got <= 0 || !api.trigger({ armor: got })) return;
          api.consume('armor', got);
          ctx.remaining -= got;
        },
      },
    },
  },

  // 復讐の砲火：自分の城壁が敵の攻撃で壊れた後、次の手札の攻撃魔法の基礎ダメージ+3（付与は各自ターン1回）
  X09: {
    on: {
      onWallBreak(api, ev) {
        if (ev.victimOwnerId !== api.game.side(api.playerId) || ev.ownerId === api.playerId || !DIRECT_SOURCES.has(ev.sourceKind)) return;
        if (!api.canUse() || api.state.vars.X09 || !api.trigger({ kind: 'grant' })) return;
        api.state.vars.X09 = { used: false, cardId: null };
        api.consume();
      },
    },
    mods: {
      hitBaseAdd(api, ctx) {
        const g = api.state.vars.X09;
        const isSpell = ctx.kind === 'spell' || (ctx.kind === 'castle' && ctx.source?.kind === 'spell');
        if (!g || !isSpell || ctx.origin !== 'hand' || ctx.isExtra) return 0;
        const cardId = api.rt.handCard?.cardId ?? null;
        if (g.used && g.cardId !== cardId) {
          delete api.state.vars.X09; // 次のカードが来たので失効（同じカードの複数対象には乗る）
          return 0;
        }
        if (!g.used) {
          g.used = true;
          g.cardId = cardId;
        }
        return api.params.damage ?? 3;
      },
    },
  },

  // 不屈：敵の直接攻撃で自分の城壁が実ダメージを吸収したときSP+1（各自ターン合計2まで）
  X20: {
    on: {
      onCastleDamage(api, ev) {
        if (ev.victimOwnerId !== api.game.side(api.playerId) || !(ev.blocked > 0) || !DIRECT_SOURCES.has(ev.sourceKind)) return;
        if (ev.ownerId === api.playerId || !api.canUse()) return;
        const got = api.gain('sp', api.params.sp ?? 1);
        if (got > 0 && api.trigger({ sp: got })) api.consume('use', 1);
      },
    },
  },

  // 聖なる反応：手札の回復魔法で実回復した味方兵士へ光属性を付着（各自ターン1回）。光と反応する付着（闇）があるときは付けない（有害反応を起こさない）
  X21: {
    on: {
      onHeal(api, ev) {
        if (ev.ownerId !== api.playerId || ev.targetId === 'castle' || !(ev.amount > 0) || !isHandHeal(api, ev) || !api.canUse()) return;
        const game = api.game;
        const s = api.player.soldiers.find((x) => x.soldierId === ev.targetId);
        if (!s || !game.reactionDefs || s.stealth || game.findReaction(s, api.params.element ?? 'light')) return;
        if (!api.trigger({ targetId: s.soldierId })) return;
        const element = api.params.element ?? 'light';
        const turns = game.reactionDefs.attachTurns;
        const found = s.attachments.find((a) => a.element === element);
        if (found) found.turns = Math.max(found.turns, turns);
        else s.attachments.push({ element, turns });
        game.emit('elementAttached', { playerId: api.playerId, soldierId: s.soldierId, element, turns, source: 'X21' });
        api.consume();
      },
    },
  },

  // 生命の闘気：手札の回復魔法の実回復が3以上でSP+2（各自ターン1回）
  X36: {
    on: {
      onHeal(api, ev) {
        if (ev.ownerId !== api.playerId || !(ev.amount >= (api.params.healThreshold ?? 3)) || !isHandHeal(api, ev) || !api.canUse()) return;
        const got = api.gain('sp', api.params.sp ?? 2);
        if (got > 0 && api.trigger({ sp: got })) api.consume();
      },
    },
  },

  // 癒しの陣：手札の回復魔法の実回復を受けた兵士の次の通常攻撃+1（各自ターン合計2体）
  X37: {
    on: {
      onHeal(api, ev) {
        if (ev.ownerId !== api.playerId || ev.targetId === 'castle' || !(ev.amount > 0) || !isHandHeal(api, ev) || !api.canUse()) return;
        const marks = (api.state.vars.X37 ??= []);
        if (marks.includes(ev.targetId) || !api.trigger({ targetId: ev.targetId })) return;
        marks.push(ev.targetId);
        api.consume();
      },
    },
    mods: {
      hitBaseAdd(api, ctx) {
        const marks = api.state.vars.X37;
        if (!marks || (ctx.kind !== 'fight' && ctx.kind !== 'shot') || ctx.origin !== 'normalAttack' || !ctx.attacker) return 0;
        const i = marks.indexOf(ctx.attacker.soldierId);
        if (i < 0) return 0;
        marks.splice(i, 1);
        return api.params.attack ?? 1;
      },
    },
  },

  // 守護者：敵の城への直接攻撃で城HPへ通るダメージを最大2、味方兵士1体に肩代わりさせる（各自ターン1回）。
  // 「指定」は自動：HPがいちばん多い味方兵士（同点は安定順）を守護者とし、その兵士が倒れない範囲（HP-1まで）だけ肩代わりする
  X38: {
    mods: {
      castleReduce: {
        order: 30,
        fn(api, ctx) {
          if (!ctx.direct || !(ctx.loss > 0) || !api.canUse()) return;
          const guardians = api.player.soldiers.filter((s) => s.hp > 1).sort((a, b) => b.hp - a.hp || a.soldierId.localeCompare(b.soldierId));
          const guardian = guardians[0];
          if (!guardian) return;
          const amount = Math.min(api.params.redirectMax ?? 2, ctx.loss, guardian.hp - 1);
          if (amount <= 0 || !api.trigger({ targetId: guardian.soldierId, amount })) return;
          ctx.loss -= amount;
          api.consume();
          api.as('chain', () => api.game.damageSoldier(api.player, guardian, amount, 'skill'));
        },
      },
    },
  },

  // 元素病：自分由来の有害状態を持つ敵兵士への属性反応の基礎ダメージ+2（各自ターン合計2回）
  X45: {
    mods: {
      reactionDamage(api, ctx) {
        if (!ctx.soldier || !isEnemySide(api.game, ctx.owner.id, api.playerId) || !api.canUse()) return;
        if (ownHarm(api.rt, ctx.soldier, api.playerId).length === 0 || !api.trigger({ targetId: ctx.soldier.soldierId })) return;
        ctx.damage += api.params.damage ?? 2;
        api.consume();
      },
    },
  },

  // 魂の器：自分の非トークン兵士を蘇生した際、使い魔1体を追加召喚（各自ターン1回。トークンの上限・空き枠に従う）
  X46: {
    on: {
      onRevive(api, ev) {
        if (ev.ownerId !== api.playerId || !api.canUse() || !Units.canSummon(api.rt, api.playerId).ok) return;
        const revived = api.player.soldiers.find((s) => s.soldierId === ev.targetId);
        if (!revived || revived.skillToken) return;
        const r = api.summonToken({ kind: 'familiar' });
        if (r.ok && api.trigger({ targetId: r.soldier.soldierId })) api.consume();
      },
    },
  },
};
