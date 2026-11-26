// 系統 S（状態異常）の効果ハンドラ。毒・やけどはクラシックの既存の状態、出血はスキル専用の最小定義（Runtime.applyBleed。soldier.skillBleed）。
// 付与元は Runtime の statusSource（statusApplied のときの文脈の人）で追う。「自身由来」＝付与元が自分。
import { ownHarm, applyPoison, applyBurn, isEnemySide, enemySoldiers } from '../helpers-c4.js';

const foesOf = (api, list) => list.filter((x) => isEnemySide(api.game, x.owner.id, api.playerId));

export default {
  // 感染：自分由来の有害状態を持つ敵兵士が死ぬと、隣接する敵兵士1体へ解除できる状態1種（毒→やけど→出血の順）を残り1ターンで移す（各自ターン1回）
  S01: {
    on: {
      onUnitDeath(api, ev) {
        if (ev.ownerId === api.playerId || !isEnemySide(api.game, ev.ownerId, api.playerId) || !api.canUse()) return;
        const snap = ev.snapshot;
        const src = snap.statusSources ?? {};
        let status = null;
        if (snap.poison && src.poison === api.playerId) status = 'poison';
        else if (snap.burn && src.burn === api.playerId) status = 'burn';
        else if (snap.bleed && (snap.bleed.sourceId ?? src.bleed) === api.playerId) status = 'bleed';
        if (!status) return;
        const cands = foesOf(api, api.adjacentSoldiers(snap, { side: ev.ownerId })).filter((x) => x.owner.id !== api.playerId);
        const target = api.pick(cands);
        if (!target || !api.trigger({ status, targetId: target.soldier.soldierId })) return;
        api.consume();
        const turns = api.params.turns ?? 1;
        api.as('chain', () => {
          if (status === 'poison') applyPoison(api, target.owner, target.soldier, { amount: snap.poison.amount, turns });
          else if (status === 'burn') applyBurn(api, target.owner, target.soldier, { amount: snap.burn.amount, turns });
          else api.bleed(target.owner.id, target.soldier, turns, snap.bleed.amount);
        });
      },
    },
  },

  // 重症化：自分由来の異なる有害状態が2種以上になった敵兵士に固定2ダメージ（対象ごと各自ターン1回）
  S02: {
    on: {
      onStatusApplied(api, ev) {
        if (ev.ownerId !== api.playerId || !isEnemySide(api.game, ev.victimOwnerId, api.playerId)) return;
        const found = api.findSoldier(ev.targetId);
        if (!found) return;
        const kinds = new Set(ownHarm(api.rt, found.soldier, api.playerId).map((x) => x.status));
        const key = `t:${ev.targetId}`;
        if (kinds.size < (api.params.statusCount ?? 2) || !api.canUse(key, 1)) return;
        if (!api.trigger({ targetId: ev.targetId, kinds: kinds.size })) return;
        api.consume(key);
        api.fixedDamage(found.owner.id, found.soldier, api.params.damage ?? 2, 'chain');
      },
    },
  },

  // 毒の刃：自分の手札の攻撃魔法が敵兵士に命中し生き残ると15%で毒2ターンを付与（各自ターン1回）
  S03: {
    on: {
      onAttackResolve(api, ev) {
        if (ev.ownerId !== api.playerId || !ev.enemy || ev.hitKind !== 'spell' || ev.origin !== 'hand' || ev.isExtra || ev.killed || !api.canUse()) return;
        const found = api.findSoldier(ev.targetId);
        if (!found || !api.roll(api.params.chance ?? 0.15)) return;
        if (!api.trigger({ targetId: ev.targetId })) return;
        api.as('hand', () => applyPoison(api, found.owner, found.soldier, { amount: 1, turns: api.params.turns ?? 2 }));
        api.consume();
      },
    },
  },

  // 傷口の拡大：自分の出血 tick の基礎ダメージ+1
  S04: {
    mods: {
      dotAmount(api, ctx) {
        if (ctx.status === 'bleed') ctx.amount += api.params.damage ?? 1;
      },
    },
  },

  // 燃え広がる炎：自分のやけど tick 時20%で隣接する敵兵士1体にやけど1ターン（各自ターン1回）
  S05: {
    on: {
      onStatusTick(api, ev) {
        if (ev.ownerId !== api.playerId || ev.status !== 'burn' || !api.canUse()) return;
        const found = api.findSoldier(ev.targetId);
        if (!found) return;
        const cands = foesOf(api, api.adjacentSoldiers(found.soldier));
        const target = api.pick(cands);
        if (!target || !api.roll(api.params.chance ?? 0.2) || !api.trigger({ targetId: target.soldier.soldierId })) return;
        api.consume();
        api.as('chain', () => applyBurn(api, target.owner, target.soldier, { amount: found.soldier.burn?.amount ?? 1, turns: api.params.turns ?? 1 }));
      },
    },
  },

  // 衰弱の刻印：自分が付与した有害状態を持つ敵兵士への直接攻撃+1（状態の数で重複しない）
  S06: {
    mods: {
      hitBaseAdd(api, ctx) {
        if (!ctx.victim || !ctx.enemy || !ctx.direct) return 0;
        return ownHarm(api.rt, ctx.victim, api.playerId).length > 0 ? api.params.damage ?? 1 : 0;
      },
    },
  },

  // 苦痛の回収：自分の有害状態ダメージで敵兵士を倒すとMP+1（各自ターン1回）
  S07: {
    on: {
      onStatusTick: { stage: 'resource', fn(api, ev) {
        if (ev.ownerId !== api.playerId || !(ev.hp <= 0) || !isEnemySide(api.game, ev.victimOwnerId, api.playerId) || !api.canUse()) return;
        if (api.mp(api.params.mp ?? 1) > 0 && api.trigger({ targetId: ev.targetId })) api.consume();
      } },
    },
  },

  // 奥義：疫病。メイン行動中、自分が敵兵士1体に付与した毒・出血の残りtick相当の基礎ダメージを最大8まで即時精算し、該当状態を消費（各自ターン1回）。
  // 永続の毒（turns null）は8tick分とみなす。盾は効かない（tick と同じ）
  S08: {
    actions: {
      S08: {
        label: '疫病',
        list: (api) => enemySoldiers(api).filter((x) => plague(api, x.soldier).total > 0).map((x) => ({ args: { soldierId: x.soldier.soldierId }, label: `${x.soldier.soldierId}（${x.soldier.type}）` })),
        check(api, args) {
          const found = api.findSoldier(args.soldierId);
          if (!found || !isEnemySide(api.game, found.owner.id, api.playerId)) return { ok: false, reason: '敵兵士を指定してください' };
          const p = plague(api, found.soldier);
          if (p.total <= 0) return { ok: false, reason: '自分が付与した毒・出血がありません' };
          return { ok: true, cost: {}, preview: `即時ダメージ ${p.damage}（毒・出血を消費）` };
        },
        run(api, args) {
          const found = api.findSoldier(args.soldierId);
          const p = plague(api, found.soldier);
          const { owner, soldier } = found;
          api.as('dot', () => {
            if (p.poison) {
              soldier.poison = null;
              api.game.emit('statusCleared', { playerId: owner.id, soldierId: soldier.soldierId, status: 'poison' });
            }
            if (p.bleed) {
              soldier.skillBleed = null;
              api.game.emit('statusCleared', { playerId: owner.id, soldierId: soldier.soldierId, status: 'bleed' });
            }
            soldier.takeDamage(p.damage, { ignoreShield: true });
            api.game.emit('soldierDamaged', { playerId: owner.id, soldierId: soldier.soldierId, amount: p.damage, hp: soldier.hp, cause: 'plague', blocked: 0 });
            if (soldier.isDead) api.game.removeSoldier(owner, soldier, 'killed');
          });
          api.game.checkGameOver();
          return { damage: p.damage };
        },
      },
    },
  },
};

/** 疫病の精算量（自分由来の毒・出血の残り tick の基礎ダメージの合計。最大 params.max） */
function plague(api, soldier) {
  const max = api.params.max ?? 8;
  const mine = ownHarm(api.rt, soldier, api.playerId);
  const poison = mine.some((x) => x.status === 'poison');
  const bleed = mine.some((x) => x.status === 'bleed');
  let total = 0;
  if (poison) total += soldier.poison.amount * (soldier.poison.turns === null ? max : Math.max(0, soldier.poison.turns));
  if (bleed) total += soldier.skillBleed.amount * Math.max(0, soldier.skillBleed.turns);
  return { poison, bleed, total, damage: Math.min(max, total) };
}
