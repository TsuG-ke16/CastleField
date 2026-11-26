// 手札系統（H）のハンドラ（段階C・skillC2）。
import { handRoom } from '../Cards.js';

const pileOf = (api) => api.game.pileOf(api.playerId);
const topIndexOf = (api, pred) => pileOf(api).deck.findIndex(pred);

/** メイン行動中の「山札の上から最初の○○を1枚引く」（H04・H05） */
function drawFirstAction(label, pred, emptyReason) {
  return {
    label,
    check(api) {
      if (handRoom(api.rt, api.playerId) <= 0) return { ok: false, reason: '手札がいっぱいです' };
      if (topIndexOf(api, pred) === -1) return { ok: false, reason: emptyReason };
      return { ok: true, cost: {} };
    },
    run(api) {
      const r = api.drawFirstMatching(pred);
      return r.ok ? { cardId: r.cardId } : r;
    },
  };
}

export default {
  // 開始手札から0〜2枚を戻すとき、先に引いてから戻したカードを山札へ混ぜる（マリガンの引き直しを置き換える。戻す枚数が0か3以上なら通常のマリガン）
  H01: {
    mulligan(api, { cards, drawn }) {
      const n = cards.length;
      if (n === 0 || n > (api.params.maxCards ?? 2) || !api.canUseMatch()) return false;
      const pile = pileOf(api);
      const hand = api.player.hand;
      for (let i = 0; i < n; i++) {
        const card = pile.deck.shift();
        if (!card) break;
        hand.push(card);
        drawn.push(card.cardId);
      }
      pile.deck.push(...cards);
      pile.deck = api.game.shuffle(pile.deck);
      // 山札が足りなくて引ききれなかったぶんは、混ぜたあとの山札から
      for (let i = drawn.length; i < n; i++) {
        const card = pile.deck.shift();
        if (!card) break;
        hand.push(card);
        drawn.push(card.cardId);
      }
      api.trigger({ returned: n, origin: 'system' });
      api.consumeMatch();
      return true;
    },
  },

  // 通常ドローしたカードを10%で一時コピー1枚（各自ターン1回）。コピーは手札の上限に従い、コピーからコピーは作らない
  H02: {
    on: {
      onDraw: {
        stage: 'extra',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || ev.kind !== 'normal' || !api.canUse()) return;
          if (handRoom(api.rt, api.playerId) <= 0) return;
          const drawn = ev.cardIds.map((id) => api.player.findInHand(id)).filter((c) => c && !c.skillCopy);
          if (drawn.length === 0) return;
          if (!api.roll(api.params.chance ?? 0.1)) return;
          const src = drawn.length === 1 ? drawn[0] : api.pick(drawn);
          const r = api.addCopy(src);
          if (!r.ok) return;
          api.trigger({ cardId: r.cardId, of: src.cardId });
          api.consume();
        },
      },
    },
  },

  // メイン行動中、捨て札のカード1枚を手札へ戻す（試合中1回）
  H03: {
    actions: {
      H03: {
        label: '再利用（捨て札から1枚）',
        list(api) {
          const seen = new Set();
          const out = [];
          for (const c of pileOf(api).discard) {
            if (seen.has(c.type)) continue;
            seen.add(c.type);
            out.push({ args: { cardId: c.cardId }, label: c.def.name ?? c.type, preview: { type: c.type } });
          }
          return out;
        },
        check(api, args) {
          if (handRoom(api.rt, api.playerId) <= 0) return { ok: false, reason: '手札がいっぱいです' };
          if (!pileOf(api).discard.some((c) => c.cardId === args?.cardId)) return { ok: false, reason: '捨て札にそのカードがありません' };
          return { ok: true, cost: {} };
        },
        run(api, args) {
          const r = api.recover(args.cardId);
          return r.ok ? { cardId: r.cardId } : r;
        },
      },
    },
  },

  // メイン行動中、山札の上から最初の兵士カードを1枚引く（試合中1回）
  H04: { actions: { H04: drawFirstAction('軍備調達（兵士を1枚）', (c) => c.isSoldier, '山札に兵士カードがありません') } },

  // メイン行動中、山札の上から最初の魔法カードを1枚引く（試合中1回）
  H05: { actions: { H05: drawFirstAction('魔導書（魔法を1枚）', (c) => c.isSpell && c.def.effect !== 'wild', '山札に魔法カードがありません') } },

  // 同一自ターンで手札から3枚目のカードを使うと1枚ドロー（各自ターン1回）
  H06: {
    on: {
      onCardPlayed: {
        stage: 'extra',
        fn(api, ev) {
          if (ev.ownerId !== api.playerId || api.game.currentPlayer !== api.playerId) return;
          if (ev.cardNumberThisTurn !== (api.params.nthCard ?? 3) || !api.canUse()) return;
          const r = api.drawExtra(api.params.draw ?? 1);
          if (!r.ok) return;
          api.trigger({ cardIds: r.cardIds });
          api.consume();
        },
      },
    },
  },

  // メイン行動中、手札1枚を捨てて1枚ドロー（各自ターン1回）
  H07: {
    actions: {
      H07: {
        label: '再編成（1枚捨てて1枚引く）',
        list(api) {
          return api.player.hand.map((c) => ({ args: { cardId: c.cardId }, label: c.def.name ?? c.type, preview: { type: c.type } }));
        },
        check(api, args) {
          const card = api.player.findInHand(args?.cardId);
          if (!card) return { ok: false, reason: '手札にそのカードがありません' };
          const pile = pileOf(api);
          if (pile.deck.length + pile.discard.length + (card.skillCopy ? 0 : 1) === 0) return { ok: false, reason: '引けるカードがありません' };
          return { ok: true, cost: {} };
        },
        run(api, args) {
          const card = api.player.takeFromHand(args.cardId);
          api.game.throwAway(api.playerId, card, { used: false });
          api.game.emit('cardDiscarded', { playerId: api.playerId, cardIds: [card.cardId] });
          const r = api.drawExtra(1);
          return { discarded: card.cardId, drawn: r.cardIds ?? [] };
        },
      },
    },
  },

  // メイン行動中、手札1枚を選び、山札の上から提示した最大3枚のうち1枚と交換（残りは元の順序。各自ターン1回）
  H08: {
    actions: {
      H08: {
        label: '運命操作（山札の上3枚から交換）',
        list(api) {
          const top = pileOf(api).deck.slice(0, api.params.reveal ?? 3);
          const out = [];
          for (const h of api.player.hand) {
            if (h.skillCopy) continue;
            top.forEach((d, index) => out.push({
              args: { handCardId: h.cardId, index },
              label: `${h.def.name ?? h.type} ⇄ ${d.def.name ?? d.type}`,
              preview: { reveal: top.map((x) => x.type), take: d.type },
            }));
          }
          return out;
        },
        check(api, args) {
          const hand = api.player.findInHand(args?.handCardId);
          if (!hand) return { ok: false, reason: '手札にそのカードがありません' };
          if (hand.skillCopy) return { ok: false, reason: '一時コピーは山札に入れられません' };
          const n = Math.min(api.params.reveal ?? 3, pileOf(api).deck.length);
          if (n === 0) return { ok: false, reason: '山札がありません' };
          if (!Number.isInteger(args?.index) || args.index < 0 || args.index >= n) return { ok: false, reason: `提示された${n}枚から選んでください` };
          return { ok: true, cost: {}, preview: { reveal: pileOf(api).deck.slice(0, n).map((x) => x.type) } };
        },
        run(api, args) {
          const deck = pileOf(api).deck;
          const hand = api.player.takeFromHand(args.handCardId);
          const [picked] = deck.splice(args.index, 1, hand); // 残りの順序は変えず、手札のカードが同じ位置に入る
          api.player.hand.push(picked);
          api.rt.withDrawKind('swap', api.skillId, api.ev, () => api.game.emit('cardDrawn', { playerId: api.playerId, cardIds: [picked.cardId] }));
          return { took: picked.cardId, put: hand.cardId };
        },
      },
    },
  },
};
