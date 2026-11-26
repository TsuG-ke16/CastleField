// 系統 B（血魔術）のスキル効果ハンドラ（段階C・C5 担当）。仕様 3章 B・5.6。
// 支払の順（5.6）：MP軽減（mods "mpCost"）→ HP置換（B01/B08 の mods "mpToHp"）→ X32 免除 → X35 延期 → 実支払（Resources.payHp）。
// 支払由来の効果（B06 血気・X33 SP・X34 城壁・X28 回復強化・X31 使い魔）は onHpPayment の実消費量（ev.amount＝paid）だけから作る。
// 免除された量（waived）・延期した量（deferred）からは作らない。延期分は次の自ターン開始の債務支払（ev.debt）で実消費になったときに数える。
// 任意の選択は playCard(cardId, target, options) の options：hpForMp（B08 の置換量。0/false なら置換しない）・bloodBlade（B03）・bloodEcho（X27）

import { declare, currentDecl, isHandAttackHit, healCastle, roomOf, enemySoldiers } from '../blood.js';

/** B01/B08 の HP置換。any=true（B08）なら options.hpForMp の量まで任意に置換、なければ不足分だけ */
function replaceMp(api, ctx, rate, any) {
  if (ctx.card?.def?.kind !== 'spell') return;
  const opt = ctx.options ?? {};
  if (opt.hpForMp === 0 || opt.hpForMp === false) return; // 置換しないと明示
  const shortage = Math.max(0, ctx.cost - ctx.player.mp);
  let n = shortage;
  if (any && Number.isInteger(opt.hpForMp)) n = Math.max(shortage, Math.min(ctx.cost, opt.hpForMp));
  if (n <= 0) return;
  ctx.cost -= n;
  ctx.hp += n * rate;
}

/** カードの費用の HP支払（cardPaid の sourceSkillId "cardCost"）＝置換が起きたときに数える（免除・延期でも置換は成立） */
function countReplacement(api, ev) {
  if (ev.ownerId !== api.playerId || ev.sourceSkillId !== 'cardCost' || ev.debt || !(ev.requested > 0)) return;
  api.trigger({ requested: ev.requested, paid: ev.amount, waived: ev.waived, deferred: ev.deferred });
}

