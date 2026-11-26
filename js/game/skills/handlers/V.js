// 系統 V（召喚）の効果ハンドラ。トークン・使い魔は基盤（Units.js）：同時3体・各自ターン生成2体まで、墓地・撃破報酬・SP・魂・回収・死亡時誘発の対象外。
// 兵士カードの固有能力：クラシックの兵士カード（歩兵・騎兵・弓兵・重装兵・聖術師…）には「安全リスト」に入る固有能力がない
// （射程・移動は弱体トークンが元の値を引き継ぐ）。V08 は仕様どおり「選べる能力がない場合は元兵士付きトークンにも攻撃力+1」を適用する。
import * as Units from '../Units.js';
import { SKILL_TOKEN_TYPE } from '../Units.js';

const isMyToken = (api, ev) => ev.ownerId === api.playerId && api.player.soldiers.some((s) => s.soldierId === ev.targetId && s.skillToken);

export default {
  // 分身：手札から兵士を出撃したとき15%で、空き枠に同種の弱体トークンを召喚（各自ターン1回）
  V01: {
    on: {
      onSummon(api, ev) {
        if (ev.ownerId !== api.playerId || ev.origin !== 'hand' || ev.token || !api.canUse()) return;
        // ev.type は「イベントの名前」なので、元の兵士の種類は盤面の兵士から読む
        const fromType = api.findSoldier(ev.targetId)?.soldier.type;
        if (!fromType || !Units.canSummon(api.rt, api.playerId).ok || !api.roll(api.params.chance ?? 0.15)) return;
        if (!api.spawnExtra('token').ok) return;
        const r = api.summonToken({ kind: 'weak', fromType });
        if (r.ok && api.trigger({ targetId: r.soldier.soldierId, fromType })) api.consume();
      },
    },
  },

  // 使い魔：手札から魔法を3枚使うごとに使い魔1体を空き枠に召喚（各自ターン1回。カウンタは試合中継続）
  V02: {
    on: {
      onCardPlayed(api, ev) {
        if (ev.ownerId !== api.playerId || ev.kind !== 'spell') return;
        const need = api.params.spellsNeeded ?? 3;
        const vars = api.state.vars;
        vars.V02 = Math.min(need, (vars.V02 ?? 0) + 1);
        if (vars.V02 < need || !api.canUse() || !Units.canSummon(api.rt, api.playerId).ok) return;
        const r = api.summonToken({ kind: 'familiar' });
        if (!r.ok || !api.trigger({ targetId: r.soldier.soldierId })) return;
        vars.V02 -= need;
        api.consume();
      },
    },
  },

  // 召喚の盾：自分が召喚したトークンにシールド1
  V03: {
    on: {
      onSummon: { stage: 'state', fn(api, ev) {
        if (!isMyToken(api, ev)) return;
        const s = api.player.soldiers.find((x) => x.soldierId === ev.targetId);
        if (api.addShield(api.playerId, s, api.params.shield ?? 1) > 0) api.trigger({ targetId: ev.targetId });
      } },
    },
  },

  // 群れの力：自分のトークンが盤上に2体以上いれば、トークンの通常攻撃の基礎ダメージ+1
  V04: {
    mods: {
      hitBaseAdd(api, ctx) {
        if ((ctx.kind !== 'fight' && ctx.kind !== 'shot') || !ctx.attacker?.skillToken || ctx.origin !== 'normalAttack') return 0;
        return Units.aliveTokens(api.rt, api.playerId).length >= (api.params.tokensNeeded ?? 2) ? api.params.damage ?? 1 : 0;
      },
    },
  },

  // 送還：メイン行動中、味方トークン1体を消滅させMP+1（死亡扱いにしない。各自ターン1回）
  V05: {
    actions: {
      V05: {
        label: '送還',
        list: (api) => Units.aliveTokens(api.rt, api.playerId).map((s) => ({ args: { soldierId: s.soldierId }, label: `${s.tokenName ?? s.type}（${s.soldierId}）` })),
        check(api, args) {
          const s = api.player.soldiers.find((x) => x.soldierId === args.soldierId && x.skillToken);
          if (!s) return { ok: false, reason: 'スキルのトークンを指定してください' };
          return { ok: true, cost: {}, preview: `${s.tokenName ?? s.type} を送還して MP+${api.params.mp ?? 1}` };
        },
        run(api, args) {
          const s = api.player.soldiers.find((x) => x.soldierId === args.soldierId);
          const r = Units.dismissToken(api.rt, api.playerId, s);
          if (r.ok) api.mp(api.params.mp ?? 1);
          return r;
        },
      },
    },
  },

  // 契約更新：味方トークンが敵の攻撃で消滅したとき20%で、次の自ターン開始時に使い魔を予約召喚（各自ターン1回）
  V06: {
    on: {
      onTokenGone(api, ev) {
        if (ev.ownerId !== api.playerId || ev.cause !== 'killed' || !ev.killerId || ev.killerId === api.playerId || !api.canUse()) return;
        if (!api.roll(api.params.chance ?? 0.2) || !api.trigger({ targetId: ev.targetId })) return;
        api.schedule({ targetId: ev.targetId, data: {} });
        api.consume();
      },
    },
    scheduled(api) {
      const r = api.summonToken({ kind: 'familiar' });
      return r.ok;
    },
  },

  // 召喚の門：メイン行動中、MP3で使い魔1体を召喚（各自ターン1回）
  V07: {
    actions: {
      V07: {
        label: '召喚の門',
        list: (api) => (Units.canSummon(api.rt, api.playerId).ok ? [{ args: {}, label: '使い魔を召喚' }] : []),
        check(api) {
          const c = Units.canSummon(api.rt, api.playerId);
          if (!c.ok) return c;
          return { ok: true, cost: { mp: api.params.mpCost ?? 3 }, preview: '使い魔を1体召喚' };
        },
        run(api) {
          return api.summonToken({ kind: 'familiar' });
        },
      },
    },
  },

  // 奥義：軍勢の創造。トークンは元兵士の固有能力を継承できる（クラシックの兵士には安全リストの能力がないので、代わりに攻撃力+1）。使い魔は攻撃力+1
  V08: {
    on: {
      onSummon: { stage: 'state', fn(api, ev) {
        if (!isMyToken(api, ev)) return;
        const s = api.player.soldiers.find((x) => x.soldierId === ev.targetId);
        if (s.skillTokenV08 || (s.type !== SKILL_TOKEN_TYPE && s.type !== Units.FAMILIAR_TYPE)) return;
        s.skillTokenV08 = true;
        s.baseAttack += api.params.familiarAttack ?? 1;
        api.trigger({ targetId: ev.targetId, kind: s.type === Units.FAMILIAR_TYPE ? 'familiar' : 'weak' });
      } },
    },
  },
};
