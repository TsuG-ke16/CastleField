import { profileArt } from './profileArt.js';
// ホーム画面：上にプレイヤー情報、下にタブ（アカウント・デッキ・バトル・ガチャ・設定）。
// バトルのページは「城の絵 → シーズン・ランク → モード → デッキ → 大きな対戦開始ボタン」の順に、上から下へ迷わず進めるように並べる。
// デッキのページは、使うデッキの中身（カードの絵）を主役にする。ほかのページも、そのタブで一番よく使う操作を大きく出す。
// いつも入口になる。サーバーのアカウント機能がないとき（python の簡易サーバー・オフライン）は、
// ひとりで遊ぶ・同じ端末・デッキ編成・図鑑・設定だけを使え、サーバーが要るメニューは押すと理由を出す。表示名などは textContent で入れる。
import { account } from './Account.js';
import { loadDecks, selectMyDeck, DECK_SLOTS } from './DeckStore.js';
import { deckCard } from './DeckPreview.js';
import { checkCostDeck } from '../game/Setup.js';
import { sound } from './Sound.js';
import { rankEmblem } from './RankEmblem.js';

const MODE_KEY = 'cf-home-mode';
const MODES = {
  solo: { label: 'ひとりで遊ぶ', chip: 'ひとりで', note: 'CPUと対戦', icon: 'assets/ui/icon-mode-solo.png' },
  online: { label: 'カジュアル対戦', chip: 'カジュアル', note: '合言葉で友だちと', icon: 'assets/ui/icon-mode-online.png' },
  local: { label: '同じ端末で遊ぶ', chip: '同じ端末', note: '2〜8人で交代', icon: 'assets/ui/icon-mode-local.png' },
};
// サーバーのアカウント機能がないと使えないメニュー
const NEEDS_SERVER = new Set(['rank', 'ranking', 'friend', 'profile', 'shop', 'gacha', 'skin', 'mission']);
const SERVER_REASON = 'この機能は、オンライン対戦のサーバー（node server/server.js）で開くと使えます';
const menuIcon = (id, size = 36) => `<img src="assets/ui/home/${id}.png" alt="" width="${size}" height="${size}" draggable="false">`;
// 画面下のタブ（一般的なアプリと同じ）。左から アカウント・デッキ・バトル（真ん中）・ガチャ・設定。
const TABS = [
  { id: 'account', label: 'アカウント', icon: 'profile' },
  { id: 'deck', label: 'デッキ', icon: 'deck' },
  { id: 'battle', label: 'バトル', icon: 'rank' },
  { id: 'shop', label: 'ガチャ', icon: 'gacha' },
  { id: 'settings', label: '設定', icon: 'settings' },
];
// タブごとのメニュー（タイル）。style：grid＝アイコンを並べる／list＝説明つきの行
const GROUPS = {
  account: [['アカウント', ['profile', 'friend'], 'list']],
  deck: [['カード', ['deck', 'catalog', 'skin'], 'list']],
  battle: [['ほかの対戦', ['rank', 'casual', 'ranking', 'mission'], 'grid']],
  shop: [['ガチャ・ショップ', ['gacha', 'shop'], 'list']],
  settings: [['設定', ['settings', 'help'], 'list']],
};
/** タイルがどのタブにあるか */
export const TAB_OF = Object.fromEntries(Object.entries(GROUPS).flatMap(([tab, groups]) => groups.flatMap(([, ids]) => ids.map((id) => [id, tab]))));
const MENU = {
  rank: 'ランクマッチ',
  casual: 'カジュアル',
  friend: 'フレンド対戦',
  deck: 'デッキ編成',
  catalog: 'カード図鑑',
  profile: 'プロフィール',
  shop: 'ショップ',
  gacha: 'ガチャ',
  skin: 'スキン',
  mission: 'ミッション',
  ranking: 'ランキング',
  help: '遊び方',
  settings: '設定',
};
// 行の説明（短く。何ができるかだけ）
const MENU_NOTE = {
  friend: 'フレンドを招待して対戦',
  profile: 'アイコン・称号・戦績',
  deck: 'カードを選んで自分のデッキを作る',
  catalog: 'すべてのカードと魔物を見る',
  skin: '持っている見た目を装備する',
  gacha: 'コインで見た目のアイテムを引く',
  shop: 'コインで見た目のアイテムを買う',
  settings: '音・演出の速さ・文字の大きさ',
  help: 'ルールと操作をおさらい',
};
// ガチャの目玉（data/shop.json の gacha: true の景品。絵は assets/skins/）
const GACHA_SHOWCASE = [
  { src: 'assets/skins/castle-shadow.png', name: '影の城', rarity: 'legendary' },
  { src: 'assets/skins/castle-gold.png', name: '黄金の城', rarity: 'epic' },
  { src: 'assets/skins/unit-gold.png', name: '黄金の兵', rarity: 'epic' },
];
const PREVIEW_CARDS = 5; // デッキの代表カードの枚数

