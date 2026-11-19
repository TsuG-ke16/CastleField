// ゲーム内通貨（無料コイン）・ショップ・ガチャ・所持品・装備。サーバーが唯一の正しい情報源。
// - 通貨の増減は、必ずトランザクションの中で、coin_ledger に記録する。(ユーザー, 通貨, 理由, 参照) が1つしかないので、同じ報酬は二重に付かない
// - 価格・確率・景品は data/shop.json・data/gacha.json（サーバーが読む）。クライアントは itemId と数だけを送る
// - 景品はすべて見た目だけ。ランクマッチの勝敗には影響しない
// - 無料コイン（free_coins）と交換ポイント（exchange_points）は別の列。将来の有料通貨は、さらに別の列にして混ぜない
import { randomInt as cryptoRandomInt, randomUUID } from 'node:crypto';
import { AccountError } from './accounts.js';

const CURRENCIES = { free_coins: 'free_coins', exchange_points: 'exchange_points' };
const DAY = 24 * 60 * 60 * 1000;

export class Economy {
  constructor({ db, catalog, gacha, now = () => Date.now(), randomInt = cryptoRandomInt, matchCoins = { base: 10, win: 10, cpuMultiplier: 0.5, dailyCap: 300 } }) {
    Object.assign(this, { db, catalog, gacha, now, randomInt, matchCoins });
    this.items = catalog.items;
    for (const [id, it] of Object.entries(this.items)) {
      if (!Object.hasOwn(catalog.slots, it.slot)) throw new Error(`shop.json: ${id} の slot が正しくありません`);
      if (!catalog.rarities.includes(it.rarity)) throw new Error(`shop.json: ${id} の rarity が正しくありません`);
    }
  }

  // ---- 通貨 ----
  balance(userId) {
    const r = this.db.get('SELECT free_coins, exchange_points FROM wallets WHERE user_id = ?', userId);
    return { coins: r?.free_coins ?? 0, points: r?.exchange_points ?? 0 };
  }

  /** 増やす。同じ (理由, 参照) は1回だけ。増やしたら新しい残高、すでに記録済みなら null */
  credit(userId, amount, reason, ref, currency = 'free_coins') {
    if (!Number.isInteger(amount) || amount <= 0 || !Object.hasOwn(CURRENCIES, currency)) throw new AccountError('金額が正しくありません');
    return this.db.tx(() => {
      const before = this.db.get(`SELECT ${currency} AS v FROM wallets WHERE user_id = ?`, userId)?.v ?? 0;
      const ins = this.db.run('INSERT OR IGNORE INTO coin_ledger (user_id, currency, delta, reason, ref, balance_after, at) VALUES (?, ?, ?, ?, ?, ?, ?)', userId, currency, amount, reason, String(ref), before + amount, this.now());
      if (!ins.changes) return null;
      this.db.run(`INSERT INTO wallets (user_id, ${currency}) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET ${currency} = ${currency} + excluded.${currency}`, userId, amount);
      return before + amount;
    });
  }

  /** 減らす。足りなければ失敗（マイナスにならない）。同じ (理由, 参照) は1回だけ */
  debit(userId, amount, reason, ref, currency = 'free_coins') {
    if (!Number.isInteger(amount) || amount <= 0 || !Object.hasOwn(CURRENCIES, currency)) throw new AccountError('金額が正しくありません');
    return this.db.tx(() => {
      const before = this.db.get(`SELECT ${currency} AS v FROM wallets WHERE user_id = ?`, userId)?.v ?? 0;
      if (before < amount) throw new AccountError(currency === 'free_coins' ? 'コインが足りません' : '交換ポイントが足りません', 409, { code: 'insufficient', need: amount, have: before });
      const ins = this.db.run('INSERT OR IGNORE INTO coin_ledger (user_id, currency, delta, reason, ref, balance_after, at) VALUES (?, ?, ?, ?, ?, ?, ?)', userId, currency, -amount, reason, String(ref), before - amount, this.now());
      if (!ins.changes) throw new AccountError('この操作はもう済んでいます', 409);
      this.db.run(`UPDATE wallets SET ${currency} = ${currency} - ? WHERE user_id = ?`, amount, userId);
      return before - amount;
    });
  }

  /** 対戦の報酬（サーバーが確定した試合の結果から）。1日の上限があり、同じ試合は1回だけ */
  awardMatch(userId, matchId, raw) {
    const c = this.matchCoins;
    const dayStart = this.now() - (this.now() % DAY);
    const today = this.db.get("SELECT COALESCE(SUM(delta), 0) AS n FROM coin_ledger WHERE user_id = ? AND reason = 'match' AND at >= ?", userId, dayStart).n;
    const grant = Math.max(0, Math.min(raw, c.dailyCap - today));
    if (grant <= 0) return 0;
    return this.credit(userId, grant, 'match', matchId) == null ? 0 : grant;
  }

  ledger(userId, limit = 30) {
    return this.db.all('SELECT currency, delta, reason, balance_after, at FROM coin_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?', userId, Math.max(1, Math.min(100, limit)));
  }