export default {
  // 血の代償：手札からの魔法の不足MP1につき城HP2（HP1を残す。足りなければ出せない）。B08 があれば B08 の 1:1 に上書き
  B01: {
    mods: {
      mpToHp: {
        order: 10,
        fn(api, ctx) {
          if (api.owns('B08')) return;
          replaceMp(api, ctx, api.params.hpPerMp ?? 2, false);
        },
      },
    },
    on: { onHpPayment: { stage: 'state', fn(api, ev) { if (!api.owns('B08')) countReplacement(api, ev); } } },
  },

  // 血の契約：メイン行動中、城HP3を払って1枚ドロー（各自ターン1回）。手札が満杯なら使えない
  B02: {
    actions: {
      B02: {
        label: '血の契約（城HP3で1枚ドロー）',
        check(api) {
          const p = api.player;
          if (p.hand.length >= p.maxHand) return { ok: false, reason: '手札がいっぱいです' };
          return { ok: true, cost: { hp: api.params.hpCost ?? 3 }, preview: { draw: api.params.draw ?? 1 } };
        },
        run(api) {
          return api.drawExtra(api.params.draw ?? 1, { optional: true });
        },
      },
    },
  },

  // 血の刃：手札からの攻撃魔法の使用時、任意（options.bloodBlade）で城HP2を払い、最初の1対象の直接基礎ダメージ+4（各自ターン1回）。
  // 支払は最初の直接命中の直前（外れ・回避なら払わない）。HPが足りない・債務があるときは払わず +0
  B03: {
    mods: {
      mpToHp: { order: 1, fn: (api, ctx) => declare(api, ctx) },
      hitBaseAdd(api, ctx) {
        const decl = currentDecl(api);
        if (!decl || !decl.options.bloodBlade || decl.b03 || !isHandAttackHit(api, ctx, decl)) return 0;
        decl.b03 = true; // 1対象のみ（支払えなくても、この魔法ではもう試さない）
        if (!api.canUse()) return 0;
        const r = api.payHp(api.params.hpCost ?? 2);
        if (!r.ok) return 0;
        api.consume();
        api.trigger({ paid: r.paid, waived: r.waived, deferred: r.deferred });
        return api.params.damage ?? 4;
      },
    },
  },

  // 吸血：自分の手札からの攻撃魔法・兵士の通常攻撃（直接命中だけ）による敵兵士の実HP損失の10%（対象ごと切り捨て）を城HPに回復。各自ターン合計3まで。
  // トークン・自分の兵士・城・城壁・追加由来（echo など）・持続ダメージ・固定ダメージからは得ない
  B04: {
    on: {
      onAttackResolve: {
        stage: 'resource',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || !ev.direct || !ev.enemy || ev.victimToken || !(ev.dealt > 0)) return;
          if (ev.hitKind === 'spell' && ev.origin !== 'hand') return;
          const amount = Math.floor(ev.dealt * (api.params.ratio ?? 0.1));
          const n = Math.min(amount, roomOf(api, 'heal', api.params.perTurnMax ?? 3));
          if (n <= 0) return;
          const healed = healCastle(api, n);
          if (healed <= 0) return;
          api.consume('heal', healed);
          api.trigger({ amount: healed, targetId: ev.targetId });
        },
      },
    },
  },

  // 瀕死の覚醒：使用宣言時（支払の前）の城HPが最大HPの30%以下なら、手札からの攻撃魔法の基礎ダメージ+20%
  B05: {
    mods: {
      mpToHp: { order: 1, fn: (api, ctx) => declare(api, ctx) },
      hitBasePct(api, ctx) {
        const decl = currentDecl(api);
        if (!decl || !isHandAttackHit(api, ctx, decl)) return 0;
        if (!(decl.maxHp > 0) || decl.hp > decl.maxHp * (api.params.hpRatio ?? 0.3)) return 0;
        if (!decl.b05) {
          decl.b05 = true;
          api.trigger({ hp: decl.hp });
        }
        return api.params.damageRatio ?? 0.2;
      },
    },
  },

  // 血液貯蔵：任意支払で実消費した城HP1につき血気+1（最大8）。メイン行動中、血気3でMP1回復（各自ターン1回）
  B06: {
    on: {
      onHpPayment: {
        stage: 'resource',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || !(ev.amount > 0)) return;
          const got = api.gain('blood', ev.amount, { reason: 'hpPayment' });
          if (got > 0) api.trigger({ amount: got, debt: ev.debt });
        },
      },
    },
    actions: {
      B06: {
        label: '血液貯蔵（血気3でMP1）',
        check(api) {
          const p = api.player;
          if (p.mp >= api.game.maxMpOf(p)) return { ok: false, reason: 'MPが満タンです' };
          return { ok: true, cost: { blood: api.params.mpCost ?? 3 }, preview: { mp: api.params.mp ?? 1 } };
        },
        run(api) {
          return api.mp(api.params.mp ?? 1);
        },
      },
    },
  },

  // 血の解放（B06必須）：メイン行動中、血気を1〜4消費し、合法な敵兵士1体へ同量の固定ダメージ（会心不可）。各自ターン1回
  B07: {
    actions: {
      B07: {
        label: '血の解放（血気で固定ダメージ）',
        list(api) {
          const max = Math.min(api.params.max ?? 4, api.state.res.blood);
          const out = [];
          for (const { soldier } of enemySoldiers(api)) {
            for (let n = api.params.min ?? 1; n <= max; n++) out.push({ args: { soldierId: soldier.soldierId, amount: n }, label: `${soldier.soldierId} に ${n}` });
          }
          return out;
        },
        check(api, args) {
          const n = args.amount;
          const min = api.params.min ?? 1;
          const max = api.params.max ?? 4;
          if (!Number.isInteger(n) || n < min || n > max) return { ok: false, reason: `血気は${min}〜${max}で選んでください` };
          const t = enemySoldiers(api).find((x) => x.soldier.soldierId === args.soldierId);
          if (!t) return { ok: false, reason: '合法な敵兵士を選んでください' };
          return { ok: true, cost: { blood: n }, preview: { damage: n, soldierId: args.soldierId } };
        },
        run(api, args) {
          const t = enemySoldiers(api).find((x) => x.soldier.soldierId === args.soldierId);
          return { killed: api.fixedDamage(t.owner.id, t.soldier, args.amount, 'skillActive') };
        },
      },
    },
  },

  // 血の支配者（奥義・B01必須）：手札からの魔法の MP コストの一部または全部を城HPに置換（MP1=HP1。options.hpForMp で量、なければ不足分）。B01 の交換率を 1:1 に上書き
  B08: {
    mods: {
      mpToHp: { order: 10, fn: (api, ctx) => replaceMp(api, ctx, api.params.hpPerMp ?? 1, true) },
    },
    on: { onHpPayment: { stage: 'state', fn: countReplacement } },
  },
};