export class Home {
  /**
   * @param {object} o
   * @param {(mode: string) => void} o.onPlay 選んだモードの設定画面（CPUの強さ・同じ端末・合言葉）へ進む
   * @param {(slot?: number) => void} o.onDeck  @param {() => void} o.onCatalog  @param {() => void} o.onSettings
   * @param {() => void} o.onProfile
   * @param {(type: string) => void} [o.onZoomCard] カードを大きく見せる（CardZoom）
   * @param {object} [o.cards] @param {object} [o.rarities] @param {object} [o.rules] @param {object} [o.decks] デッキの中身を見せるのに使う（data/ の中身）
   */
  constructor({ onPlay, onDeck, onCatalog, onSettings, onHelp = () => {}, getRecord = () => '', onProfile, onRanked = () => {}, onRanking = () => {}, onFriends = () => {}, onShop = () => {}, onGacha = () => {}, onSkin = () => {}, onMission = () => {}, onAccount, onZoomCard = () => {}, toast = () => {}, cards = null, rarities = null, rules = null, decks = null }) {
    Object.assign(this, { onPlay, onDeck, onCatalog, onSettings, onHelp, getRecord, onProfile, onRanked, onRanking, onFriends, onShop, onGacha, onSkin, onMission, onAccount, onZoomCard, toast, cards, rarities, rules, decks });
    this.data = null;
    this.mode = 'solo';
    try { const m = localStorage.getItem(MODE_KEY); if (m in MODES) this.mode = m; } catch { /* 保存できなくても動く */ }
    const box = this.box = document.createElement('div');
    box.id = 'home'; box.className = 'screen'; box.hidden = true;
    box.innerHTML = `<div class="home-sky" aria-hidden="true"></div><div class="home-wall" aria-hidden="true"></div>
    <div class="home-wrap">
      <header class="home-top">
        <button type="button" class="home-player raw-btn" data-act="profile" aria-label="プロフィールを開く">
          <span class="home-avatar" data-part="avatar"></span>
          <span class="home-who">
            <strong data-part="name">…</strong>
            <small data-part="title"></small>
            <span class="home-level" data-part="lvWrap"><b data-part="lv">Lv.1</b><span class="home-xp" role="progressbar" aria-label="次のレベルまで" data-part="xpbar"><i data-part="xpfill"></i></span></span>
          </span>
        </button>
        <div class="home-side">
          <span class="home-coins" title="ゲーム内通貨（無料）" data-part="coins"><img src="assets/ui/icon-coin.png" alt="コイン" width="22" height="22"><b>0</b></span>
          <button type="button" class="home-icon-btn raw-btn" data-act="notice" aria-label="お知らせ"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3.2c-3.3 0-5.6 2.5-5.6 5.8v3.6L4.6 15.4c-.4.6 0 1.4.8 1.4h13.2c.8 0 1.2-.8.8-1.4l-1.8-2.8V9c0-3.3-2.3-5.8-5.6-5.8Z" fill="#ffd36b" stroke="#3f2511" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.6 18.6a2.5 2.5 0 0 0 4.8 0" fill="#ffd36b" stroke="#3f2511" stroke-width="1.8" stroke-linecap="round"/><path d="M8.6 7.6c.5-1 1.3-1.6 2.3-1.9" fill="none" stroke="#fff6cf" stroke-width="1.6" stroke-linecap="round"/></svg><i class="home-dot" data-part="dot" hidden></i></button>
        </div>
      </header>

      <div class="home-page" data-page="account" role="tabpanel" aria-label="アカウント" hidden>
        <section class="home-card home-rankcard" aria-label="ランク">
          <span class="home-rankcard-emblem" data-part="accEmblem"></span>
          <div class="home-rankcard-text"><span class="home-eyebrow">ランク</span><b data-part="accRank">—</b><small data-part="accSeason"></small></div>
        </section>
        <section class="home-card home-levelcard" aria-label="レベル" data-part="levelCard">
          <span class="home-levelcard-badge"><small>Lv.</small><b data-part="lv2">1</b></span>
          <div class="home-levelcard-text">
            <span class="home-eyebrow">次のレベルまで</span>
            <span class="home-xp home-xp-big" aria-hidden="true"><i data-part="xpfill2"></i></span>
            <small data-part="xpNext"></small>
          </div>
          <button type="button" class="cf-btn cf-btn-primary cf-btn-sm raw-btn" data-act="profile" data-part="lvReward" hidden>報酬を受け取る</button>
        </section>
        <section class="home-card home-stats" aria-label="戦績" data-part="accStatsGrid"></section>
        <p class="home-stats-text" data-part="accStats" hidden></p>
        <aside class="home-link" data-part="guest" hidden><span>アカウントを作成すると、別の端末でもデータを引き継げます。</span><button type="button" class="home-retry cf-btn cf-btn-secondary raw-btn" data-act="account">アカウント作成</button></aside>
        <nav class="home-menu" aria-label="アカウント" data-menu="account"></nav>
      </div>

      <div class="home-page" data-page="deck" role="tabpanel" aria-label="デッキ" hidden>
        <section class="home-card home-deckhero" aria-labelledby="home-deck-name">
          <div class="home-deckhero-head">
            <div class="home-deckhero-title"><span class="home-eyebrow">使うデッキ</span><h2 id="home-deck-name" data-part="deck2">—</h2></div>
            <span class="home-deck-state" data-part="deckState"></span>
          </div>
          <div class="home-deck-meta" data-part="deckMeta"></div>
          <div class="home-deck-fan" data-part="deckFan" role="list" aria-label="デッキの代表カード（タップで拡大）"></div>
          <div class="home-deck-actions">
            <button type="button" class="cf-btn cf-btn-primary raw-btn" data-act="deck">デッキを編成する</button>
          </div>
          <div class="home-deck-slots" role="radiogroup" aria-label="デッキを切りかえる" data-part="deckSlots"></div>
        </section>
        <section class="home-card home-deck-cards" aria-label="デッキのカード" data-part="deckCardsWrap">
          <h2 class="home-card-title">デッキのカード<small data-part="deckKinds"></small></h2>
          <div class="home-deck-strip" data-part="deckStrip"></div>
          <p class="home-hint">カードをタップすると大きく見られます</p>
        </section>
        <nav class="home-menu" aria-label="カード" data-menu="deck"></nav>
      </div>

      <div class="home-page" data-page="shop" role="tabpanel" aria-label="ガチャ" hidden>
        <section class="home-card home-gacha" aria-label="ガチャ">
          <div class="home-gacha-rays" aria-hidden="true"></div>
          <div class="home-gacha-show" data-part="gachaShow"></div>
          <div class="home-gacha-copy"><span class="home-eyebrow">ふつうのガチャ</span><h2>見た目のアイテムを集めよう</h2><p>城・兵士・カード裏などの見た目が当たります。強さは変わりません。</p></div>
          <div class="home-gacha-actions">
            <span class="home-wallet"><img src="assets/ui/icon-coin.png" alt="" width="20" height="20"><b data-part="coins2">0</b><small>コイン</small></span>
            <button type="button" class="cf-btn cf-btn-primary raw-btn" data-act="gacha">ガチャを引く</button>
          </div>
        </section>
        <nav class="home-menu" aria-label="ガチャ・ショップ" data-menu="shop"></nav>
      </div>

      <div class="home-page" data-page="settings" role="tabpanel" aria-label="設定" hidden>
        <nav class="home-menu" aria-label="設定" data-menu="settings"></nav>
        <section class="home-card home-points" aria-labelledby="home-points-title">
          <h2 class="home-card-title" id="home-points-title">遊び方のポイント</h2>
          <ol>
            <li><img src="assets/castles/castle-orange.png" alt="" width="56" height="56"><span><b>相手の城を落とせば勝ち</b>城のHPを0にしよう</span></li>
            <li><img src="assets/units/knight-blue.png" alt="" width="56" height="56"><span><b>兵士は毎ターン進む</b>相手の城に着くと大ダメージ</span></li>
            <li><img src="assets/units/monster-dragon.png" alt="" width="56" height="56"><span><b>まん中の魔物を倒す</b>とどめを刺すとカードがもらえる</span></li>
          </ol>
          <button type="button" class="cf-btn cf-btn-secondary raw-btn" data-act="help">くわしい遊び方を見る</button>
        </section>
      </div>

      <div class="home-page" data-page="battle" role="tabpanel" aria-label="バトル">
      <section class="home-hero" aria-label="対戦">
        <div class="home-worlds" role="tablist" aria-label="世界" data-part="worlds"></div>
        <div class="home-landscape">
          <span class="home-landscape-art" aria-hidden="true"></span>
          <span class="home-sun" aria-hidden="true"></span>
          <span class="home-glint" aria-hidden="true"></span>
          <div class="home-landscape-info">
            <span data-part="season" class="home-season"></span>
            <span class="home-rank-chip" data-part="rank"><span class="home-rank-emblem" data-part="rankEmblem"></span><span data-part="rankText">—</span></span>
          </div>
        </div>
        <div class="home-controls">
          <div class="home-modes" role="tablist" aria-label="ゲームモード" data-part="modes"></div>
          <div class="home-deckrow">
            <span class="home-deckrow-art" data-part="deckThumb" aria-hidden="true"></span>
            <span class="home-deckrow-text"><span class="home-eyebrow">デッキ</span><b data-part="deck">—</b></span>
            <button type="button" class="cf-btn cf-btn-secondary cf-btn-sm raw-btn" data-act="deck">変更</button>
          </div>
          <dl class="home-facts"><div><dt>戦績</dt><dd data-part="stats">—</dd></div></dl>
          <button type="button" class="home-start raw-btn" data-act="start"><span class="home-start-icon" aria-hidden="true">${menuIcon('casual', 40)}</span><span data-part="startLabel">対戦開始</span></button>
          <p class="home-note" data-part="note" role="status"></p>
          <button type="button" class="home-retry cf-btn cf-btn-secondary raw-btn" data-act="retry" hidden>再読み込み</button>
        </div>
      </section>
      <nav class="home-menu" aria-label="対戦" data-menu="battle"></nav>
      </div>
      <nav class="home-tabbar" role="tablist" aria-label="メニュー" data-part="tabbar"></nav>
    </div>`;
    document.getElementById('app').append(box);
    this.part = (n) => box.querySelector(`[data-part="${n}"]`);
    this.tab = 'battle';
    this.renderMenu();
    this.renderTabs();
    this.renderModes();
    this.renderGachaShow();
    box.addEventListener('click', (e) => this.onClick(e));
    box.addEventListener('keydown', (e) => this.onKey(e));
    account.onChange(() => { if (!box.hidden) this.refresh(); });
  }