  // ---- 景品・所持品 ----
  item(id) { return typeof id === 'string' && Object.hasOwn(this.items, id) ? { id, ...this.items[id] } : null; }
  owns(userId, itemId) { return !!this.db.get('SELECT 1 AS x FROM inventory WHERE user_id = ? AND item_id = ?', userId, itemId); }
  ownedIds(userId) { return this.db.all('SELECT item_id FROM inventory WHERE user_id = ? ORDER BY acquired_at, item_id', userId).map((r) => r.item_id).filter((id) => this.items[id]); }
  grant(userId, itemId, source) {
    const r = this.db.run('INSERT OR IGNORE INTO inventory (user_id, item_id, source, acquired_at) VALUES (?, ?, ?, ?)', userId, itemId, source, this.now());
    return r.changes > 0;
  }

  equippedOf(userId, world = this.catalog.world) {
    const out = {};
    for (const r of this.db.all('SELECT slot, item_id FROM equipped WHERE user_id = ? AND world = ?', userId, world)) {
      if (this.items[r.item_id] && this.owns(userId, r.item_id)) out[r.slot] = r.item_id; // 持っていない・なくなった景品は、標準の見た目にもどる
    }
    return out;
  }
  /** 対戦の画面に渡す（相手にも見える）。見た目だけの景品の id */
  cosmeticsOf(userId) { const e = this.equippedOf(userId); delete e.icon; delete e.title; return e; }

  equip(userId, slot, itemId, world = this.catalog.world) {
    if (!Object.hasOwn(this.catalog.slots, slot)) throw new AccountError('そこには装備できません');
    if (itemId == null) { this.db.run('DELETE FROM equipped WHERE user_id = ? AND world = ? AND slot = ?', userId, world, slot); return this.equippedOf(userId, world); }
    const it = this.item(itemId);
    if (!it || it.slot !== slot || (it.world !== world && it.world !== 'all')) throw new AccountError('そこには装備できません');
    if (!this.owns(userId, itemId)) throw new AccountError('持っていないアイテムです', 403);
    this.db.run(`INSERT INTO equipped (user_id, world, slot, item_id) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, world, slot) DO UPDATE SET item_id = excluded.item_id`, userId, world, slot, itemId);
    return this.equippedOf(userId, world);
  }

  // ---- ショップ ----
  shop(userId) {
    const owned = new Set(this.ownedIds(userId));
    const eq = Object.values(this.equippedOf(userId));
    return {
      ...this.balance(userId), slots: this.catalog.slots,
      items: Object.keys(this.items).map((id) => ({ ...this.item(id), owned: owned.has(id), equipped: eq.includes(id), buyable: this.items[id].price != null })),
    };
  }

  buy(userId, itemId) {
    const it = this.item(itemId);
    if (!it) throw new AccountError('そのアイテムはありません', 404);
    if (it.price == null) throw new AccountError('このアイテムは、ガチャか交換で手に入ります', 409);
    return this.db.tx(() => {
      if (this.owns(userId, itemId)) throw new AccountError('もう持っています', 409);
      const coins = this.debit(userId, it.price, 'shop', itemId); // 足りなければここで失敗して、何も変わらない
      this.grant(userId, itemId, 'shop');
      return { item: it, coins };
    });
  }

  // ---- ガチャ ----
  banner(id) {
    const b = typeof id === 'string' && Object.hasOwn(this.gacha.banners, id) ? this.gacha.banners[id] : null;
    if (!b) throw new AccountError('そのガチャはありません', 404);
    return b;
  }
  pool(b) { return Object.keys(this.items).filter((id) => this.items[id].gacha || b.includePriced).filter((id) => this.items[id].world === b.world || this.items[id].world === 'all'); }
  poolByRarity(b) {
    const by = Object.fromEntries(this.catalog.rarities.map((r) => [r, []]));
    for (const id of this.pool(b)) by[this.items[id].rarity].push(id);
    return by;
  }

  /** 排出率（画面に出す）。レアリティごとの割合と、景品ごとの確率 */
  gachaInfo(userId, bannerId = 'standard') {
    const b = this.banner(bannerId);
    const by = this.poolByRarity(b);
    const rates = this.effectiveRates(b, by);
    const st = this.db.get('SELECT since_epic, pulls_total FROM gacha_state WHERE user_id = ? AND banner_id = ?', userId, bannerId) ?? { since_epic: 0, pulls_total: 0 };
    const owned = new Set(this.ownedIds(userId));
    return {
      banner: { id: bannerId, name: b.name, costSingle: b.costSingle, costTen: b.costTen }, ...this.balance(userId),
      rates: Object.fromEntries(Object.entries(rates).map(([r, v]) => [r, Math.round(v * 1000) / 1000])),
      items: Object.entries(by).flatMap(([r, ids]) => ids.map((id) => ({ ...this.item(id), probability: Math.round((rates[r] / ids.length) * 10000) / 10000, owned: owned.has(id) }))),
      pity: { sinceEpic: st.since_epic, epicAt: b.pity.epicAt, pullsTotal: st.pulls_total, tenGuarantee: b.pity.tenGuaranteeRarity },
      duplicatePoints: this.gacha.duplicatePoints, exchangeCost: this.gacha.exchangeCost,
    };
  }

