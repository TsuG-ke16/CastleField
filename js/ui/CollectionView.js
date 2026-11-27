import { NAV_ART, atlasMarkup } from './KingdomArt.js';
import { presentView, dismissView } from './viewPlacement.js';
// ショップ・ガチャ・所持品（装備）の画面。価格・確率・景品はサーバーの値を表示するだけ（ここで残高や景品を変えることはできない）。
// 景品はすべて見た目だけで、ランクマッチの勝敗には影響しない。名前などは textContent で入れる。
import { account } from './Account.js';
import { itemPreview } from './Cosmetics.js';
import { skinArt } from './skinArt.js';

const RARITY_NAME = { common: 'コモン', uncommon: 'アンコモン', rare: 'レア', epic: 'エピック', legendary: 'レジェンド' };
const SLOT_ORDER = ['unit', 'castle', 'charSkin', 'spellSkin', 'cardBack', 'attackFx', 'winFx', 'icon', 'iconFrame', 'title'];
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export class CollectionView {
  /** @param {object} o  @param {() => void} o.onEquipChanged 装備が変わった（盤面の見た目を更新する）  @param {() => void} o.onBalance 残高が変わった */
  constructor({ toast = () => {}, onEquipChanged = () => {}, onBalance = () => {}, reducedMotion = () => false } = {}) {
    Object.assign(this, { toast, onEquipChanged, onBalance, reducedMotion });
    this.tab = 'shop';
    this.slot = 'unit';this.shopSlot='all';this.shopSource='coin';this.query='';this.sort='type';this.limit=24;this.affordable=false;
    const box = this.box = document.createElement('div');
    box.id = 'collection'; box.className = 'screen dim'; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'collection-title');
    box.innerHTML = `<div class="screen-box parchment collection-box">
      <header class="collection-head"><h2 id="collection-title">ショップ</h2>
        <span class="collection-wallet" data-part="wallet" aria-live="polite"></span></header>
      <div class="shop-tools" data-part="shopTools" hidden>
        <div class="shop-sources" role="group" aria-label="買い方"><button type="button" data-shop-source="coin">コインで購入</button><button type="button" data-shop-source="exchange">ポイントで交換</button></div>
        <div class="shop-search-row"><label>商品を探す<input type="search" class="shop-query" placeholder="名前・キャラ名で検索" autocomplete="off"></label><label>並べ方<select class="shop-sort"><option value="type">種類順</option><option value="price">価格の安い順</option><option value="rarity">レアリティ順</option><option value="name">名前順</option></select></label></div>
        <label class="shop-affordable"><input type="checkbox">いま買えるものだけ</label>
      </div>
      <div class="collection-slots" role="group" aria-label="アイテムの種類" data-part="slots"></div>
      <div class="collection-body" data-part="body"></div>
      <div data-part="reveals"></div>
      <p class="collection-msg" data-part="msg" role="status"></p>
      <button type="button" class="plank-btn collection-close">閉じる</button>
    </div>`;
    document.getElementById('app').append(box);
    this.part = (n) => box.querySelector(`[data-part="${n}"]`);
    box.querySelector('.collection-close').addEventListener('click', () => this.close());
    box.addEventListener('keydown', (e) => { if(e.key==='Escape'&&!this.part('reveals').querySelector('dialog[open]'))this.close(); });
    box.addEventListener('click', (e) => this.onClick(e));
    box.querySelector('.shop-query').addEventListener('input',e=>{this.query=e.target.value;this.limit=24;this.render()});
    box.querySelector('.shop-sort').addEventListener('change',e=>{this.sort=e.target.value;this.limit=24;this.render()});
    box.querySelector('.shop-affordable input').addEventListener('change',e=>{this.affordable=e.target.checked;this.limit=24;this.render()});
    account.onChange(()=>{if(this.box.getClientRects().length)this.load()});
  }

  async open(tab = 'shop', host = null) {
    this.tab = tab;this.box.dataset.kind=tab;this.say('');
    const panel=this.box.querySelector('.collection-box');panel.classList.toggle('parchment',!host);if(host)panel.removeAttribute('data-ui-frame');
    presentView(this, host);
    if(!host)this.box.querySelector('.collection-close').focus({ preventScroll: true });
    await this.load();
  }
  close() { dismissView(this); }
  say(t, bad = false) { const m = this.part('msg'); m.textContent = t; m.classList.toggle('bad', bad); }

  async call(method, path, body) {
    const r = await account.api(method, path, body).catch(() => ({}));
    if (!r.json?.ok) { this.say(r.json?.reason ?? 'サーバーにつながりません', true); return null; }
    return r.json;
  }

  async load() {
    const request=this.request=Symbol();
    if(!account.enabled||!account.user){this.part('shopTools').hidden=true;this.part('body').replaceChildren(el('p','collection-empty','オンラインにつながると利用できます。ひとりで遊ぶ・同じ端末の対戦はオフラインでも遊べます。'));this.part('slots').replaceChildren();this.part('wallet').replaceChildren();return;}
    this.part('body').replaceChildren(el('p', 'collection-empty', '読み込み中…'));
    const [shop, gacha] = await Promise.all([this.call('GET', '/api/shop'), this.call('GET', '/api/gacha/info')]);
    if(this.request!==request)return;
    if (!shop || !gacha) { this.part('body').replaceChildren(el('p', 'collection-empty', '読み込めませんでした。つながってから、もう一度開いてください')); return; }
    this.shop = shop; this.gacha = gacha;
    this.render();
  }

  render() {
    const titles = { shop: 'ショップ', gacha: 'ガチャ', collection: 'スキン装備' };
    this.box.querySelector('h2').textContent = titles[this.tab];
    const w = this.part('wallet'); w.replaceChildren();
    const coin = el('span', 'collection-coin'); const ci = new Image(); ci.src = 'assets/ui/icon-coin.png'; ci.alt = 'コイン'; ci.width = 20; ci.height = 20;
    coin.append(ci, el('b', null, String(this.shop.coins)));
    w.append(coin);
    w.append(el('span', 'collection-points', `交換ポイント ${this.shop.points}`));
    this.part('shopTools').hidden=this.tab!=='shop';
    for(const b of this.box.querySelectorAll('[data-shop-source]'))b.setAttribute('aria-pressed',String(b.dataset.shopSource===this.shopSource));
    const slots = this.part('slots'); slots.replaceChildren();
    slots.hidden = this.tab === 'gacha';
    for (const s of (this.tab==='shop'?['all',...SLOT_ORDER]:SLOT_ORDER)) {
      const b = el('button', 'collection-slot raw-btn', s==='all'?'すべて':this.shop.slots[s]); b.type = 'button'; b.dataset.slot = s; b.setAttribute('aria-pressed', String(this.activeSlot() === s)); slots.append(b);
    }
    const body = this.part('body'); body.replaceChildren();
    ({ shop: () => this.renderShop(body), gacha: () => this.renderGacha(body), collection: () => this.renderCollection(body) })[this.tab]();
  }

  rarityBadge(r) { const b = el('em', `rarity-tag r-${r}`, RARITY_NAME[r] ?? r); return b; }

  card(it, { action, label, disabled, note }) {
    const c = el('div', `item-card r-${it.rarity}${it.owned ? ' owned' : ''}`);
    c.dataset.itemId=it.id;
    c.append(itemPreview(it), this.rarityBadge(it.rarity), el('strong', 'item-name', it.name));
    if (it.desc && (!skinArt(it.id) || !['unit', 'castle'].includes(it.slot))) c.append(el('small', 'item-desc', it.desc));
    if (note) c.append(el('small', 'item-note', note));
    if (action) { const b = el('button', 'small-btn item-act', label); b.type = 'button'; b.dataset.act = action; b.dataset.id = it.id; b.disabled = !!disabled; c.append(b); }
    return c;
  }

  /** キャラ・魔法のスキンは、対象（キャラ・魔法）ごとにまとめて見出しをつける */
  gridFor(items, body, fill) {
    if (!['charSkin', 'spellSkin'].includes(this.activeSlot())) { const grid = el('div', 'item-grid'); for (const it of items) fill(grid, it); body.append(grid); return; }
    const by = new Map();
    for (const it of items) { if (!by.has(it.target)) by.set(it.target, []); by.get(it.target).push(it); }
    for (const [, list] of by) {
      const sec = el('section', 'skin-group'); sec.append(el('h4', 'skin-group-title', list[0].targetName));
      const grid = el('div', 'item-grid'); for (const it of list) fill(grid, it); sec.append(grid); body.append(sec);
    }
  }

  activeSlot(){return this.tab==='shop'?this.shopSlot:this.slot;}

  shopMatches(){
    const text=s=>String(s??'').normalize('NFKC').toLocaleLowerCase('ja');const q=text(this.query).trim();
    const price=it=>this.shopSource==='exchange'?this.gacha.exchangeCost[it.rarity]:it.price;
    let items=this.shop.items.filter(it=>(this.shopSlot==='all'||it.slot===this.shopSlot)&&(!q||text(`${it.name} ${it.desc??''} ${it.targetName??''}`).includes(q)));
    items=items.filter(it=>this.shopSource==='coin'?it.buyable:it.gacha&&!it.owned);
    const budget=this.shopSource==='coin'?this.shop.coins:this.shop.points;
    if(this.affordable)items=items.filter(it=>!it.owned&&price(it)<=budget);
    const rank=['common','uncommon','rare','epic','legendary'];
    const order={type:(a,b)=>SLOT_ORDER.indexOf(a.slot)-SLOT_ORDER.indexOf(b.slot),price:(a,b)=>price(a)-price(b),rarity:(a,b)=>rank.indexOf(b.rarity)-rank.indexOf(a.rarity),name:(a,b)=>a.name.localeCompare(b.name,'ja')};
    return items.sort((a,b)=>order[this.sort](a,b)||a.name.localeCompare(b.name,'ja'));
  }

  renderShop(body) {
    const items=this.shopMatches();
    const heading=el('div','shop-results-head');heading.append(el('h3',null,this.shopSource==='coin'?'コインで購入':'ポイントで交換'),el('span','shop-result-count',`${items.length}件`));heading.lastChild.setAttribute('role','status');body.append(heading);
    this.gridFor(items.slice(0,this.limit),body,(grid,it)=>{
      if(it.owned)grid.append(this.card(it,{note:'持っています'}));
      else if(this.shopSource==='exchange'){const cost=this.gacha.exchangeCost[it.rarity];grid.append(this.card(it,{action:'exchange',label:`${cost} ポイントで交換`,disabled:this.shop.points<cost,note:this.shop.points<cost?`あと ${cost-this.shop.points} ポイント`:''}));}
      else grid.append(this.card(it,{action:'buy',label:`買う　${it.price}`,disabled:this.shop.coins<it.price,note:this.shop.coins<it.price?`あと ${it.price-this.shop.coins} コイン`:''}));
    });
    if(!items.length){body.append(el('p','collection-empty','条件に合う商品がありません'));const reset=el('button','small-btn','絞り込みを解除');reset.dataset.shopReset='1';reset.type='button';body.append(reset);}
    if(items.length>this.limit){const more=el('button','small-btn shop-more',`さらに表示（残り${items.length-this.limit}件）`);more.type='button';more.dataset.shopMore='1';body.append(more);}
    body.append(el('p','collection-note','コインはオンライン対戦の報酬。商品はすべて見た目だけで、強さは変わりません。'));
  }

  renderCollection(body) {
    const stage=el('section','wardrobe-stage');stage.setAttribute('aria-label','現在の装備プレビュー');stage.append(el('h3',null,'現在の装備'));
    const scene=el('div','wardrobe-scene');
    for(const [slot,label] of [['castle','城'],['unit','歩兵'],['cardBack','カード裏面']]){
      const it=(slot==='unit'?this.shop.items.find(i=>i.equipped&&i.slot==='charSkin'&&i.target==='infantry'):null)??this.shop.items.find(i=>i.equipped&&i.slot===slot);
      const figure=el('figure',`wardrobe-preview preview-${slot}`);figure.dataset.previewSlot=slot;figure.dataset.equippedId=it?.id??'';
      if(it)figure.append(itemPreview(it));else{const img=new Image();img.src={castle:'assets/castles/castle-blue.png',unit:'assets/units/infantry-blue.png',cardBack:'assets/ui/card-back.png'}[slot];img.alt='';figure.append(img);}
      figure.append(el('figcaption',null,`${label}・${it?.name??'標準'}`));scene.append(figure);
    }
    stage.append(scene,el('p','collection-note','装備・解除すると、ここにも反映されます。'));body.append(stage);
    const list=el('section','wardrobe-items');list.append(el('h3',null,this.shop.slots[this.slot]));
    const owned=this.shop.items.filter(i=>i.owned&&i.slot===this.slot);
    if(!owned.length)list.append(el('p','collection-empty','この種類のスキンはまだ持っていません。ショップやガチャで手に入ります。'));
    this.gridFor(owned,list,(grid,it)=>grid.append(this.card(it,it.equipped?{action:'unequip',label:'外す',note:'装備中'}:{action:'equip',label:'装備する'})));
    body.append(list);
  }

  renderGacha(body) {
    const g = this.gacha;
    const altar=el('div','gacha-altar');altar.innerHTML=atlasMarkup(NAV_ART.gacha,'gacha-chest',260);altar.append(el('p',null,'宝箱を開いて、王国を彩ろう'));body.append(altar);
    const head = el('div', 'gacha-head');
    head.append(el('strong', null, g.banner.name), el('small', null, `天井：エピック以上が出ないまま ${g.pity.epicAt} 回で確定（いま ${g.pity.sinceEpic} 回）　10連はレア以上が1つ確定`));
    body.append(head);
    const row = el('div', 'gacha-pull');
    for (const [count, cost, label] of [[1, g.banner.costSingle, '1回'], [10, g.banner.costTen, '10連']]) {
      // 「10連　900 コイン」は狭い画面で切れるので、コインの絵＋数にする（読み上げは文で）
      const b = el('button', 'plank-btn'); b.type = 'button'; b.setAttribute('aria-label', `${label}　${cost} コイン`);
      const coin = new Image(); coin.src = 'assets/ui/icon-coin.png'; coin.alt = ''; coin.width = 20; coin.height = 20; coin.className = 'gacha-pull-coin';
      b.append(el('span', 'gacha-pull-label', label), coin, el('b', null, String(cost))); b.dataset.act = 'pull'; b.dataset.count = String(count); b.disabled = !!this.pulling || this.shop.coins < cost; row.append(b);
    }
    body.append(row);
    if (this.shop.coins < g.banner.costTen) {
      const shortfall = this.shop.coins < g.banner.costSingle
        ? `1回まであと ${g.banner.costSingle - this.shop.coins} コイン。10連まであと ${g.banner.costTen - this.shop.coins} コイン。`
        : `10連まであと ${g.banner.costTen - this.shop.coins} コイン。`;
      body.append(el('p', 'collection-note', shortfall));
    }
    const samples=el('details','gacha-samples');samples.append(el('summary',null,'景品の見本'));const showcase=el('div','gacha-showcase');for(const [src,name] of [['castle-shadow','影の城'],['castle-gold','黄金の城'],['unit-gold','黄金の兵']]){const img=new Image();img.src=`assets/skins/${src}.png`;img.alt=name;showcase.append(img)}samples.append(showcase);body.append(samples);
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
    const source=e.target.closest('[data-shop-source]');if(source){this.shopSource=source.dataset.shopSource;this.limit=24;this.render();return;}
    if(e.target.closest('[data-shop-more]')){this.limit+=24;this.render();return;}
    if(e.target.closest('[data-shop-reset]')){this.query='';this.shopSlot='all';this.affordable=false;this.limit=24;this.box.querySelector('.shop-query').value='';this.box.querySelector('.shop-affordable input').checked=false;this.render();return;}
    const slot = e.target.closest('.collection-slot');
    if (slot) { if(this.tab==='shop')this.shopSlot=slot.dataset.slot;else this.slot=slot.dataset.slot;this.limit=24;this.render();return; }
    const btn = e.target.closest('[data-act]');
    if (!btn) { if (e.target === this.box) this.close(); return; }
    const { act, id } = btn.dataset;
    if(act==='pull'&&this.pulling)return;
    if(act==='pull'){this.pulling=true;for(const b of this.box.querySelectorAll('[data-act=pull]'))b.disabled=true;}
    btn.disabled = true;
    if (act === 'buy') {
      const r = await this.call('POST', '/api/shop/buy', { itemId: id });
      if (r) { this.toast(`${r.item.name} を手に入れました`, 'info'); await this.reload(); }
    } else if (act === 'equip' || act === 'unequip') {
      const it = this.shop.items.find((i) => i.id === id);
      const r = await this.call('POST', '/api/collection/equip', { slot: it.target ? `${it.slot}:${it.target}` : it.slot, itemId: act === 'equip' ? id : null });
      if (r) { this.onEquipChanged(r.equipped); await this.reload(); }
    } else if (act === 'exchange') {
      const r = await this.call('POST', '/api/gacha/exchange', { itemId: id });
      if (r) { this.toast(`${r.item.name} と交換しました`, 'info'); await this.reload(); }
    } else if (act === 'pull') {
      const r = await this.call('POST', '/api/gacha/pull', { count: Number(btn.dataset.count) });
      if (r) { if(this.tab==='gacha')this.reveal(r.results);else this.toast('ガチャの景品を受け取りました','info'); await this.reload(false); }
    }
    if(act==='pull'){this.pulling=false;this.render();}
    btn.disabled = false;
  }

  async reload(rerender = true) {
    const [shop, gacha] = await Promise.all([this.call('GET', '/api/shop'), this.call('GET', '/api/gacha/info')]);
    if (shop && gacha) { this.shop = shop; this.gacha = gacha; this.onBalance(shop); if (rerender) this.render(); else this.refreshHeader(); }
  }
  refreshHeader() { this.render(); }

  /** 結果の演出。レアリティが高いほど派手に。タップで飛ばせる */
  reveal(results) {
    const wrap = el('dialog', 'gacha-reveal');
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
    grid.hidden = true;
    const capsule=el('div','gacha-capsule');capsule.innerHTML=atlasMarkup(NAV_ART.gacha,'gacha-chest',240);
    const title=el('h3',null,'宝箱が届きました');title.id='gacha-result-title';wrap.setAttribute('aria-labelledby',title.id);
    const launch = el('button', 'plank-btn gacha-open', '宝箱を開く');
    launch.type = 'button';
    const hint = el('small', 'gacha-hint', 'タップで全部見る');
    hint.hidden = true;
    const skip = el('button', 'plank-btn gacha-close', 'とじる');
    skip.hidden = true;
    launch.addEventListener('click', (event) => {
      event.stopPropagation();
      launch.hidden = true;title.textContent='宝箱の中身';wrap.classList.add('opened');
      capsule.hidden = true;
      grid.hidden = false;
      hint.hidden = false;
      skip.hidden = false;
      if (this.reducedMotion() || matchMedia('(prefers-reduced-motion: reduce)').matches) wrap.classList.add('all');
      skip.focus({ preventScroll: true });
    }, { once: true }); skip.type = 'button';
    skip.addEventListener('click',e=>{e.stopPropagation();wrap.close()});
    wrap.addEventListener('close',()=>{wrap.remove();this.part('body').querySelector('[data-act=pull]')?.focus({preventScroll:true})});
    wrap.addEventListener('click', () => wrap.classList.add('all'));
    wrap.append(title,capsule, launch, grid, hint, skip);
    this.part('reveals').append(wrap);wrap.showModal();
    launch.focus({ preventScroll: true });
  }
}