  /** ホームを入口にするか（いつも。アカウント機能がなければ、端末だけで使えるメニューにする） */
  available() { return true; }

  /** サーバーのアカウント機能につながっているか */
  online() { return account.enabled && !!account.user; }

  open() {
    const wasHidden = this.box.hidden;
    this.box.hidden = false;
    if (wasHidden) { this.box.classList.remove('home-enter'); void this.box.offsetWidth; this.box.classList.add('home-enter'); }
    this.refresh();
    const focusEl = this.tab === 'battle' ? this.box.querySelector('.home-start') : this.part('tabbar').querySelector('[aria-selected=true]');
    focusEl?.focus({ preventScroll: true });
  }

  close() { this.box.hidden = true; }

  async refresh() {
    const request = Symbol();
    this.request = request;
    const userId = account.user?.id;
    if (this.dataUser !== userId) {
      this.data = null;
      this.season = null;
      this.dataUser = userId;
    }
    this.render();
    this.box.querySelector('[data-act=retry]').hidden = true;
    if (!this.online()) { this.part('note').textContent = ''; return; }
    this.part('note').textContent = this.data ? '' : 'プレイヤー情報を読み込み中…';
    account.api('GET', '/api/ranked/summary').then(({ json }) => {
      if (this.request !== request || !json?.ok) return;
      this.season = json.season;
      this.renderSeason();
    }).catch(() => { /* 対戦開始にはシーズン情報を必要としない */ });
    try {
      const r = await account.api('GET', '/api/home');
      if (this.request !== request) return;
      if (!r.json?.ok) throw new Error('home');
      this.data = r.json;
      this.part('note').textContent = '';
      this.render();
    } catch {
      if (this.request !== request) return;
      this.part('note').textContent = '接続できません。ひとりで遊ぶ・同じ端末は引き続き利用できます。';
      this.box.querySelector('[data-act=retry]').hidden = false;
    }
  }

