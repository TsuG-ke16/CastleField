// 模倣系統（I）のハンドラ（段階C・skillC2）。
// 敵の手札使用は onEnemyCardPlayed（ownerId＝自分、enemyId＝使った人。相手の手札の中身は見えない）。
// 一時コピーは Cards.addCopy（card.skillCopy.skillId で I02/I03 のコピーと分かる。コピーからコピーは作らない）。
import { handRoom } from '../Cards.js';
import { canSummon } from '../Units.js';
import { isAttackSpell, isHealSpell, isSingleAttackSpell, isImitationCard, setPeek, enemySoldiers } from '../c2util.js';

/** 敵が手札から使った（コピーでない）カードのコピーを自分の手札へ（I02・I03 共通） */
function copyEnemyCard(api, ev, accept) {
  if (ev.ownerId !== api.playerId || ev.copy || !accept(api.game.cardDefs[ev.cardType] ?? {})) return;
  if (!api.canUse() || handRoom(api.rt, api.playerId) <= 0) return;
  if (!api.roll(api.params.chance)) return;
  const r = api.addCopy(ev.cardType);
  if (!r.ok) return;
  api.trigger({ cardType: ev.cardType, cardId: r.cardId, enemyId: ev.enemyId });
  api.consume();
}

export default {
  // メイン行動中、相手が次に通常ドローする山札先頭1枚を自分だけ確認（各自ターン1回）
  I01: {
    actions: {
      I01: {
        label: '盗み見（相手の次のドローを確認）',
        check(api) {
          const foe = api.game.opponentsOf(api.playerId)[0];
          if (!foe) return { ok: false, reason: '相手がいません' };
          if (api.game.pileOf(foe.id).deck.length === 0) return { ok: false, reason: '山札の先頭がありません（次のドローで捨て札が山札になります）' };
          return { ok: true, cost: {} };
        },
        run(api) {
          const foe = api.game.opponentsOf(api.playerId)[0];
          const top = api.game.pileOf(foe.id).deck[0]; // 共有山札ならこの時点の先頭
          setPeek(api.state, 'I01', { turn: api.game.turn, ownerId: foe.id, cardId: top.cardId, type: top.type });
          return { type: top.type };
        },
      },
    },
  },

  // 敵が手札から使った単体攻撃魔法を15%で一時コピーとして手札へ（各自ターン1回）
  I02: { on: { onEnemyCardPlayed: { stage: 'extra', fn: (api, ev) => copyEnemyCard(api, ev, isSingleAttackSpell) } } },

  // 敵の手札由来の兵士出撃後20%でその兵士カードの一時コピーを手札へ（各自ターン1回）
  I03: { on: { onEnemyCardPlayed: { stage: 'extra', fn: (api, ev) => copyEnemyCard(api, ev, (def) => def.kind === 'soldier') } } },

  // 自身の模倣由来カード（I02・I03 のコピー）の使用MP-1（最低1）。乱数なし：見積もりにも効く
  I04: {
    mods: {
      mpCost(api, ctx) {
        if (!isImitationCard(ctx.card)) return;
        const min = api.params.mpMin ?? 1;
        if (ctx.cost <= min) return;
        ctx.cost = Math.max(min, ctx.cost - (api.params.mpReduce ?? 1));
        if (!ctx.preview) api.trigger({ cardId: ctx.card.cardId, cost: ctx.cost });
      },
    },
  },

  // 敵が手札から攻撃魔法を使った後、次の自身の攻撃魔法の基礎ダメージ+1（各自ターン1回付与・非累積）
  I05: {
    on: {
      onEnemyCardPlayed: {
        stage: 'extra',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || !isAttackSpell(api.game.cardDefs[ev.cardType]) || !api.canUse()) return;
          api.state.vars.I05 = { armed: true, cardId: null }; // 非累積：すでにあっても同じ
          api.consume();
        },
      },
    },
    mods: {
      hitBaseAdd(api, ctx) {
        const v = api.state.vars.I05;
        if (!v || ctx.origin !== 'hand') return 0;
        if (ctx.kind === 'spell' && !ctx.enemy) return 0;
        if (ctx.kind !== 'spell' && !(ctx.kind === 'castle' && ctx.source?.kind === 'spell')) return 0;
        const cardId = ctx.cardId ?? api.rt.handCard?.cardId;
        if (v.cardId === null) v.cardId = cardId; // 次の攻撃魔法1枚（複数の対象に当たるときは全部に乗る）
        if (v.cardId !== cardId) {
          delete api.state.vars.I05;
          return 0;
        }
        if (!api.trigger({ cardId })) return 0;
        return api.params.damage ?? 1;
      },
    },
  },

  // 敵が手札から回復魔法を使った後、次の自身の手札からの回復魔法の回復量+2（各自ターン1回付与）
  I06: {
    on: {
      onEnemyCardPlayed: {
        stage: 'extra',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || !isHealSpell(api.game.cardDefs[ev.cardType]) || !api.canUse()) return;
          api.state.vars.I06 = true;
          api.consume();
        },
      },
    },
    mods: {
      healAmount(api, ctx) {
        if (!api.state.vars.I06 || ctx.origin !== 'hand') return;
        delete api.state.vars.I06;
        ctx.amount += api.params.heal ?? 2;
        api.trigger({ cardType: ctx.card?.type });
      },
    },
  },

  // 敵が手札から3枚のカードを使用したら、自身の次の自ターン開始に1枚追加ドロー（各自ターン1回）
  I07: {
    on: {
      onEnemyCardPlayed: {
        stage: 'extra',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || ev.cardNumberThisTurn !== (api.params.cardsNeeded ?? 3) || !api.canUse()) return;
          api.state.vars.I07 = 1; // 非累積（予約は1件）
          api.consume();
        },
      },
      onTurnStart: {
        stage: 'extra',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || !api.state.vars.I07) return;
          api.state.vars.I07 = 0;
          const r = api.drawExtra(api.params.draw ?? 1);
          if (r.ok) api.trigger({ cardIds: r.cardIds });
        },
      },
    },
  },

  // メイン行動中、敵兵士1体の弱体トークンを自陣の合法枠に召喚（試合中1回・固有能力なし）
  I08: {
    actions: {
      I08: {
        label: '鏡像（敵兵士の弱体トークン）',
        list(api) {
          const seen = new Set();
          const out = [];
          for (const { soldier } of enemySoldiers(api.game, api.playerId)) {
            const def = api.game.cardDefs[soldier.type];
            if (soldier.skillToken || def?.hp === undefined) continue;
            if (seen.has(soldier.type)) continue; // 同じ種類は同じトークンになる
            seen.add(soldier.type);
            out.push({ args: { targetId: soldier.soldierId }, label: def.name ?? soldier.type, preview: { type: soldier.type } });
          }
          return out;
        },
        check(api, args) {
          const found = enemySoldiers(api.game, api.playerId).find((x) => x.soldier.soldierId === args?.targetId);
          if (!found || found.soldier.skillToken || api.game.cardDefs[found.soldier.type]?.hp === undefined) return { ok: false, reason: '元にできる敵兵士を選んでください' };
          const can = canSummon(api.rt, api.playerId);
          if (!can.ok) return { ok: false, reason: can.reason };
          return { ok: true, cost: {}, preview: { type: found.soldier.type } };
        },
        run(api, args) {
          const found = enemySoldiers(api.game, api.playerId).find((x) => x.soldier.soldierId === args.targetId);
          const r = api.summonToken({ kind: 'weak', fromType: found.soldier.type });
          return r.ok ? { soldierId: r.soldier.soldierId } : r;
        },
      },
    },
  },
};
