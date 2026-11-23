import { homeIcon } from './HomeIcons.js';
import { profileArt } from './profileArt.js';
// Battle Station：ルールセット・使用デッキ・対戦形式を分け、開始操作を下部へ集約する。
// 形式・デッキ・補助機能はnative dialogで選び、既存の各機能へ接続する。
// サーバー未接続でもソロ・同じ端末・デッキ・図鑑・設定は利用できる。
import { account } from './Account.js';
import { loadDecks, selectMyDeck, saveMyDeck, deleteMyDeck, DECK_SLOTS } from './DeckStore.js';
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
const menuIcon = (id, size = 24) => homeIcon(id, size);
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
  account: [['', ['profile', 'friend'], 'pair']],
  deck: [['カードとスキン', ['deck', 'catalog', 'skin'], 'grid']],
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
// タブの中だけで使う名前（アカウントのタブでは、何ができるかを名前にする）
const MENU_IN_PAGE = { account: { profile: 'アイコン・称号を変更' } };
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
// 排出されるアイテムの例（どれも gacha: true の景品）
const GACHA_POOL = [
  { src: 'assets/skins/castle-gold.png', name: '黄金の城', rarity: 'epic' },
  { src: 'assets/skins/castle-shadow.png', name: '影の城', rarity: 'legendary' },
  { src: 'assets/skins/unit-gold.png', name: '黄金の兵', rarity: 'epic' },
  { src: 'assets/skins/back-gold.png', name: '金のカード裏', rarity: 'epic', back: true },
];
const SORTS = {
  rarity: null, // currentDeck の並び（レアリティの高い順・枚数の多い順）
  count: (a, b) => b[1] - a[1],
  kind: (a, b, cards) => String(cards[a[0]].kind).localeCompare(String(cards[b[0]].kind)) || b[1] - a[1],
};
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
  constructor({ onPlay, onDeck, onCatalog, onSettings, onHelp = () => {}, getRecord = () => '', onProfile, onRanked = () => {}, onRanking = () => {}, onFriends = () => {}, onShop = () => {}, onGacha = () => {}, onGachaPull = () => {}, onSkin = () => {}, onMission = () => {}, onAccount, onZoomCard = () => {}, toast = () => {}, cards = null, rarities = null, rules = null, decks = null, ruleset = 'kingdom', factions = null, onRuleset = () => {} }) {
    Object.assign(this, { onPlay, onDeck, onCatalog, onSettings, onHelp, getRecord, onProfile, onRanked, onRanking, onFriends, onShop, onGacha, onGachaPull, onSkin, onMission, onAccount, onZoomCard, toast, cards, rarities, rules, decks, ruleset, factions, onRuleset });
    this.deckSort = 'rarity';
    this.data = null;
    this.mode = 'solo';
    this.faction = 'kingdom';
    try { const f = localStorage.getItem('cf-home-faction'); if (factions?.[f]) this.faction = f; } catch { /* optional */ }
    try { const m = localStorage.getItem(MODE_KEY); if (m in MODES) this.mode = m; } catch { /* 保存できなくても動く */ }
    const box = this.box = document.createElement('div');
    box.id = 'home'; box.className = 'screen home-reborn'; box.dataset.ruleset = ruleset; box.hidden = true;
    box.innerHTML = `<div class="home-sky" aria-hidden="true"></div>
    <div class="home-wrap">
      <header class="home-top">
        <button type="button" class="home-player raw-btn" data-act="profile" aria-label="プロフィールを開く">
          <span class="home-avatar" data-part="avatar"></span>
          <span class="home-who">
            <strong data-part="name">…</strong>
            <small data-part="title"></small>
            <span class="home-level" data-part="lvWrap"><b data-part="lv">Lv.1</b><span class="home-xp" role="progressbar" aria-label="次のレベルまで" data-part="xpbar"><i data-part="xpfill"></i><span class="home-xp-text" data-part="xptext"></span></span></span>
          </span>
        </button>
        <div class="home-side">
          <span class="home-wallet-pill"><span class="home-coins" title="ゲーム内通貨（無料）" data-part="coins"><img src="assets/ui/icon-coin.png" alt="コイン" width="22" height="22"><b>0</b></span><button type="button" class="home-coin-add raw-btn" data-act="shop" data-part="coinAdd" aria-label="コインのショップを開く">+</button></span>
          <button type="button" class="home-icon-btn raw-btn" data-act="notice" aria-label="お知らせ"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M12 3.2c-3.3 0-5.6 2.5-5.6 5.8v3.6L4.6 15.4c-.4.6 0 1.4.8 1.4h13.2c.8 0 1.2-.8.8-1.4l-1.8-2.8V9c0-3.3-2.3-5.8-5.6-5.8Z" fill="#ffd36b" stroke="#4d3426" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.6 18.6a2.5 2.5 0 0 0 4.8 0" fill="#ffd36b" stroke="#4d3426" stroke-width="1.8" stroke-linecap="round"/><path d="M8.6 7.6c.5-1 1.3-1.6 2.3-1.9" fill="none" stroke="#fff6cf" stroke-width="1.6" stroke-linecap="round"/></svg><i class="home-dot" data-part="dot" hidden></i></button>
        </div>
      </header>

      <div class="home-page" data-page="account" role="tabpanel" aria-label="アカウント" hidden>
        <h1 class="home-pagehead home-pagehead-crest"><span>アカウント</span></h1>
        <section class="home-card home-profilecard" aria-label="プロフィール">
          <span class="home-bigavatar" data-part="avatar2"></span>
          <div class="home-profilecard-text">
            <b data-part="name2">—</b>
            <span class="home-titlechip" data-part="title2"></span>
          </div>
          <button type="button" class="cf-btn cf-btn-secondary raw-btn home-profile-edit" data-act="profile"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4 14.5 13.2 5.3l1.5 1.5L5.5 16H4Z" fill="#ffd36b" stroke="#4d3426" stroke-width="1.6" stroke-linejoin="round"/><path d="m12 6.5 1.5 1.5" stroke="#4d3426" stroke-width="1.6"/></svg>プロフィールを編集</button>
        </section>
        <section class="home-card home-rankstats" aria-label="ランクと戦績">
          <div class="home-rankstats-head">
            <span class="home-rankcard-emblem" data-part="accEmblem"></span>
            <div class="home-rankcard-text"><span class="home-eyebrow">ランク</span><b data-part="accRank">—</b></div>
            <span class="home-ribbon" data-part="accSeason"></span>
          </div>
          <div class="home-stats" data-part="accStatsGrid"></div>
        </section>
        <p class="home-stats-text" data-part="accStats" hidden></p>
        <section class="home-card home-levelcard" aria-label="レベル" data-part="levelCard">
          <span class="home-levelcard-badge"><small>Lv.</small><b data-part="lv2">1</b></span>
          <div class="home-levelcard-text">
            <span class="home-levelcard-next" data-part="xpNext"></span>
            <span class="home-xp home-xp-big" aria-hidden="true"><i data-part="xpfill2"></i><span class="home-xp-text" data-part="xptext2"></span></span>
          </div>
          <button type="button" class="cf-btn cf-btn-primary cf-btn-sm raw-btn" data-act="profile" data-part="lvReward" hidden>報酬を受け取る</button>
        </section>
        <section class="home-card home-actions">
          <nav class="home-menu" aria-label="アカウント" data-menu="account"></nav>
          <button type="button" class="cf-btn cf-btn-primary raw-btn home-guest-btn" data-act="account" data-part="guest" hidden>アカウントを作成する</button>
          <p class="home-guest-note" data-part="guestNote" hidden>アカウントを作成すると、別の端末でもデータを引き継げます。</p>
        </section>
      </div>

      <div class="home-page" data-page="deck" role="tabpanel" aria-label="デッキ" hidden>
        <h1 class="home-pagehead home-pagehead-cards"><span>デッキ編成</span></h1>
        <div class="home-deck-tabsrow">
          <div class="home-deck-slots" role="radiogroup" aria-label="デッキを切りかえる" data-part="deckSlots"></div>
          <button type="button" class="home-deck-pen raw-btn" data-act="deck" aria-label="デッキを編成する"><svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M4 14.5 13.2 5.3l1.5 1.5L5.5 16H4Z" fill="#fff" stroke="#4d3426" stroke-width="1.6" stroke-linejoin="round"/></svg></button>
        </div>
        <section class="home-deckhero" aria-labelledby="home-deck-name">
          <div class="home-deckhero-head">
            <h2 id="home-deck-name" data-part="deck2">—</h2>
            <span class="home-deck-state" data-part="deckState"></span>
            <div class="home-deck-meta" data-part="deckMeta"></div>
          </div>
          <div class="home-deck-warnbox" data-part="deckWarn" hidden></div>
          <div class="home-deck-stage"><div class="home-deck-fan" data-part="deckFan" role="list" aria-label="デッキの代表カード（タップで拡大）"></div></div>
        </section>
        <div class="home-deck-actions">
          <button type="button" class="cf-btn cf-btn-secondary raw-btn" data-act="deckCopy">コピー</button>
          <button type="button" class="cf-btn cf-btn-primary raw-btn home-deck-editbtn" data-act="deck">デッキを編集</button>
          <button type="button" class="cf-btn cf-btn-secondary raw-btn" data-act="deckDelete">削除</button>
        </div>
        <section class="home-card home-deck-cards" aria-label="デッキのカード" data-part="deckCardsWrap">
          <div class="home-deck-cards-head">
            <h2 class="home-card-title">デッキのカード<small data-part="deckKinds"></small></h2>
            <select class="home-deck-sort" data-part="deckSort" aria-label="並べ方">
              <option value="rarity">レアリティ順</option><option value="count">枚数順</option><option value="kind">種類順</option>
            </select>
          </div>
          <div class="home-deck-strip" data-part="deckStrip"></div>
          <p class="home-hint">カードをタップすると大きく見られます</p>
        </section>
        <nav class="home-menu" aria-label="カード" data-menu="deck"></nav>
      </div>

      <div class="home-page" data-page="shop" role="tabpanel" aria-label="ガチャ" hidden>
        <h1 class="home-pagehead"><span>ガチャ</span></h1>
        <section class="home-gacha" aria-label="ガチャの目玉">
          <div class="home-gacha-rays" aria-hidden="true"></div>
          <div class="home-gacha-show" data-part="gachaShow"></div>
        </section>
        <section class="home-gacha-banner">
          <span class="home-eyebrow">ふつうのガチャ</span>
          <h2>見た目のアイテムを集めよう</h2>
          <p>城・兵士・カード裏などの見た目が当たります。強さは変わりません。</p>
        </section>
        <div class="home-gacha-buy">
          <span class="home-wallet"><img src="assets/ui/icon-coin.png" alt="" width="22" height="22"><small>所持コイン</small><b data-part="coins2">0</b></span>
          <button type="button" class="cf-btn cf-btn-primary raw-btn" data-act="gacha">ガチャを引く</button>
        </div>
        <div class="home-gacha-pulls" data-part="pulls" hidden>
          <button type="button" class="cf-btn cf-btn-secondary raw-btn" data-act="pull" data-count="1"><span>1回</span><img src="assets/ui/icon-coin.png" alt="" width="20" height="20"><b data-part="cost1"></b><small>コイン</small></button>
          <button type="button" class="cf-btn cf-btn-secondary raw-btn" data-act="pull" data-count="10"><span>10連</span><img src="assets/ui/icon-coin.png" alt="" width="20" height="20"><b data-part="cost10"></b><small>コイン</small><em class="home-deal" data-part="deal" hidden>10連でお得！</em></button>
        </div>
        <section class="home-card home-gacha-pool" aria-labelledby="home-pool-title">
          <h2 class="home-plaque" id="home-pool-title">排出されるアイテムの例</h2>
          <div class="home-pool-grid" data-part="gachaPool"></div>
        </section>
        <nav class="home-menu" aria-label="ガチャ・ショップ" data-menu="shop"></nav>
      </div>

      <div class="home-page" data-page="settings" role="tabpanel" aria-label="設定" hidden>
        <h1 class="home-pagehead home-pagehead-gear"><span>設定</span></h1>
        <nav class="home-menu" aria-label="設定" data-menu="settings"></nav>
        <section class="home-card home-points" aria-labelledby="home-points-title">
          <h2 class="home-plaque" id="home-points-title">遊び方のポイント</h2>
          <ol>
            <li><img src="assets/castles/castle-orange.png" alt="" width="56" height="56"><span><b>相手の城を落とせば勝ち</b>城のHPを0にしよう</span></li>
            <li><img src="assets/units/knight-blue.png" alt="" width="56" height="56"><span><b>兵士は毎ターン進む</b>相手の城に着くと大ダメージ</span></li>
            <li><img src="assets/units/monster-dragon.png" alt="" width="56" height="56"><span><b>まん中の魔物を倒す</b>とどめを刺すとカードがもらえる</span></li>
          </ol>
          <button type="button" class="cf-btn cf-btn-secondary raw-btn" data-act="help">くわしい遊び方を見る</button>
        </section>
      </div>

      <div class="home-page" data-page="battle" role="tabpanel" aria-label="バトル">
        <div class="home-worlds" role="group" aria-label="ルールセット" data-part="worlds"></div>
        <div class="home-battle-heading"><p>CASTLE FIELD</p><h1 data-part="worldName">城を落とせ。</h1><span>カードで戦う、城攻めバトル</span></div>
        <figure class="home-hero" aria-label="選択中の戦場"><img class="home-arena" src="assets/bg/home-arena-${ruleset === 'factions' ? 'factions' : 'duel'}.png" alt="${ruleset === 'factions' ? '四つの陣営の城と、中央に集まる道' : '道で結ばれた青とオレンジの二つの城'}" width="960" height="570"></figure>
        <div class="home-progress-line"><span class="home-season" data-part="season"></span><button class="home-rank-chip raw-btn" data-part="rank" data-act="rank"><span data-part="rankEmblem"></span><span><small>ランク</small><span data-part="rankText">未参加</span></span>${homeIcon('arrow',16)}</button></div>
        <section class="home-battle-console" aria-label="対戦の準備">
          <div class="home-deckpanel" aria-label="使うデッキ">
            <div class="home-deck-fan home-deck-fan-mini" data-part="deckFan2" aria-label="使用デッキの代表カード"></div>
            <button class="home-deckpanel-text raw-btn" data-act="chooseDeck"><span class="home-eyebrow">使用デッキ</span><strong class="home-deckpanel-name" data-part="deck">—</strong><span class="home-deck-meta" data-part="deckMeta2"></span></button>
            <button class="home-deck-change raw-btn" data-act="chooseDeck" aria-label="使用デッキを選択・編集">${homeIcon('arrow',22)}</button>
          </div>
          <button class="home-mode-picker raw-btn" data-act="chooseMode" aria-haspopup="dialog"><span class="home-selected-mode-icon" data-part="modeIcon"></span><span><small>対戦形式</small><strong data-part="modeName">ひとりで遊ぶ</strong></span><span class="home-mode-change">変更${homeIcon('down',16)}</span></button>
          <button type="button" class="home-start raw-btn" data-act="start"><span data-part="startLabel">対戦の準備へ</span>${homeIcon('arrow',22)}</button>
          <p class="home-note" data-part="note" role="status"></p>
          <button type="button" class="home-retry cf-btn raw-btn" data-act="retry" hidden>再読み込み</button>
          <dl class="home-facts" hidden><div><dt>戦績</dt><dd data-part="stats">—</dd></div></dl>
        </section>
        <div class="home-shortcuts"><button class="raw-btn" data-act="catalog">${homeIcon('catalog',20)}カード図鑑</button><button class="raw-btn" data-act="more" aria-haspopup="dialog">${homeIcon('more',20)}その他</button></div>
      </div>
      <nav class="home-tabbar" role="tablist" aria-label="メニュー" data-part="tabbar"></nav>
    </div>
    <dialog class="home-sheet" id="home-mode-sheet" aria-labelledby="home-mode-title"><div class="home-sheet-heading"><h2 id="home-mode-title">対戦形式</h2><button class="raw-btn home-sheet-close" data-close-sheet aria-label="閉じる">${homeIcon('close')}</button></div><div class="home-modes" role="group" aria-label="対戦形式" data-part="modes"></div></dialog>
    <dialog class="home-sheet" id="home-deck-sheet" aria-labelledby="home-deck-title"><div class="home-sheet-heading"><h2 id="home-deck-title">使うデッキ</h2><button class="raw-btn home-sheet-close" data-close-sheet aria-label="閉じる">${homeIcon('close')}</button></div><div data-part="deckChoices"></div></dialog>
    <dialog class="home-sheet" id="home-more-sheet" aria-labelledby="home-more-title"><div class="home-sheet-heading"><h2 id="home-more-title">バトルメニュー</h2><button class="raw-btn home-sheet-close" data-close-sheet aria-label="閉じる">${homeIcon('close')}</button></div><nav class="home-menu" aria-label="ほかの対戦と進行" data-menu="battle"></nav><button class="home-help-link raw-btn" data-act="help">${homeIcon('help')}遊び方</button></dialog>`;
    document.getElementById('app').append(box);
    this.part = (n) => box.querySelector(`[data-part="${n}"]`);
    this.tab = 'battle';
    this.renderMenu();
    this.renderTabs();
    this.navLayout = matchMedia('(min-width: 1000px) and (min-height: 650px)');
    const orient = () => this.part('tabbar').setAttribute('aria-orientation', this.navLayout.matches ? 'vertical' : 'horizontal');
    this.navLayout.addEventListener('change', orient); orient();
    for (const dialog of box.querySelectorAll('.home-sheet')) dialog.addEventListener('click', e => { if (e.target === dialog) { const r=dialog.getBoundingClientRect(); if(e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom) dialog.close(); } });
    this.renderModes();
    this.renderGachaShow();
    box.addEventListener('click', (e) => this.onClick(e));
    box.addEventListener('keydown', (e) => this.onKey(e));
    this.part('deckSort').addEventListener('change', (e) => { this.deckSort = e.target.value; this.renderDeck(this.data?.deck?.name); });
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

  close() { this.closeSheets(); this.box.hidden = true; }

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
    account.api('GET', '/api/gacha/info').then(({ json }) => {
      if (this.request !== request || !json?.ok) return;
      this.gachaInfo = json;
      this.renderPulls();
    }).catch(() => { /* 値段が分からなければ、ガチャの画面から引く */ });
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
    const text = this.ruleset === 'factions' ? '' : this.season ? `シーズン ${this.season.id}` : '';
    this.part('season').textContent = text;
    this.part('accSeason').textContent = text;
  }

  /** 1回・10連のボタン（値段はサーバーのガチャの設定。分からないときは出さない） */
  renderPulls() {
    const b = this.gachaInfo?.banner;
    const show = this.online() && Number.isFinite(b?.costSingle) && Number.isFinite(b?.costTen);
    this.part('pulls').hidden = !show;
    if (!show) return;
    this.part('cost1').textContent = String(b.costSingle);
    this.part('cost10').textContent = String(b.costTen);
    this.part('deal').hidden = !(b.costTen < b.costSingle * 10);
    for (const btn of this.part('pulls').querySelectorAll('[data-act=pull]')) {
      const cost = btn.dataset.count === '10' ? b.costTen : b.costSingle;
      btn.setAttribute('aria-label', `${btn.dataset.count === '10' ? '10連' : '1回'}　${cost} コインで引く`);
    }
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
    const xpText = lv ? (lv.maxed ? 'MAX' : `EXP ${lv.xpIntoLevel} / ${lv.xpForNext}`) : '';
    this.part('xptext').textContent = xpText;
    this.part('xptext2').textContent = xpText;
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
    this.syncProfileCard(av);
    this.part('coinAdd').hidden = false;
    const coins = String(d?.coins ?? 0);
    this.part('coins').querySelector('b').textContent = coins;
    this.part('coins2').textContent = coins;
    this.part('guest').hidden = u?.kind !== 'guest';
    this.part('guestNote').hidden = u?.kind !== 'guest';
    this.renderBadges();
    this.renderPulls();
    this.renderSeason();
    this.renderWorlds();
    const sum = d?.rank;
    const member = u?.kind === 'member';
    this.part('rankEmblem').innerHTML = member ? rankEmblem(sum?.rank ?? null, 26) : '';
    this.part('accEmblem').innerHTML = member ? rankEmblem(sum?.rank ?? null, 64) : '';
    const rankFull = !member ? 'アカウントを作ると参加できます'
      : sum?.rank ? `${sum.rank.divisionLabel}（${sum.rank.rp} RP）` : sum ? `認定戦 ${sum.placementTotal - sum.placementLeft}/${sum.placementTotal}` : '—';
    this.setRank(member ? rankFull : '未参加', rankFull);
    this.renderDeck(d?.deck?.name);
    const s = d?.stats;
    this.part('stats').textContent = s?.matches ? `${s.matches}戦 ${s.wins}勝 ${s.losses}敗（勝率 ${s.winRate}%）` : 'まだ対戦がありません';
    this.renderStatsGrid(s ? [['対戦数', s.matches ?? 0], ['勝利', s.wins ?? 0], ['敗北', s.losses ?? 0], ['勝率', s.matches ? `${s.winRate}%` : '—']] : null);
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
    this.syncProfileCard(av);
    this.part('coinAdd').hidden = true;
    this.part('pulls').hidden = true;
    this.part('guest').hidden = true;
    this.part('guestNote').hidden = true;
    this.part('season').textContent = '';
    this.part('accSeason').textContent = '';
    this.renderWorlds();
    this.part('rankEmblem').innerHTML = '';
    this.part('accEmblem').innerHTML = '';
    this.setRank('未参加', 'サーバーで遊ぶと参加できます');
    this.renderDeck(null);
    this.part('stats').textContent = this.getRecord() || 'まだ対戦がありません';
    this.renderStatsGrid(null);
    this.syncSummary();
    for (const tile of this.box.querySelectorAll('.home-tile')) tile.querySelector('.home-badge')?.remove();
    this.part('dot').hidden = true;
    this.renderFacts();
  }

  /** アカウントのページの大きなプロフィール（上の帯と同じ値） */
  syncProfileCard(av) {
    const big = this.part('avatar2');
    big.replaceChildren(...[...av.childNodes].map((n) => n.cloneNode(true)));
    if (av.dataset.frame) big.dataset.frame = av.dataset.frame; else delete big.dataset.frame;
    this.part('name2').textContent = this.part('name').textContent;
    const title = this.part('title').textContent;
    this.part('title2').textContent = title;
    this.part('title2').hidden = !title;
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
    if (this.ruleset === 'factions') {
      const d = this.decks?.[this.faction];
      return { name:d?.name ?? '陣営を選択', list:d?.cards ?? {}, kind:'faction', check:{ok:true,total:Object.values(d?.cards ?? {}).reduce((a,b)=>a+b,0)}, state:null };
    }
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
    if (mine) return { name: sample?.name ?? serverName ?? '見本のデッキ', list: sample?.cards ?? {}, check:sampleCheck, kind:'fallback', slot,state,repairReason:check?.reason,invalidName:mine.name };
    if (sample) return { name: sample.name, list: sample.cards, check: sampleCheck, kind: 'sample', slot, state };
    return { name: serverName ?? '未設定', list: null, check: null, kind: 'none', slot, state };
  }

  renderDeck(serverName) {
    const deck = this.currentDeck(serverName);
    this.part('deck').textContent = deck.name;
    this.box.querySelector('.home-deckpanel .home-eyebrow').textContent=this.ruleset==='factions'?'使用する陣営':'使用デッキ';
    this.part('deck2').textContent = deck.name;
    const state = this.part('deckState');
    state.className = `home-deck-state is-${deck.kind}`;
    state.textContent = { mine: '使えます', sample: '見本', invalid: '要調整', none: '', fallback:'見本を使用中', faction: '固定デッキ' }[deck.kind];
    state.title = deck.kind === 'invalid' ? `決まりに合わないため、対戦では「${deck.fallback ?? '見本のデッキ'}」を使います（${deck.check?.reason ?? ''}）`
      : deck.kind === 'sample' ? 'デッキを編成するまでは、この見本のデッキで対戦します' : '';
    // 枚数・コスト
    for (const metaName of ['deckMeta', 'deckMeta2']) {
      const meta = this.part(metaName);
      meta.replaceChildren();
      if (!deck.check) continue;
      const max = this.rules?.deckCostMax ?? 100;
      for (const [label, value] of (deck.kind === 'faction' ? [['枚数', `${deck.check.total}枚`], ['構成', '陣営固定']] : [['枚数', `${deck.check.total}枚`], ['コスト', `${deck.check.cost}/${max}`]])) {
        const s = document.createElement('span'); const b = document.createElement('b');
        s.textContent = label; b.textContent = value; s.append(b); meta.append(s);
      }
    }
    const warn = this.part('deckWarn');
    warn.hidden = !['invalid','fallback'].includes(deck.kind);
    warn.textContent = deck.kind === 'fallback' ? `保存した「${deck.invalidName}」は要調整（${deck.repairReason ?? '構成を確認してください'}）。対戦では見本のデッキを使います。` : deck.kind === 'invalid' ? `${deck.check?.reason ?? '決まりに合いません'}。対戦では見本のデッキを使います` : '';
    // 代表のカード（レアリティの高い順・枚数の多い順）
    const entries = Object.entries(deck.list ?? {}).filter(([type]) => this.cards && Object.hasOwn(this.cards, type));
    const order = this.rarities ? Object.keys(this.rarities) : [];
    const rank = (type) => { const r = this.cards[type].rarity; return this.rarities?.[r]?.special ? 2.5 : order.indexOf(r); };
    const sorted = [...entries].sort((a, b) => rank(b[0]) - rank(a[0]) || b[1] - a[1]);
    const picks = sorted.slice(0, PREVIEW_CARDS);
    for (const fanName of ['deckFan', 'deckFan2']) {
      const fan = this.part(fanName);
      fan.replaceChildren();
      if(fanName === 'deckFan2' && deck.kind === 'faction') {
        const emblem = new Image();emblem.src=`assets/ui/factions/crest-${this.faction}.png`;emblem.alt='';emblem.width=60;emblem.height=60;fan.append(emblem);fan.hidden=false;fan.setAttribute('aria-label',`選択中の陣営：${deck.name}`);continue;
      }
      (fanName === 'deckFan2' ? [picks[0], sorted.find(([type]) => this.cards[type].kind !== this.cards[picks[0]?.[0]]?.kind) ?? picks[1]].filter(Boolean) : picks).forEach(([type], i) => fan.append(this.cardButton(type, 'home-fan-card', { index: i, total: picks.length })));
      fan.hidden = !picks.length;
    }
    // カードの一覧（すべて。種類ごとに1枚、枚数つき）
    const strip = this.part('deckStrip');
    strip.replaceChildren();
    const sortFn = SORTS[this.deckSort];
    const listed = sortFn ? [...sorted].sort((a, b) => sortFn(a, b, this.cards)) : sorted;
    for (const [type, count] of listed) {
      const b = this.cardButton(type, 'home-strip-card');
      const c = document.createElement('span'); c.className = 'home-strip-count'; c.textContent = `×${count}`; c.setAttribute('aria-hidden', 'true');
      b.append(c);
      b.setAttribute('aria-label', `${this.cards[type].name}、${count}枚。タップで拡大`);
      strip.append(b);
    }
    this.part('deckKinds').textContent = sorted.length ? `${sorted.length}種類` : '';
    this.part('deckCardsWrap').hidden = !sorted.length;
    this.currentDeckInfo = deck;
    for(const act of ['deckCopy','deckDelete']) { const b=this.box.querySelector(`[data-act=${act}]`);b.disabled=deck.kind==='faction';b.title=deck.kind==='faction'?'4陣営は陣営ごとの固定デッキです':''; }
    this.renderSlots(deck);
  }

  /** カードの絵のボタン（タップで拡大。長押しでも CardZoom が開く） */
  cardButton(type, className, { index = 0, total = 1 } = {}) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `${className} raw-btn`;
    b.dataset.card = type;
    b.dataset.zoom = type;
    b.setAttribute('role', 'button');
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
      const t = document.createElement('span'); t.textContent = `デッキ${i + 1}`;
      b.append(t);
      if (!s) { const plus = document.createElement('small'); plus.textContent = '＋'; plus.setAttribute('aria-hidden', 'true'); b.append(plus); }
      b.title = s ? s.name : '空き枠（タップで新しく編成）';
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
    const pool = this.part('gachaPool');
    for (const item of GACHA_POOL) {
      const f = document.createElement('figure');
      f.className = `home-pool-item${item.back ? ' is-back' : ''}`;
      f.dataset.rarity = item.rarity;
      const img = new Image(); img.src = item.src; img.alt = ''; img.draggable = false;
      const cap = document.createElement('figcaption'); cap.textContent = item.name;
      f.append(img, cap); pool.append(f);
    }
    const more = document.createElement('p'); more.className = 'home-pool-more'; more.textContent = 'ほかにも多数！';
    pool.append(more);
  }

  /** ランク：バトルのページは短く（城の絵の下の帯）、アカウントのページはくわしく出す */
  setRank(short, full) {
    this.part('rankText').textContent = this.ruleset === 'factions' ? '対象外' : short;
    this.part('rank').title = full;
    this.rankFull = full;
  }

  /** アカウント・デッキのページの見出し（バトルのページと同じ値） */
  syncSummary() {
    this.part('accRank').textContent = this.rankFull ?? this.part('rankText').textContent;
    this.part('accStats').textContent = this.part('stats').textContent;
  }

  /** フレンドの申請・招待の数（フレンドのタイルとお知らせに印を出す） */
  setSocialBadge(n) {
    this.socialCount = n;
    this.renderBadges();
  }

  renderFacts() {
    this.part('startLabel').textContent = '対戦の準備へ';
    this.part('modeName').textContent = MODES[this.mode].label;
    this.part('modeIcon').innerHTML = homeIcon(this.mode);
    this.box.querySelector('.home-start').setAttribute('aria-label', `${MODES[this.mode].label}：対戦の準備へ`);
  }

  renderWorlds() {
    const wrap = this.part('worlds'); wrap.replaceChildren();
    for (const [id,label] of [['kingdom','通常モード'],['factions','4陣営モード']]) {
      const b=document.createElement('button'); b.type='button'; b.className='home-world raw-btn'; b.dataset.ruleset=id;
      b.textContent=label; b.setAttribute('aria-pressed',String(id===this.ruleset)); wrap.append(b);
    }
    this.part('worldName').textContent = this.ruleset === 'factions' ? '四つの陣営、激突。' : '城を落とせ。';
  }

  renderModes() {
    const wrap=this.part('modes'); wrap.replaceChildren();
    if(this.ruleset==='factions' && this.mode==='online') this.mode='solo';
    for(const [id,m] of Object.entries(MODES)) {
      const b=document.createElement('button'); b.type='button'; b.className='home-mode raw-btn'; b.dataset.mode=id;
      b.setAttribute('aria-pressed',String(id===this.mode));
      b.innerHTML=`${homeIcon(id,28)}<span><strong>${m.label}</strong><small>${m.note}</small></span>${homeIcon('check',20)}`;
      if(id==='online' && this.ruleset==='factions') { b.disabled=true; b.querySelector('small').textContent='4陣営のオンラインは準備中'; }
      wrap.append(b);
    }
    this.renderFacts();
  }

  openSheet(id) { this.box.querySelector(`#home-${id}-sheet`).showModal(); }
  closeSheets() { for(const d of this.box.querySelectorAll('.home-sheet[open]')) d.close(); }

  renderDeckChoices() {
    const wrap=this.part('deckChoices'); wrap.replaceChildren();
    const factionMode=this.ruleset==='factions';
    this.box.querySelector('#home-deck-title').textContent=factionMode?'陣営を選択':'使うデッキ';
    const choices=factionMode ? Object.entries(this.decks ?? {}).map(([id,d])=>({id,name:d.name,list:d.cards,description:this.factions?.[id]?.description}))
      : loadDecks().slots.map((d,i)=>({id:String(i),name:d?.name ?? `デッキ${i+1}を作成`,list:d?.list,description:d?(checkCostDeck(d.list,this.cards,this.rarities,this.rules).ok?'選択して使う':'要調整：編集して使う'):'空き枠'}));
    for(const c of choices) {
      const b=document.createElement('button'); b.type='button'; b.className='home-deck-choice raw-btn';
      b.dataset[factionMode?'faction':'chooseSlot']=c.id;
      const on=factionMode ? this.faction===c.id : this.currentDeckInfo?.kind==='mine' && this.currentDeckInfo.slot===Number(c.id);
      b.setAttribute('aria-pressed',String(on));
      if(factionMode) { const im=new Image(); im.src=`assets/ui/factions/crest-${c.id}.png`; im.alt=''; im.width=48; im.height=48; b.append(im); }
      const text=document.createElement('span'),name=document.createElement('strong'),note=document.createElement('small');
      name.textContent=c.name; note.textContent=c.description; text.append(name,note); b.append(text); b.insertAdjacentHTML('beforeend', homeIcon(on?'check':'arrow',20));wrap.append(b);
    }
    if(!factionMode) {
      const edit=document.createElement('button'); edit.type='button';edit.className='home-sheet-edit raw-btn';edit.dataset.act='deck';edit.textContent='使用デッキを編集';wrap.append(edit);
      if(this.currentDeckInfo?.kind==='sample') { const note=document.createElement('p');note.className='home-sheet-note';note.textContent='現在は見本のデッキを使用中。空き枠から自分のデッキを作れます。';wrap.append(note); }
    } else { const note=document.createElement('p');note.className='home-sheet-note';note.textContent='4陣営は陣営ごとの固定デッキです。カード図鑑で構成を確認できます。';wrap.append(note); }
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
          // 補助メニューもナビと共通のSVGアイコンで表示する。
          const iconHtml = menuIcon(id, 24);
          button.innerHTML = `<span class="home-tile-icon">${iconHtml}</span><span class="home-tile-text"><span class="home-tile-label"></span>${style === 'list' ? '<small class="home-tile-note"></small>' : ''}</span>${style === 'list' ? '<span class="home-tile-chevron" aria-hidden="true"></span>' : ''}`;
          button.querySelector('.home-tile-label').textContent = MENU_IN_PAGE[tab]?.[id] ?? MENU[id];
          const note = button.querySelector('.home-tile-note');
          if (note) note.textContent = MENU_NOTE[id] ?? '';
          grid.append(button);
        }
        if (name) group.append(heading);
        group.append(grid);
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
      b.id = `home-tab-${t.id}`; b.setAttribute('aria-controls', `home-page-${t.id}`);
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
    if (this.box.dataset.tab !== tab) {
      this.box.dataset.tab = tab;
      const sky = this.box.querySelector('.home-sky');
      sky.classList.remove('home-sky-in'); void sky.offsetWidth; sky.classList.add('home-sky-in');
    }
    for (const page of this.box.querySelectorAll('.home-page')) {
      page.id = `home-page-${page.dataset.page}`; page.setAttribute('aria-labelledby', `home-tab-${page.dataset.page}`);
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

  /** 使うデッキを、空いている枠にコピーする（見本のデッキもコピーできる） */
  copyDeck() {
    const deck = this.currentDeckInfo;
    if (!deck?.list) return this.toast('コピーできるデッキがありません', 'info');
    const slot = loadDecks().slots.findIndex((d) => !d);
    if (slot < 0) return this.toast(`空いているデッキ枠がありません（${DECK_SLOTS}つまで）。いらないデッキを削除してください`, 'info');
    const name = `${deck.name}のコピー`.slice(0, 24);
    if (!saveMyDeck(slot, name, deck.list)) return this.toast('この端末に保存できませんでした', 'info');
    this.renderDeck(this.data?.deck?.name);
    this.toast(`デッキ${slot + 1}にコピーしました`, 'info');
  }

  /** 使うデッキを削除する（自分で作ったデッキだけ。見本は消せない） */
  deleteDeck() {
    const deck = this.currentDeckInfo;
    if (!deck || !['mine', 'invalid'].includes(deck.kind)) return this.toast('見本のデッキは削除できません', 'info');
    if (!window.confirm(`「${deck.name}」を削除しますか？`)) return;
    if (!deleteMyDeck(deck.slot)) return this.toast('この端末に保存できませんでした', 'info');
    this.renderDeck(this.data?.deck?.name);
    this.toast(`「${deck.name}」を削除しました`, 'info');
  }

  onKey(e) {
    // タブは左右の矢印でも切りかえられる
    const tab = e.target.closest?.('.home-tab');
    const keys = this.navLayout.matches ? ['ArrowUp','ArrowDown'] : ['ArrowLeft','ArrowRight'];
    if (!tab || ![...keys,'Home','End'].includes(e.key)) return;
    const ids = TABS.map((t) => t.id);
    const next = e.key === 'Home' ? ids[0] : e.key === 'End' ? ids.at(-1) : ids[(ids.indexOf(tab.dataset.tab) + (e.key === keys[1] ? 1 : ids.length - 1)) % ids.length];
    e.preventDefault();
    this.showTab(next, { focus: true });
  }

  onClick(e) {
    if(e.target.closest('[data-close-sheet]')) { this.closeSheets(); return; }
    const world=e.target.closest('[data-ruleset]');
    if(world?.tagName==='BUTTON') { if(world.dataset.ruleset!==this.ruleset) this.onRuleset(world.dataset.ruleset); return; }
    const faction=e.target.closest('[data-faction]');
    if(faction) { this.faction=faction.dataset.faction; try{localStorage.setItem('cf-home-faction',this.faction)}catch{} this.closeSheets();this.renderDeck();return; }
    const choose=e.target.closest('[data-choose-slot]');
    if(choose) { const slot=Number(choose.dataset.chooseSlot),deck=loadDecks().slots[slot];this.closeSheets(); if(!deck || !checkCostDeck(deck.list,this.cards,this.rarities,this.rules).ok) return this.onDeck(slot);selectMyDeck(slot);this.renderDeck();return; }

    const tabBtn = e.target.closest('.home-tab');
    if (tabBtn) { sound.play('tap'); this.showTab(tabBtn.dataset.tab); return; }
    const modeBtn = e.target.closest('.home-mode');
    if (modeBtn) {
      this.mode = modeBtn.dataset.mode;
      try { localStorage.setItem(MODE_KEY, this.mode); } catch { /* ok */ }
      sound.play('tap');
      for (const tab of this.part('modes').children) tab.setAttribute('aria-pressed', String(tab === modeBtn));
      this.closeSheets();
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
    if(act==='chooseMode') return this.openSheet('mode');
    if(act==='chooseDeck') { this.renderDeckChoices(); return this.openSheet('deck'); }
    if(act==='more') return this.openSheet('more');
    this.closeSheets();
    if(this.ruleset==='factions' && ['rank','ranking','friend','casual','mission'].includes(act)) return this.toast('この機能は通常モードで利用できます。4陣営は現在ローカル対戦に対応しています。','info');
    if(this.ruleset==='factions' && act==='deck') { this.renderDeckChoices();return this.openSheet('deck'); }
    sound.play('tap');
    if (act === 'account') return this.onAccount();
    if (act === 'retry') return this.refresh();
    if (!this.online() && (NEEDS_SERVER.has(act) || act === 'notice')) return this.toast(act === 'notice' ? '新しいお知らせはありません' : SERVER_REASON, 'info');
    if (act === 'start') return this.onPlay(this.mode);
    if (act === 'deckCopy') return this.copyDeck();
    if (act === 'deckDelete') return this.deleteDeck();
    if (act === 'pull') return this.onGachaPull(Number(e.target.closest('[data-count]').dataset.count));
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