  renderSeason() {
    const text = this.season ? `シーズン ${this.season.id}` : '';
    this.part('season').textContent = text;
    this.part('accSeason').textContent = text;
  }

  renderBadges() {
    for (const [id, count, label] of [
      ['profile', this.data?.rewardsAvailable, 'レベル報酬'],
      ['mission', this.data?.claimable, '受け取れるミッション報酬'],
      ['friend', this.socialCount, 'フレンドの通知'],
    ]) {
      const tile = this.box.querySelector(`.home-tile[data-id="${id}"]`);
      tile.querySelector('.home-badge')?.remove();
      if (!(count > 0)) continue;
      const badge = document.createElement('em');
      badge.className = 'home-badge';
      badge.textContent = String(count);
      badge.setAttribute('aria-label', `${label} ${count}件`);
      tile.append(badge);
    }
    this.part('dot').hidden = !(this.data?.rewardsAvailable > 0 || this.socialCount > 0 || this.data?.claimable > 0);
    // タブにも印（そのタブの中に、受け取れるもの・通知がある）
    const tabHas = { account: this.data?.rewardsAvailable > 0 || this.socialCount > 0, battle: this.data?.claimable > 0 };
    for (const b of this.part('tabbar').children) b.querySelector('.home-tab-dot').hidden = !tabHas[b.dataset.tab];
  }