  /** 景品のないレアリティの割合は、あるレアリティに比例して配りなおす（合計はいつも100） */
  effectiveRates(b, by) {
    const live = Object.entries(b.rates).filter(([r]) => (by[r] ?? []).length > 0);
    const total = live.reduce((a, [, v]) => a + v, 0);
    return Object.fromEntries(live.map(([r, v]) => [r, (v / total) * 100]));
  }

  roll(weights) {
    const entries = Object.entries(weights);
    const total = entries.reduce((a, [, v]) => a + Math.round(v * 10000), 0);
    let x = this.randomInt(total);
    for (const [k, v] of entries) { x -= Math.round(v * 10000); if (x < 0) return k; }
    return entries.at(-1)[0];
  }

  /** ガチャを回す。コインの消費・景品の付与・履歴・救済の数え直しを、1つのトランザクションで */
  pull(userId, bannerId, count) {
    const b = this.banner(bannerId);
    if (count !== 1 && count !== 10) throw new AccountError('1回か10連で回せます');
    const cost = count === 1 ? b.costSingle : b.costTen;
    return this.db.tx(() => {
      const group = randomUUID();
      const by = this.poolByRarity(b);
      const rates = this.effectiveRates(b, by);
      const order = this.catalog.rarities;
      const epicIdx = order.indexOf('epic');
      const minTen = order.indexOf(b.pity.tenGuaranteeRarity);
      const coins = this.debit(userId, cost, 'gacha', group);
      let st = this.db.get('SELECT since_epic FROM gacha_state WHERE user_id = ? AND banner_id = ?', userId, bannerId);
      let since = st?.since_epic ?? 0;
      const results = [];
      const got = new Set();
      for (let i = 0; i < count; i++) {
        let rarity = this.roll(rates);
        const upTo = (min) => Object.fromEntries(Object.entries(rates).filter(([r]) => order.indexOf(r) >= min));
        if (since + 1 >= b.pity.epicAt && order.indexOf(rarity) < epicIdx) rarity = this.roll(upTo(epicIdx)); // 救済：一定回数、epic 以上が出ていなければ確定
        if (count === 10 && i === 9 && !results.some((x) => order.indexOf(x.rarity) >= minTen) && order.indexOf(rarity) < minTen) rarity = this.roll(upTo(minTen)); // 10連：1つは rare 以上
        since = order.indexOf(rarity) >= epicIdx ? 0 : since + 1;
        const ids = by[rarity];
        const itemId = ids[this.randomInt(ids.length)];
        const duplicate = got.has(itemId) || this.owns(userId, itemId);
        let points = 0;
        if (duplicate) {
          points = this.gacha.duplicatePoints[rarity] ?? 0;
          if (points > 0) this.credit(userId, points, 'gachaDuplicate', `${group}:${i}`, 'exchange_points'); // 持っている景品は失わず、交換ポイントになる
        } else { this.grant(userId, itemId, 'gacha'); got.add(itemId); }
        this.db.run('INSERT INTO gacha_pulls (user_id, banner_id, pull_group, item_id, rarity, duplicate, points_gained, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', userId, bannerId, group, itemId, rarity, +duplicate, points, this.now());
        results.push({ itemId, rarity, duplicate, pointsGained: points, item: this.item(itemId) });
      }
      this.db.run(`INSERT INTO gacha_state (user_id, banner_id, since_epic, pulls_total) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, banner_id) DO UPDATE SET since_epic = excluded.since_epic, pulls_total = pulls_total + ?`, userId, bannerId, since, count, count);
      void coins;
      return { results, ...this.balance(userId), pity: { sinceEpic: since, epicAt: b.pity.epicAt } };
    });
  }

  /** 交換ポイントで、持っていないガチャの景品を選んで手に入れる */
  exchange(userId, itemId, bannerId = 'standard') {
    const b = this.banner(bannerId);
    const it = this.item(itemId);
    if (!it || !this.pool(b).includes(itemId)) throw new AccountError('そのアイテムは交換できません', 404);
    return this.db.tx(() => {
      if (this.owns(userId, itemId)) throw new AccountError('もう持っています', 409);
      const cost = this.gacha.exchangeCost[it.rarity];
      const points = this.debit(userId, cost, 'exchange', itemId, 'exchange_points');
      this.grant(userId, itemId, 'exchange');
      return { item: it, points };
    });
  }

  history(userId, limit = 30) {
    return this.db.all('SELECT banner_id, pull_group, item_id, rarity, duplicate, points_gained, at FROM gacha_pulls WHERE user_id = ? ORDER BY id DESC LIMIT ?', userId, Math.max(1, Math.min(100, limit)))
      .map((r) => ({ bannerId: r.banner_id, group: r.pull_group, itemId: r.item_id, name: this.items[r.item_id]?.name ?? r.item_id, rarity: r.rarity, duplicate: !!r.duplicate, pointsGained: r.points_gained, at: r.at }));
  }
}
