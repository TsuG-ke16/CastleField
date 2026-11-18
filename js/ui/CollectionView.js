// ショップ・ガチャ・所持品（装備）の画面。価格・確率・景品はサーバーの値を表示するだけ（ここで残高や景品を変えることはできない）。
// 景品はすべて見た目だけで、ランクマッチの勝敗には影響しない。名前などは textContent で入れる。
import { account } from './Account.js';
import { itemPreview } from './Cosmetics.js';

const RARITY_NAME = { common: 'コモン', uncommon: 'アンコモン', rare: 'レア', epic: 'エピック', legendary: 'レジェンド' };
const SLOT_ORDER = ['unit', 'castle', 'cardBack', 'attackFx', 'winFx', 'icon', 'title'];
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export class CollectionView {
  /** @param {object} o  @param {() => void} o.onEquipChanged 装備が変わった（盤面の見た目を更新する）  @param {() => void} o.onBalance 残高が変わった */
  constructor({ toast = () => {}, onEquipChanged = () => {}, onBalance = () => {}, reducedMotion = () => false } = {}) {
    Object.assign(this, { toast, onEquipChanged, onBalance, reducedMotion });
    this.tab = 'shop';
    this.slot = 'unit';
    const box = this.box = document.createElement('div');
    box.id = 'collection'; box.className = 'screen dim'; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'collection-title');
    box.innerHTML = `<div class="screen-box parchment collection-box">
      <header class="collection-head"><h2 id="collection-title">ショップ</h2>
        <span class="collection-wallet" data-part="wallet" aria-live="polite"></span></header>
      <div class="social-tabs collection-tabs" role="tablist" data-part="tabs"></div>
      <div class="collection-slots" role="tablist" data-part="slots"></div>
      <div class="collection-body" data-part="body"></div>
      <p class="collection-msg" data-part="msg" role="status"></p>
      <button type="button" class="plank-btn collection-close">閉じる</button>
    </div>`;
    document.getElementById('app').append(box);
    this.part = (n) => box.querySelector(`[data-part="${n}"]`);
    box.querySelector('.collection-close').addEventListener('click', () => this.close());
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const r = this.part('body').querySelector('.gacha-reveal'); if (r) r.remove(); else this.close(); } });
    box.addEventListener('click', (e) => this.onClick(e));
  }

  async open(tab = 'shop') {
    this.tab = tab; this.say('');
    this.box.hidden = false;
    this.box.querySelector('.collection-close').focus({ preventScroll: true });
    await this.load();
  }
  close() { this.box.hidden = true; }
  say(t, bad = false) { const m = this.part('msg'); m.textContent = t; m.classList.toggle('bad', bad); }

  async call(method, path, body) {
    const r = await account.api(method, path, body);
    if (!r.json?.ok) { this.say(r.json?.reason ?? 'サーバーにつながりません', true); return null; }
    return r.json;
  }

  async load() {
    this.part('body').replaceChildren(el('p', 'collection-empty', '読み込み中…'));
    const [shop, gacha] = await Promise.all([this.call('GET', '/api/shop'), this.call('GET', '/api/gacha/info')]);
    if (!shop || !gacha) { this.part('body').replaceChildren(el('p', 'collection-empty', '読み込めませんでした。つながってから、もう一度開いてください')); return; }
    this.shop = shop; this.gacha = gacha;
    this.render();
  }

  render() {
    const titles = { shop: 'ショップ', gacha: 'ガチャ', collection: 'スキン・所持品' };
    this.box.querySelector('h2').textContent = titles[this.tab];
    const w = this.part('wallet'); w.replaceChildren();
    const coin = el('span', 'collection-coin'); const ci = new Image(); ci.src = 'assets/ui/icon-coin.png'; ci.alt = 'コイン'; ci.width = 20; ci.height = 20;
    coin.append(ci, el('b', null, String(this.shop.coins)));
    w.append(coin);
    if (this.tab !== 'shop') w.append(el('span', 'collection-points', `交換ポイント ${this.shop.points}`));
    const tabs = this.part('tabs'); tabs.replaceChildren();
    for (const [id, label] of [['shop', 'ショップ'], ['gacha', 'ガチャ'], ['collection', '所持品']]) {
      const t = el('button', 'social-tab raw-btn', label); t.type = 'button'; t.dataset.tab = id; t.setAttribute('role', 'tab'); t.setAttribute('aria-selected', String(this.tab === id)); tabs.append(t);
    }
    const slots = this.part('slots'); slots.replaceChildren();
    slots.hidden = this.tab === 'gacha';
    for (const s of SLOT_ORDER) {
      const b = el('button', 'collection-slot raw-btn', this.shop.slots[s]); b.type = 'button'; b.dataset.slot = s; b.setAttribute('aria-selected', String(this.slot === s)); slots.append(b);
    }
    const body = this.part('body'); body.replaceChildren();
    ({ shop: () => this.renderShop(body), gacha: () => this.renderGacha(body), collection: () => this.renderCollection(body) })[this.tab]();
  }

  rarityBadge(r) { const b = el('em', `rarity-tag r-${r}`, RARITY_NAME[r] ?? r); return b; }

  card(it, { action, label, disabled, note }) {
    const c = el('div', `item-card r-${it.rarity}${it.owned ? ' owned' : ''}`);
    c.append(itemPreview(it), this.rarityBadge(it.rarity), el('strong', 'item-name', it.name), el('small', 'item-desc', it.desc ?? ''));
    if (note) c.append(el('small', 'item-note', note));
    if (action) { const b = el('button', 'small-btn item-act', label); b.type = 'button'; b.dataset.act = action; b.dataset.id = it.id; b.disabled = !!disabled; c.append(b); }
    return c;
  }

  renderShop(body) {
    const items = this.shop.items.filter((i) => i.slot === this.slot);
    const grid = el('div', 'item-grid');
    for (const it of items) {
      if (it.owned) grid.append(this.card(it, { note: '持っています' }));
      else if (it.buyable) grid.append(this.card(it, { action: 'buy', label: `買う　${it.price}`, disabled: this.shop.coins < it.price, note: this.shop.coins < it.price ? `あと ${it.price - this.shop.coins} コイン` : '' }));
      else grid.append(this.card(it, { note: 'ガチャか交換で手に入ります' }));
    }
    body.append(grid, el('p', 'collection-note', 'コインは、対戦（オンライン）で遊ぶと増えます。景品は見た目だけで、対戦の強さには影響しません。'));
  }

  renderCollection(body) {
    const owned = this.shop.items.filter((i) => i.owned && i.slot === this.slot);
    if (!owned.length) body.append(el('p', 'collection-empty', 'まだ持っていません。ショップかガチャで手に入れましょう'));
    const grid = el('div', 'item-grid');
    const none = this.shop.items.find((i) => i.slot === this.slot && i.equipped);
    for (const it of owned) grid.append(this.card(it, it.equipped ? { action: 'unequip', label: '外す', note: '装備中' } : { action: 'equip', label: '装備する' }));
    body.append(grid);
    void none;
    body.append(el('p', 'collection-note', '装備したスキンは、対戦中に相手にも見えます。持っていないスキンは表示されません（標準の見た目になります）。'));
  }

  renderGacha(body) {
    const g = this.gacha;
    const head = el('div', 'gacha-head');
    head.append(el('strong', null, g.banner.name), el('small', null, `天井：エピック以上が出ないまま ${g.pity.epicAt} 回で確定（いま ${g.pity.sinceEpic} 回）　10連はレア以上が1つ確定`));
    body.append(head);
    const row = el('div', 'gacha-pull');
    for (const [count, cost, label] of [[1, g.banner.costSingle, '1回'], [10, g.banner.costTen, '10連']]) {
      const b = el('button', 'plank-btn', `${label}　${cost} コイン`); b.type = 'button'; b.dataset.act = 'pull'; b.dataset.count = String(count); b.disabled = this.shop.coins < cost; row.append(b);
    }
    body.append(row);
    if (this.shop.coins < g.banner.costSingle) body.append(el('p', 'collection-note', `コインが足りません（あと ${g.banner.costSingle - this.shop.coins}）。対戦で増やせます`));
    // 排出率
    const rates = el('details', 'gacha-rates'); rates.open = false;
    rates.append(el('summary', null, '排出率・景品の一覧'));
    const table = el('div', 'gacha-rate-list');
    for (const r of ['legendary', 'epic', 'rare', 'uncommon', 'common']) {
      if (g.rates[r] == null) continue;
      const sec = el('div', 'gacha-rate-row'); sec.append(this.rarityBadge(r), el('b', null, `${g.rates[r]}%`));
      table.append(sec);
      for (const it of g.items.filter((i) => i.rarity === r)) {
        const li = el('div', 'gacha-rate-item'); li.append(el('span', null, `${it.owned ? '✔ ' : ''}${it.name}`), el('small', null, `${it.probability}%`));
        table.append(li);
      }
    }
    rates.append(table, el('p', 'collection-note', `重複したときは、持っている景品はそのまま残り、交換ポイントになります（${Object.entries(g.duplicatePoints).map(([r, n]) => `${RARITY_NAME[r]} ${n}`).join('・')}）。`));
    body.append(rates);
    // 交換
    const ex = el('details', 'gacha-exchange'); ex.append(el('summary', null, `交換ポイント ${this.shop.points} で景品を選ぶ`));
    const grid = el('div', 'item-grid');
    for (const it of g.items.filter((i) => !i.owned && i.gacha)) {
      const cost = g.exchangeCost[it.rarity];
      grid.append(this.card(it, { action: 'exchange', label: `${cost} ポイント`, disabled: this.shop.points < cost }));
    }
    if (!grid.childElementCount) grid.append(el('p', 'collection-empty', 'ガチャ限定の景品はすべて持っています'));
    ex.append(grid); body.append(ex);
    // 履歴
    const hist = el('details', 'gacha-history'); hist.append(el('summary', null, '履歴'));
    hist.addEventListener('toggle', async () => {
      if (!hist.open || hist.dataset.loaded) return;
      hist.dataset.loaded = '1';
      const r = await this.call('GET', '/api/gacha/history?limit=30');
      const ul = el('ol', 'gacha-history-list');
      for (const h of r?.history ?? []) { const li = el('li', `r-${h.rarity}`); li.textContent = `${h.name}（${RARITY_NAME[h.rarity]}）${h.duplicate ? ` 重複 +${h.pointsGained}pt` : ''}`; ul.append(li); }
      if (!ul.childElementCount) ul.append(el('li', null, 'まだ回していません'));
      hist.append(ul);
    });
    body.append(hist);
  }

  async onClick(e) {
    const tab = e.target.closest('.social-tab[data-tab]');
    if (tab) { this.tab = tab.dataset.tab; this.say(''); this.render(); return; }
    const slot = e.target.closest('.collection-slot');
    if (slot) { this.slot = slot.dataset.slot; this.render(); return; }
    const btn = e.target.closest('[data-act]');
    if (!btn) { if (e.target === this.box) this.close(); return; }
    const { act, id } = btn.dataset;
    btn.disabled = true;
    if (act === 'buy') {
      const r = await this.call('POST', '/api/shop/buy', { itemId: id });
      if (r) { this.toast(`${r.item.name} を手に入れました`, 'info'); await this.reload(); }
    } else if (act === 'equip' || act === 'unequip') {
      const it = this.shop.items.find((i) => i.id === id);
      const r = await this.call('POST', '/api/collection/equip', { slot: it.slot, itemId: act === 'equip' ? id : null });
      if (r) { this.onEquipChanged(r.equipped); await this.reload(); }
    } else if (act === 'exchange') {
      const r = await this.call('POST', '/api/gacha/exchange', { itemId: id });
      if (r) { this.toast(`${r.item.name} と交換しました`, 'info'); await this.reload(); }
    } else if (act === 'pull') {
      const r = await this.call('POST', '/api/gacha/pull', { count: Number(btn.dataset.count) });
      if (r) { this.reveal(r.results); await this.reload(false); }
    }
    btn.disabled = false;
  }

  async reload(rerender = true) {
    const [shop, gacha] = await Promise.all([this.call('GET', '/api/shop'), this.call('GET', '/api/gacha/info')]);
    if (shop && gacha) { this.shop = shop; this.gacha = gacha; this.onBalance(shop); if (rerender) this.render(); else this.refreshHeader(); }
  }
  refreshHeader() { const keep = this.part('body').querySelector('.gacha-reveal'); this.render(); if (keep) this.part('body').prepend(keep); }

  /** 結果の演出。レアリティが高いほど派手に。タップで飛ばせる */
  reveal(results) {
    const wrap = el('div', 'gacha-reveal');
    wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-label', 'ガチャの結果');
    const grid = el('div', 'gacha-reveal-grid');
    const best = results.reduce((m, r) => Math.max(m, ['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(r.rarity)), 0);
    wrap.dataset.best = String(best);
    results.forEach((r, i) => {
      const c = el('div', `gacha-card r-${r.rarity}${r.duplicate ? ' dup' : ''}`);
      c.style.setProperty('--i', String(i));
      c.append(itemPreview(r.item), this.rarityBadge(r.rarity), el('strong', null, r.item.name), el('small', null, r.duplicate ? `重複 → +${r.pointsGained} ポイント` : 'NEW'));
      grid.append(c);
    });
    const skip = el('button', 'plank-btn', 'とじる'); skip.type = 'button';
    skip.addEventListener('click', (e) => { e.stopPropagation(); wrap.remove(); });
    wrap.addEventListener('click', () => wrap.classList.add('all'));
    if (this.reducedMotion()) wrap.classList.add('all');
    wrap.append(grid, el('small', 'gacha-hint', 'タップで全部見る'), skip);
    this.part('body').prepend(wrap);
    skip.focus({ preventScroll: true });
  }
}