  render() {
    const local = !this.online();
    this.box.classList.toggle('home-local', local);
    for (const tile of this.box.querySelectorAll('.home-tile')) {
      const off = local && NEEDS_SERVER.has(tile.dataset.id);
      tile.classList.toggle('home-tile-off', off);
      if (off) tile.title = SERVER_REASON; else tile.removeAttribute('title');
      const note = tile.querySelector('.home-tile-note');
      if (note) note.textContent = off ? 'サーバーで遊ぶと使えます' : MENU_NOTE[tile.dataset.id] ?? '';
    }
    this.box.querySelector('.home-gacha').classList.toggle('home-off', local);
    if (local) return this.renderLocal();
    this.part('lvWrap').hidden = false;
    this.part('coins').hidden = false;
    const d = this.data;
    const u = d?.user ?? account.user;
    this.part('name').textContent = u?.displayName ?? '';
    this.part('title').textContent = d?.title ?? '';
    const lv = d?.level;
    this.part('lv').textContent = `Lv.${lv?.level ?? 1}`;
    const pct = lv ? (lv.maxed ? 100 : Math.round((lv.xpIntoLevel / Math.max(1, lv.xpForNext)) * 100)) : 0;
    this.part('xpfill').style.width = `${pct}%`;
    const bar = this.part('xpbar');
    bar.setAttribute('aria-valuenow', String(pct)); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100');
    bar.title = lv ? (lv.maxed ? '最大レベル' : `次のレベルまで ${lv.xpForNext - lv.xpIntoLevel} 経験値`) : '';
    this.part('levelCard').hidden = false;
    this.part('lv2').textContent = String(lv?.level ?? 1);
    this.part('xpfill2').style.width = `${pct}%`;
    this.part('xpNext').textContent = bar.title || '対戦すると経験値がたまります';
    const rewards = d?.rewardsAvailable ?? 0;
    this.part('lvReward').hidden = !(rewards > 0);
    this.part('lvReward').textContent = `報酬を受け取る（${rewards}）`;
    const iconSrc = profileArt(d?.icon, d?.iconImage ?? d?.icons?.find((i) => i.id === d.icon)?.image);
    const av = this.part('avatar');
    av.replaceChildren();
    if (d?.iconFrame) av.dataset.frame = d.iconFrame; else delete av.dataset.frame;
    if (iconSrc) { const img = new Image(); img.src = iconSrc; img.alt = ''; av.append(img); } else av.textContent = [...(u?.displayName ?? '?')][0];
    const coins = String(d?.coins ?? 0);
    this.part('coins').querySelector('b').textContent = coins;
    this.part('coins2').textContent = coins;
    this.part('guest').hidden = u?.kind !== 'guest';
    this.renderBadges();
    this.renderSeason();
    // 世界（モード）：いまは王国だけ。ほかは準備中（アカウント・レベル・通貨・所持品は世界をこえて共通）
    const worlds = this.part('worlds'); worlds.replaceChildren();
    for (const w of d?.modes ?? [{ id: 'kingdom', name: '王国', available: true }]) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'home-world raw-btn'; b.disabled = !w.available;
      b.textContent = w.name.replace(/（準備中）$/, '');
      if (!w.available) b.title = '準備中です';
      if (!w.available || w.name.includes('準備中')) { const tag = document.createElement('small'); tag.textContent = '準備中'; b.append(tag); }
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(w.id === (d?.defaultMode ?? 'kingdom'))); worlds.append(b);
    }
    const sum = d?.rank;
    const member = u?.kind === 'member';
    this.part('rankEmblem').innerHTML = member ? rankEmblem(sum?.rank ?? null, 26) : '';
    this.part('accEmblem').innerHTML = member ? rankEmblem(sum?.rank ?? null, 64) : '';
    this.part('rankText').textContent = !member ? 'アカウントを作ると参加できます'
      : sum?.rank ? `${sum.rank.divisionLabel}（${sum.rank.rp} RP）` : sum ? `認定戦 ${sum.placementTotal - sum.placementLeft}/${sum.placementTotal}` : '—';
    this.renderDeck(d?.deck?.name);
    const s = d?.stats;
    this.part('stats').textContent = s?.matches ? `${s.matches}戦 ${s.wins}勝 ${s.losses}敗（勝率 ${s.winRate}%）` : 'まだ対戦がありません';
    this.renderStatsGrid(s?.matches ? [['対戦', s.matches], ['勝利', s.wins], ['敗北', s.losses], ['勝率', `${s.winRate}%`]] : null);
    this.syncSummary();
    this.renderFacts();
  }

  /** サーバーのアカウント機能がないとき：端末の情報だけで描く */
  renderLocal() {
    this.part('name').textContent = 'プレイヤー';
    this.part('title').textContent = 'この端末で遊ぶ';
    this.part('lvWrap').hidden = true;
    this.part('levelCard').hidden = true;
    this.part('coins').hidden = true;
    this.part('coins2').textContent = '—';
    const av = this.part('avatar');
    av.replaceChildren();
    delete av.dataset.frame;
    const img = new Image(); img.src = 'assets/profiles/knight.png'; img.alt = ''; av.append(img);
    this.part('guest').hidden = true;
    this.part('season').textContent = '';
    this.part('accSeason').textContent = '';
    const worlds = this.part('worlds'); worlds.replaceChildren();
    const w = document.createElement('button'); w.type = 'button'; w.className = 'home-world raw-btn'; w.textContent = '王国'; w.setAttribute('role', 'tab'); w.setAttribute('aria-selected', 'true'); worlds.append(w);
    this.part('rankEmblem').innerHTML = '';
    this.part('accEmblem').innerHTML = '';
    this.part('rankText').textContent = 'サーバーで遊ぶと参加できます';
    this.renderDeck(null);
    this.part('stats').textContent = this.getRecord() || 'まだ対戦がありません';
    this.renderStatsGrid(null);
    this.syncSummary();
    for (const tile of this.box.querySelectorAll('.home-tile')) tile.querySelector('.home-badge')?.remove();
    this.part('dot').hidden = true;
    this.renderFacts();
  }

  /** 戦績の4マス（数がないときは1行の文） */
  renderStatsGrid(cells) {
    const grid = this.part('accStatsGrid');
    grid.replaceChildren();
    if (!cells) {
      const p = document.createElement('p');
      p.className = 'home-stats-empty';
      p.textContent = this.online() ? 'まだ対戦がありません。最初の1戦をはじめよう！' : (this.getRecord() || 'まだ対戦がありません');
      grid.append(p);
      return;
    }
    for (const [label, value] of cells) {
      const cell = document.createElement('div');
      const v = document.createElement('b'); v.textContent = String(value);
      const l = document.createElement('span'); l.textContent = label;
      cell.append(v, l); grid.append(cell);
    }
  }

  /**
   * 使うデッキ（この端末に保存したデッキ。サーバーにつながっていれば同じ内容が届いている）。
   * 決まりに合うデッキがなければ、対戦で実際に使われる見本のデッキを見せる。
   */
  currentDeck(serverName) {
    let state = null;
    try { state = loadDecks(); } catch { /* 読めなくても動く */ }
    const slot = state?.active ?? 0;
    const mine = state?.slots?.[slot] ?? null;
    const canCheck = this.cards && this.rarities;
    const check = mine && canCheck ? checkCostDeck(mine.list, this.cards, this.rarities, this.rules) : null;
    if (mine && (!canCheck || check?.ok)) return { name: mine.name, list: mine.list, check, kind: 'mine', slot, state };
    const sampleId = this.rules?.defaultCostDeck;
    const sample = sampleId && this.decks?.[sampleId];
    const sampleCheck = sample && canCheck ? checkCostDeck(sample.cards, this.cards, this.rarities, this.rules) : null;
    if (mine) return { name: mine.name, list: mine.list, check, kind: 'invalid', slot, state, fallback: sample?.name };
    if (sample) return { name: sample.name, list: sample.cards, check: sampleCheck, kind: 'sample', slot, state };
    return { name: serverName ?? '未設定', list: null, check: null, kind: 'none', slot, state };
  }

  renderDeck(serverName) {
    const deck = this.currentDeck(serverName);
    this.part('deck').textContent = deck.name;
    this.part('deck2').textContent = deck.name;
    const state = this.part('deckState');
    state.className = `home-deck-state is-${deck.kind}`;
    state.textContent = { mine: '使えます', sample: '見本', invalid: '要調整', none: '' }[deck.kind];
    state.title = deck.kind === 'invalid' ? `決まりに合わないため、対戦では「${deck.fallback ?? '見本のデッキ'}」を使います（${deck.check?.reason ?? ''}）`
      : deck.kind === 'sample' ? 'デッキを編成するまでは、この見本のデッキで対戦します' : '';
    // 枚数・コスト
    const meta = this.part('deckMeta');
    meta.replaceChildren();
    if (deck.check) {
      const max = this.rules?.deckCostMax ?? 100;
      for (const [label, value] of [['枚数', `${deck.check.total}枚`], ['コスト', `${deck.check.cost}/${max}`]]) {
        const s = document.createElement('span'); const b = document.createElement('b');
        s.textContent = label; b.textContent = value; s.append(b); meta.append(s);
      }
      if (deck.kind === 'invalid') {
        const warn = document.createElement('p'); warn.className = 'home-deck-warn';
        warn.textContent = `${deck.check.reason}。対戦では見本のデッキを使います`;
        meta.append(warn);
      }
    }
    // 代表のカード（レアリティの高い順・枚数の多い順）
    const entries = Object.entries(deck.list ?? {}).filter(([type]) => this.cards && Object.hasOwn(this.cards, type));
    const order = this.rarities ? Object.keys(this.rarities) : [];
    const rank = (type) => { const r = this.cards[type].rarity; return this.rarities?.[r]?.special ? 2.5 : order.indexOf(r); };
    const sorted = [...entries].sort((a, b) => rank(b[0]) - rank(a[0]) || b[1] - a[1]);
    const fan = this.part('deckFan');
    fan.replaceChildren();
    const picks = sorted.slice(0, PREVIEW_CARDS);
    picks.forEach(([type], i) => fan.append(this.cardButton(type, 'home-fan-card', { index: i, total: picks.length })));
    fan.hidden = !picks.length;
    // カードの一覧（すべて。種類ごとに1枚、枚数つき）
    const strip = this.part('deckStrip');
    strip.replaceChildren();
    for (const [type, count] of sorted) {
      const b = this.cardButton(type, 'home-strip-card');
      const c = document.createElement('span'); c.className = 'home-strip-count'; c.textContent = `×${count}`; c.setAttribute('aria-hidden', 'true');
      b.append(c);
      b.setAttribute('aria-label', `${this.cards[type].name}、${count}枚。タップで拡大`);
      strip.append(b);
    }
    this.part('deckKinds').textContent = sorted.length ? `${sorted.length}種類` : '';
    this.part('deckCardsWrap').hidden = !sorted.length;
    // 小さな見本（バトルのページのデッキの行）
    const thumb = this.part('deckThumb');
    thumb.replaceChildren();
    if (picks[0] && this.cards) thumb.append(deckCard(picks[0][0], this.cards, this.rarities, 'home-thumb-card'));
    this.renderSlots(deck);
  }

  /** カードの絵のボタン（タップで拡大。長押しでも CardZoom が開く） */
  cardButton(type, className, { index = 0, total = 1 } = {}) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `${className} raw-btn`;
    b.dataset.card = type;
    b.dataset.zoom = type;
    b.setAttribute('role', className === 'home-fan-card' ? 'listitem' : 'button');
    b.setAttribute('aria-label', `${this.cards[type].name}（タップで拡大）`);
    if (className === 'home-fan-card') {
      const mid = (total - 1) / 2;
      b.style.setProperty('--fan', String(index - mid));
      b.style.setProperty('--i', String(index));
    }
    b.append(deckCard(type, this.cards, this.rarities, 'home-card-art'));
    return b;
  }

  /** デッキの枠（1〜4）。保存済みならタップで切りかえ、空きならその枠で編成を始める */
  renderSlots(deck) {
    const wrap = this.part('deckSlots');
    wrap.replaceChildren();
    const slots = deck.state?.slots ?? [];
    if (!this.cards || !slots.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    for (let i = 0; i < DECK_SLOTS; i++) {
      const s = slots[i];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'home-slot raw-btn';
      b.dataset.slot = String(i);
      b.setAttribute('role', 'radio');
      const on = !!s && deck.state.active === i;
      b.setAttribute('aria-checked', String(on));
      b.classList.toggle('is-empty', !s);
      const n = document.createElement('b'); n.textContent = String(i + 1);
      const t = document.createElement('span'); t.textContent = s ? s.name : '空き';
      b.append(n, t);
      b.setAttribute('aria-label', s ? `デッキ${i + 1}「${s.name}」を使う` : `デッキ${i + 1}：空き枠。新しく編成する`);
      wrap.append(b);
    }
  }

  renderGachaShow() {
    const show = this.part('gachaShow');
    for (const [i, item] of GACHA_SHOWCASE.entries()) {
      const f = document.createElement('figure');
      f.className = 'home-gacha-item';
      f.dataset.rarity = item.rarity;
      f.style.setProperty('--i', String(i));
      const img = new Image(); img.src = item.src; img.alt = ''; img.width = 116; img.height = 116; img.draggable = false;
      const cap = document.createElement('figcaption'); cap.textContent = item.name;
      f.append(img, cap); show.append(f);
    }
  }

  /** アカウント・デッキのページの見出し（バトルのページと同じ値） */
  syncSummary() {
    this.part('accRank').textContent = this.part('rankText').textContent;
    this.part('accStats').textContent = this.part('stats').textContent;
  }

  /** フレンドの申請・招待の数（フレンドのタイルとお知らせに印を出す） */
  setSocialBadge(n) {
    this.socialCount = n;
    this.renderBadges();
  }

  renderFacts() { this.part('startLabel').textContent = MODES[this.mode].label; }

  renderModes() {
    const wrap = this.part('modes');
    wrap.replaceChildren();
    for (const [id, m] of Object.entries(MODES)) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'home-mode raw-btn'; b.dataset.mode = id; b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(id === this.mode));
      const ic = new Image(); ic.src = m.icon; ic.alt = ''; ic.width = 40; ic.height = 40; ic.draggable = false; ic.className = 'home-mode-icon';
      const s = document.createElement('strong'); s.textContent = m.chip;
      const n = document.createElement('small'); n.textContent = m.note;
      b.append(ic, s, n); wrap.append(b);
    }
  }

  renderMenu() {
    for (const [tab, groups] of Object.entries(GROUPS)) {
      const nav = this.box.querySelector(`[data-menu="${tab}"]`);
      for (const [name, ids, style] of groups) {
        const group = document.createElement('section');
        group.className = `home-menu-group is-${style}`;
        const heading = document.createElement('h2');
        heading.textContent = name;
        const grid = document.createElement('div');
        grid.className = 'home-menu-grid';
        for (const id of ids) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'home-tile raw-btn';
          button.dataset.id = id;
          // 遊び方だけは専用の絵がまだないので、「？」の文字で出す（絵ができたら assets/ui/home/help.png を足して、ここを消す）
          const iconHtml = id === 'help' ? '<b class="home-tile-glyph" aria-hidden="true">？</b>' : menuIcon(id, style === 'list' ? 44 : 36);
          button.innerHTML = `<span class="home-tile-icon">${iconHtml}</span><span class="home-tile-text"><span class="home-tile-label"></span>${style === 'list' ? '<small class="home-tile-note"></small>' : ''}</span>${style === 'list' ? '<span class="home-tile-chevron" aria-hidden="true"></span>' : ''}`;
          button.querySelector('.home-tile-label').textContent = MENU[id];
          const note = button.querySelector('.home-tile-note');
          if (note) note.textContent = MENU_NOTE[id] ?? '';
          grid.append(button);
        }
        group.append(heading, grid);
        nav.append(group);
      }
    }
  }

  /** 画面下のタブ */
  renderTabs() {
    const bar = this.part('tabbar');
    bar.replaceChildren();
    for (const t of TABS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `home-tab raw-btn${t.id === 'battle' ? ' home-tab-main' : ''}`;
      b.dataset.tab = t.id;
      b.setAttribute('role', 'tab');
      b.innerHTML = `<span class="home-tab-icon">${menuIcon(t.icon)}</span><span class="home-tab-label"></span><i class="home-tab-dot" hidden></i>`;
      b.querySelector('.home-tab-label').textContent = t.label;
      bar.append(b);
    }
    this.showTab(this.tab, { focus: false });
  }

  /** タブを切りかえる（id はタブか、タイルの id。タイルなら、そのタイルのあるタブ） */
  showTab(id, { focus = false } = {}) {
    const tab = GROUPS[id] ? id : TAB_OF[id] ?? 'battle';
    const order = TABS.map((t) => t.id);
    const dir = Math.sign(order.indexOf(tab) - order.indexOf(this.tab));
    this.tab = tab;
    for (const page of this.box.querySelectorAll('.home-page')) {
      const show = page.dataset.page === tab;
      const changed = page.hidden === show;
      page.hidden = !show;
      if (show && changed) {
        page.style.setProperty('--enter-dir', String(dir || 0));
        page.classList.remove('home-page-in'); void page.offsetWidth; page.classList.add('home-page-in');
      }
    }
    for (const b of this.part('tabbar').children) {
      const on = b.dataset.tab === tab;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus({ preventScroll: true });
    }
    this.box.scrollTop = 0;
  }

  onKey(e) {
    // タブは左右の矢印でも切りかえられる
    const tab = e.target.closest?.('.home-tab');
    if (!tab || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const ids = TABS.map((t) => t.id);
    const next = ids[(ids.indexOf(tab.dataset.tab) + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
    e.preventDefault();
    this.showTab(next, { focus: true });
  }

  onClick(e) {
    const tabBtn = e.target.closest('.home-tab');
    if (tabBtn) { sound.play('tap'); this.showTab(tabBtn.dataset.tab); return; }
    const modeBtn = e.target.closest('.home-mode');
    if (modeBtn) {
      this.mode = modeBtn.dataset.mode;
      try { localStorage.setItem(MODE_KEY, this.mode); } catch { /* ok */ }
      sound.play('tap');
      for (const tab of this.part('modes').children) tab.setAttribute('aria-selected', String(tab === modeBtn));
      this.renderFacts();
      return;
    }
    const card = e.target.closest('[data-card]');
    if (card) { sound.play('tap'); this.onZoomCard(card.dataset.card); return; }
    const slot = e.target.closest('.home-slot');
    if (slot) {
      sound.play('tap');
      const i = Number(slot.dataset.slot);
      const saved = loadDecks().slots[i];
      if (!saved) return this.onDeck(i);
      selectMyDeck(i);
      this.renderDeck(this.data?.deck?.name);
      this.syncSummary();
      this.toast(`「${saved.name}」を使います`, 'info');
      return;
    }
    const tile = e.target.closest('.home-tile');
    const act = tile ? tile.dataset.id : e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    sound.play('tap');
    if (act === 'account') return this.onAccount();
    if (act === 'retry') return this.refresh();
    if (!this.online() && (NEEDS_SERVER.has(act) || act === 'notice')) return this.toast(act === 'notice' ? '新しいお知らせはありません' : SERVER_REASON, 'info');
    if (act === 'start') return this.onPlay(this.mode);
    if (act === 'casual') return this.onPlay('online');
    if (act === 'deck') return this.onDeck();
    if (act === 'catalog') return this.onCatalog();
    if (act === 'settings') return this.onSettings();
    if (act === 'help') return this.onHelp();
    if (act === 'profile') return this.onProfile();
    if (act === 'rank') return this.onRanked();
    if (act === 'friend') return this.onFriends();
    if (act === 'shop') return this.onShop();
    if (act === 'gacha') return this.onGacha();
    if (act === 'skin') return this.onSkin();
    if (act === 'mission') return this.onMission();
    if (act === 'ranking') return this.onRanking();
    if (act === 'notice') {
      const n = this.data?.rewardsAvailable ?? 0;
      if (this.socialCount > 0) return this.onFriends();
      if (n > 0) return this.onProfile();
      if (this.data?.claimable > 0) return this.onMission();
      this.toast('新しいお知らせはありません', 'info');
    }
  }
}
