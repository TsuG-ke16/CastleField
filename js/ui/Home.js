import { homeIcon } from './HomeIcons.js';
import { profileArt } from './profileArt.js';
// Battle Station：ルールセット・使用デッキ・対戦形式を分け、開始操作を下部へ集約する。
// 設定はホーム、購入・抽選・装備は独立ページ。ゲームの条件と数値は変更しない。
// サーバー未接続でもソロ・同じ端末・デッキ・図鑑・設定は利用できる。
import { account } from './Account.js';
import { loadDecks, selectMyDeck, saveMyDeck, deleteMyDeck, DECK_SLOTS } from './DeckStore.js';
import { deckCard } from './DeckPreview.js';
import { checkCostDeck } from '../game/Setup.js';
import { sound } from './Sound.js';
import { rankEmblem } from './RankEmblem.js';
import { HomeDioramaGL } from './HomeDioramaGL.js';

const MODE_KEY = 'cf-home-mode';
const MODES = {
  solo: { label: 'CPU対戦', chip: 'ひとりで', note: 'CPUと対戦', icon: 'assets/ui/icon-mode-solo.png' },
  online: { label: 'カジュアル対戦', chip: 'カジュアル', note: '合言葉で友だちと', icon: 'assets/ui/icon-mode-online.png' },
  local: { label: '同じ端末で遊ぶ', chip: '同じ端末', note: '2〜8人で交代', icon: 'assets/ui/icon-mode-local.png' },
};
// サーバーのアカウント機能がないと使えないメニュー
const NEEDS_SERVER = new Set(['rank', 'ranking', 'friend', 'profile', 'shop', 'gacha', 'skin', 'mission']);
const SERVER_REASON = 'オンライン接続が必要です。ひとりで遊ぶ・同じ端末の対戦はそのまま利用できます';
const menuIcon = (id, size = 24) => homeIcon(id, size);
// 主ナビ5項目。装備・公開プロフィール・設定はメニューから独立ページへ。
const TABS = [
  { id: 'deck', label: 'デッキ', icon: 'deck' },
  { id: 'gacha', label: 'ガチャ', icon: 'gacha' },
  { id: 'battle', label: 'バトル', icon: 'rank' },
  { id: 'shop', label: 'ショップ', icon: 'shop' },
  { id: 'menu', label: 'メニュー', icon: 'more' },
];
const GROUPS = {
  deck: [['カード', ['catalog'], 'list']],
  battle: [['オンライン対戦', ['rank', 'friend'], 'pair']], gacha: [], shop: [],
  menu: [['自分の王国', ['skin', 'profile', 'account'], 'list'],
         ['戦績と報酬', ['ranking', 'mission'], 'grid'],
         ['遊び方と環境', ['settings', 'help'], 'list']],
};
const PAGES = new Set([...Object.keys(GROUPS), 'skin', 'profile', 'settings']);
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
  skin: 'スキン装備',
  account: 'アカウント管理',
  mission: 'ミッション',
  ranking: 'ランキング',
  help: '遊び方',
  settings: '設定',
};
// タブの中だけで使う名前（アカウントのタブでは、何ができるかを名前にする）
const MENU_IN_PAGE = {};
// 行の説明（短く。何ができるかだけ）
const MENU_NOTE = {
  friend: 'フレンドを招待して対戦',
  profile: '公開名・アイコン・公開設定・戦績・レベル報酬',
  account: 'ログイン・データ引き継ぎ・書き出し・削除',
  deck: 'カードを選んで自分のデッキを作る',
  catalog: 'すべてのカードと魔物を見る',
  skin: '持っている見た目を装備する',
  gacha: 'コインで見た目のアイテムを引く',
  shop: 'コインで見た目のアイテムを買う',
  settings: '音・演出の速さ・文字の大きさ',
  help: 'ルールと操作をおさらい',
};
const SORTS = {
  rarity: null, // currentDeck の並び（レアリティの高い順・枚数の多い順）
  count: (a, b) => b[1] - a[1],
  kind: (a, b, cards) => String(cards[a[0]].kind).localeCompare(String(cards[b[0]].kind)) || b[1] - a[1],
};
const PREVIEW_CARDS = 5; // デッキの代表カードの枚数

export class Home {
  /**
   * @param {object} o
   * @param {(mode: string) => void} o.onPlay ホームで選んだ設定を使い直接開始する
   * @param {(slot?: number) => void} o.onDeck  @param {() => void} o.onCatalog
   * @param {(type: string) => void} [o.onZoomCard] カードを大きく見せる（CardZoom）
   * @param {object} [o.cards] @param {object} [o.rarities] @param {object} [o.rules] @param {object} [o.decks] デッキの中身を見せるのに使う（data/ の中身）
   */
  constructor({ onPlay, onDeck, onCatalog, onHelp = () => {}, getRecord = () => '', onRanked = () => {}, onRanking = () => {}, onFriends = () => {}, onMission = () => {}, onAccount, onZoomCard = () => {}, toast = () => {}, cards = null, rarities = null, rules = null, decks = null, ruleset = 'kingdom', factions = null, onRuleset = () => {}, onPage = () => {}, onSkills = () => {}, onMode = () => {}, skyMode = 'auto' }) {
    Object.assign(this, { onPlay, onDeck, onCatalog, onHelp, getRecord, onRanked, onRanking, onFriends, onMission, onAccount, onZoomCard, toast, cards, rarities, rules, decks, ruleset, factions, onRuleset, onPage, onSkills, onMode, skyMode });
    this.deckSort = 'rarity';
    this.data = null;
    this.mode = 'solo';
    this.faction = 'kingdom';
    this.costPreset=null;try{const id=localStorage.getItem('cf-home-cost-preset');if(ruleset==='kingdom'&&decks?.[id]?.costDeck)this.costPreset=id;}catch{}
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
          <span class="home-wallet-pill"><span class="home-coins" title="ゲーム内通貨（無料）" data-part="coins"><img src="assets/ui/icon-coin.png" alt="コイン" width="22" height="22"><b>0</b></span><button type="button" class="home-coin-add raw-btn" data-act="shop" data-part="coinAdd" aria-label="ショップを開く">${homeIcon('shop',20)}</button></span>
          <button type="button" class="home-icon-btn raw-btn" data-act="notice" aria-label="お知らせ"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M12 3.2c-3.3 0-5.6 2.5-5.6 5.8v3.6L4.6 15.4c-.4.6 0 1.4.8 1.4h13.2c.8 0 1.2-.8.8-1.4l-1.8-2.8V9c0-3.3-2.3-5.8-5.6-5.8Z" fill="#ffd36b" stroke="#4d3426" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.6 18.6a2.5 2.5 0 0 0 4.8 0" fill="#ffd36b" stroke="#4d3426" stroke-width="1.8" stroke-linecap="round"/><path d="M8.6 7.6c.5-1 1.3-1.6 2.3-1.9" fill="none" stroke="#fff6cf" stroke-width="1.6" stroke-linecap="round"/></svg><i class="home-dot" data-part="dot" hidden></i></button>
        </div>
      </header>

      <div class="home-page" data-page="menu" role="tabpanel" aria-label="メニュー" hidden>
        <h1 class="home-pagehead">王国メニュー</h1>
        <nav class="home-menu" aria-label="王国メニュー" data-menu="menu"></nav>
      </div>
      ${[['skin','スキン装備'],['profile','プロフィール'],['settings','設定']].map(([id,label])=>`<section class="home-page home-secondary" data-page="${id}" aria-label="${label}" hidden><header class="home-section-head"><button type="button" class="small-btn" data-act="backMenu">‹ メニュー</button><h1>${label}</h1></header><div class="home-view-host" data-host="${id}"></div></section>`).join('')}
      <div class="home-page" data-page="deck" role="tabpanel" aria-label="デッキ" hidden>
        <h1 class="home-pagehead home-pagehead-cards"><span>デッキ編成</span></h1>
        <div class="home-deck-tabsrow">
          <div class="home-deck-slots" role="radiogroup" aria-label="デッキを切りかえる" data-part="deckSlots"></div>

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
        ${ruleset==='classic'?'<p class="home-page-intro">クラシックでは全員が共通の山札を使います。スキルツリーはバトルのホームからいつでも編集できます。</p>':''}
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

      <section class="home-page" data-page="gacha" role="tabpanel" aria-label="ガチャ" hidden>
        <h1 class="home-pagehead">王国の宝箱</h1><p class="home-page-intro">コインで見た目のアイテムを引く。確率と履歴もここで確認できます。</p><div class="home-view-host" data-host="gacha"></div>
      </section>
      <section class="home-page" data-page="shop" role="tabpanel" aria-label="ショップ" hidden>
        <h1 class="home-pagehead">王国ショップ</h1><p class="home-page-intro">欲しいアイテムを選んで購入・ポイント交換。装備はメニューの「スキン装備」へ。</p><div class="home-view-host" data-host="shop"></div>
      </section>
      <div class="home-page" data-page="battle" role="tabpanel" aria-label="バトル">
        <div class="home-worlds" role="group" aria-label="ルールセット" data-part="worlds"></div>
        <div class="home-battle-heading"><p>CASTLE FIELD</p><h1 data-part="worldName">城を落とせ。</h1><span>カードで戦う、城攻めバトル</span></div>
        <figure class="home-hero" aria-label="選択中の戦場"><img class="home-arena" src="assets/bg/home-arena-${ruleset === 'factions' ? 'factions' : 'duel'}.png" alt="${ruleset === 'factions' ? '四つの陣営の城と、中央に集まる道' : '道で結ばれた青とオレンジの二つの城'}" width="960" height="570"><div class="home-faction-bar" role="group" aria-label="陣営の城を切りかえる" data-part="factionBar"${ruleset === 'factions' ? '' : ' hidden'}></div></figure>
        <div class="home-progress-line"${ruleset==='kingdom'?'':' hidden'}><span class="home-season" data-part="season"></span><button class="home-rank-chip raw-btn" data-part="rank" data-act="rank"><span data-part="rankEmblem"></span><span><small>ランク</small><span data-part="rankText">未参加</span></span>${homeIcon('arrow',16)}</button></div>
        <section class="home-battle-console" aria-label="対戦の準備">
          <div class="home-deckpanel" aria-label="使うデッキ">
            <div class="home-deck-fan home-deck-fan-mini" data-part="deckFan2" aria-label="使用デッキの代表カード"></div>
            <div class="home-deckpanel-text"><span class="home-eyebrow">使用デッキ</span><strong class="home-deckpanel-name" data-part="deck">—</strong><span class="home-deck-meta" data-part="deckMeta2"></span></div>
            <button class="home-deck-change raw-btn" data-act="chooseDeck" aria-label="使用デッキを選ぶ">${homeIcon('arrow',22)}</button>
          </div>
          <button class="home-mode-picker raw-btn" data-act="chooseMode" aria-haspopup="dialog"><span class="home-selected-mode-icon" data-part="modeIcon"></span><span><small>対戦形式</small><strong data-part="modeName">ひとりで遊ぶ</strong></span><span class="home-mode-change">変更${homeIcon('down',16)}</span></button>
        <nav class="home-menu home-battle-links" aria-label="オンライン対戦" data-menu="battle"${ruleset==='kingdom'?'':' hidden'}></nav>
          <div data-part="matchSetup"></div>
          <div data-part="onlineSetup" hidden></div>
          <div class="home-skills"${ruleset==='classic'?'':' hidden'}><p>スキル <b data-part="skillCount">0</b>個・保存したビルドで対戦</p><button type="button" class="cf-btn raw-btn" data-act="skills">スキルツリーを編集</button></div>
          <button type="button" class="home-start raw-btn" data-act="start"><span data-part="startLabel">対戦開始</span>${homeIcon('arrow',22)}</button>
          <p class="home-note" data-part="note" role="status"></p>
          <button type="button" class="home-retry cf-btn raw-btn" data-act="retry" hidden>再読み込み</button>
          <dl class="home-facts" hidden><div><dt>戦績</dt><dd data-part="stats">—</dd></div></dl>
        </section>
        <div class="home-shortcuts"><button class="raw-btn" data-act="catalog">${homeIcon('catalog',20)}カード図鑑</button><button class="raw-btn" data-act="skin">${homeIcon('skin',20)}スキン装備</button></div>
      </div>
      <nav class="home-tabbar" role="tablist" aria-label="メニュー" data-part="tabbar"></nav>
    </div>
    <div class="home-action-dock"></div>
    <dialog class="home-sheet" id="home-mode-sheet" aria-labelledby="home-mode-title"><div class="home-sheet-heading"><h2 id="home-mode-title">対戦形式</h2><button class="raw-btn home-sheet-close" data-close-sheet aria-label="閉じる">${homeIcon('close')}</button></div><div class="home-modes" role="group" aria-label="対戦形式" data-part="modes"></div></dialog>
    <dialog class="home-sheet" id="home-deck-sheet" aria-labelledby="home-deck-title"><div class="home-sheet-heading"><h2 id="home-deck-title">使うデッキ</h2><button class="raw-btn home-sheet-close" data-close-sheet aria-label="閉じる">${homeIcon('close')}</button></div><div data-part="deckChoices"></div></dialog>
`;
    document.getElementById('app').append(box);
    this.part = (n) => box.querySelector(`[data-part="${n}"]`);
    this.tab = 'battle';
    this.renderMenu();
    this.renderTabs();
    this.navLayout = matchMedia('(min-width: 1000px) and (min-height: 650px)');
    const orient = () => {
      this.part('tabbar').setAttribute('aria-orientation', this.navLayout.matches ? 'vertical' : 'horizontal');
      const inline=this.navLayout.matches||innerHeight<500;
      (box.querySelector(inline?'.home-battle-console':'.home-action-dock')).append(box.querySelector('.home-start'));
    };
    this.navLayout.addEventListener('change', orient);window.addEventListener('resize',orient); orient();
    for (const dialog of box.querySelectorAll('.home-sheet')) dialog.addEventListener('click', e => { if (e.target === dialog) { const r=dialog.getBoundingClientRect(); if(e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom) dialog.close(); } });
    this.renderModes();
    this.renderFactionBar();
    this.diorama = new HomeDioramaGL({
      skyEl: box.querySelector('.home-sky'),
      heroEl: box.querySelector('.home-hero'),
      homeEl: box,
      viewMode: ruleset === 'factions' ? 'factions' : 'overview',
      faction: this.faction,
      skyMode,
    });
    box.addEventListener('click', (e) => this.onClick(e));
    box.addEventListener('keydown', (e) => this.onKey(e));
    this.part('deckSort').addEventListener('change', (e) => { this.deckSort = e.target.value; this.renderDeck(this.data?.deck?.name); });
    account.onChange(() => { if (!box.hidden) this.refresh(); });
    // Full-screen editors/dialogs cover the home scene. Keep the last frame instead
    // of spending rendering time behind the skill tree, catalog or loading panel.
    const app=document.getElementById('app');
    this.sceneObserver=new MutationObserver(records=>{
      if(records.some(r=>r.type==='childList'?r.target===app:r.target.parentElement===app))this.syncSceneVisibility();
    });
    this.sceneObserver.observe(app,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','open']});
  }

  syncSceneVisibility(){
    if(!this.diorama)return;
    if(this.box.hidden||this.tab!=='battle'){if(this.diorama.visible)this.diorama.setVisible(false);return;}
    const covered=[...document.querySelectorAll('#app > .screen:not([hidden]),#app > dialog[open]')].some(el=>el!==this.box&&el.getClientRects().length);
    const visible=!covered;
    if(this.diorama.visible!==visible)this.diorama.setVisible(visible);
  }

  /** ホーム背景の時間帯モードを更新（auto / dawn / day / dusk / night） */
  setSkyMode(mode) {
    this.skyMode = mode;
    this.diorama?.setSkyMode(mode);
  }

  /** 4陣営モード時、3Dジオラマ下部からワンタップで4城を旋回切替できるバー */
  renderFactionBar() {
    const bar = this.part('factionBar');
    if (!bar) return;
    bar.replaceChildren();
    if (this.ruleset !== 'factions') { bar.hidden = true; return; }
    bar.hidden = false;
    const order = [
      ['kingdom', '王国'],
      ['forest', '森'],
      ['demon', '魔族'],
      ['dragon', '竜族'],
    ];
    for (const [id, shortName] of order) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'home-faction-chip raw-btn';
      b.dataset.factionQuick = id;
      b.setAttribute('aria-pressed', String(this.faction === id));
      b.setAttribute('aria-label', `${this.factions?.[id]?.name ?? shortName}の城を見る`);
      b.textContent = shortName;
      bar.append(b);
    }
  }

  selectFaction(id) {
    if (!id || (this.factions && !this.factions[id])) return;
    this.faction = id;
    try { localStorage.setItem('cf-home-faction', this.faction); } catch { /* optional */ }
    this.diorama?.setFaction(this.faction);
    this.renderFactionBar();
    this.renderDeck();
  }

  /** ホームを入口にするか（いつも。アカウント機能がなければ、端末だけで使えるメニューにする） */
  available() { return true; }

  /** サーバーのアカウント機能につながっているか */
  online() { return account.enabled && !!account.user; }

  open() {
    const wasHidden = this.box.hidden;
    this.box.hidden = false;
    if (wasHidden) { this.box.classList.remove('home-enter'); void this.box.offsetWidth; this.box.classList.add('home-enter'); }
    this.syncSceneVisibility();
    this.refresh();
    const focusEl = this.tab === 'battle' ? this.box.querySelector('.home-start') : this.part('tabbar').querySelector('[aria-selected=true]');
    focusEl?.focus({ preventScroll: true });
  }

  close() { this.closeSheets(); this.diorama?.setVisible(false); this.box.hidden = true; }

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
    const text = this.ruleset === 'factions' ? '' : this.season ? `シーズン ${this.season.id}` : '';
    this.part('season').textContent = text;
  }

  renderBadges() {
    for (const [id, count, label] of [
      ['profile', this.data?.rewardsAvailable, 'レベル報酬'],
      ['mission', this.data?.claimable, '受け取れるミッション報酬'],
      ['friend', this.socialCount, 'フレンドの通知'],
    ]) {
      const tile = this.box.querySelector(`.home-tile[data-id="${id}"]`);
      if (!tile) continue;
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
    const tabHas = { menu: this.data?.rewardsAvailable > 0 || this.data?.claimable > 0, battle: this.socialCount > 0 };
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
      if (note) note.textContent = off ? 'オンライン接続で利用できます' : MENU_NOTE[tile.dataset.id] ?? '';
    }
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
    const iconSrc = profileArt(d?.icon, d?.iconImage ?? d?.icons?.find((i) => i.id === d.icon)?.image);
    const av = this.part('avatar');
    av.replaceChildren();
    if (d?.iconFrame) av.dataset.frame = d.iconFrame; else delete av.dataset.frame;
    if (iconSrc) { const img = new Image(); img.src = iconSrc; img.alt = ''; av.append(img); } else av.textContent = [...(u?.displayName ?? '?')][0];
    this.part('coinAdd').hidden = false;
    const coins = String(d?.coins ?? 0);
    this.part('coins').querySelector('b').textContent = coins;
    this.renderBadges();
    this.renderSeason();
    this.renderWorlds();
    const sum = d?.rank;
    const member = u?.kind === 'member';
    this.part('rankEmblem').innerHTML = member ? rankEmblem(sum?.rank ?? null, 26) : '';
    const rankFull = !member ? 'アカウントを作ると参加できます'
      : sum?.rank ? `${sum.rank.divisionLabel}（${sum.rank.rp} RP）` : sum ? `認定戦 ${sum.placementTotal - sum.placementLeft}/${sum.placementTotal}` : '—';
    this.setRank(member ? rankFull : '未参加', rankFull);
    this.renderDeck(d?.deck?.name);
    const s = d?.stats;
    this.part('stats').textContent = s?.matches ? `${s.matches}戦 ${s.wins}勝 ${s.losses}敗（勝率 ${s.winRate}%）` : 'まだ対戦がありません';
    this.renderFacts();
  }

  /** サーバーのアカウント機能がないとき：端末の情報だけで描く */
  renderLocal() {
    let name='プレイヤー';try{name=localStorage.getItem('cf-name')||name}catch{}
    this.part('name').textContent=name;
    this.part('title').textContent = 'この端末で遊ぶ';
    this.part('lvWrap').hidden = true;
    this.part('coins').hidden = true;
    const av = this.part('avatar');
    av.replaceChildren();
    delete av.dataset.frame;
    const img = new Image(); img.src = 'assets/profiles/knight.png'; img.alt = ''; av.append(img);
    this.part('coinAdd').hidden = true;
    this.part('season').textContent = '';
    this.renderWorlds();
    this.part('rankEmblem').innerHTML = '';
    this.setRank('未参加', 'サーバーで遊ぶと参加できます');
    this.renderDeck(null);
    this.part('stats').textContent = this.getRecord() || 'まだ対戦がありません';
    for (const tile of this.box.querySelectorAll('.home-tile')) tile.querySelector('.home-badge')?.remove();
    this.part('dot').hidden = true;
    this.renderFacts();
  }

  /**
   * 使うデッキ（この端末に保存したデッキ。サーバーにつながっていれば同じ内容が届いている）。
   * 決まりに合うデッキがなければ、対戦で実際に使われる見本のデッキを見せる。
   */
  useSavedDeck(){this.costPreset=null;try{localStorage.removeItem('cf-home-cost-preset')}catch{}}

  currentDeck(serverName) {
    if(this.ruleset==='classic'){const d=this.decks?.[this.rules.defaultDeck];return {name:d?.name??'共通の山札',list:d?.cards??{},kind:'shared',check:null,state:null};}
    if (this.ruleset === 'factions') {
      const d = this.decks?.[this.faction];
      return { name:d?.name ?? '陣営を選択', list:d?.cards ?? {}, kind:'faction', check:{ok:true,total:Object.values(d?.cards ?? {}).reduce((a,b)=>a+b,0)}, state:null };
    }
    let state = null;
    try { state = loadDecks(); } catch { /* 読めなくても動く */ }
    if(this.costPreset&&this.decks?.[this.costPreset]){const d=this.decks[this.costPreset];return{name:d.name,list:d.cards,kind:'sample',presetId:this.costPreset,state,check:checkCostDeck(d.cards,this.cards,this.rarities,this.rules)};}
    const slot = state?.active ?? 0;
    const mine = state?.slots?.[slot] ?? null;
    const canCheck = this.cards && this.rarities;
    const check = mine && canCheck ? checkCostDeck(mine.list, this.cards, this.rarities, this.rules) : null;
    if (mine && (!canCheck || check?.ok)) return { name: mine.name, list: mine.list, check, kind: 'mine', slot, state };
    const sampleId = this.rules?.defaultCostDeck;
    const sample = sampleId && this.decks?.[sampleId];
    const sampleCheck = sample && canCheck ? checkCostDeck(sample.cards, this.cards, this.rarities, this.rules) : null;
    if (mine) return { name: sample?.name ?? serverName ?? '見本のデッキ', list: sample?.cards ?? {}, check:sampleCheck, kind:'fallback', slot,state,repairReason:check?.reason,invalidName:mine.name,savedList:mine.list };
    if (sample) return { name: sample.name, list: sample.cards, check: sampleCheck, kind: 'sample', presetId:sampleId, slot, state };
    return { name: serverName ?? '未設定', list: null, check: null, kind: 'none', slot, state };
  }

  renderDeck(serverName) {
    const deck = this.currentDeck(serverName);
    this.part('deck').textContent = deck.name;
    this.box.querySelector('.home-deckpanel .home-eyebrow').textContent=this.ruleset==='factions'?'使用する陣営':'使用デッキ';
    this.part('deck2').textContent = deck.name;
    const state = this.part('deckState');
    state.className = `home-deck-state is-${deck.kind}`;
    state.textContent = { mine: '使えます', sample: '見本', none: '', shared:'共通の山札', fallback:'見本を使用中', faction: '固定デッキ' }[deck.kind];
    state.title = deck.kind === 'sample' ? 'この見本のデッキで対戦します。自分で編成した枠にも切り替えられます' : '';
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
    warn.hidden = deck.kind !== 'fallback';
    warn.textContent = deck.kind === 'fallback' ? `保存した「${deck.invalidName}」は要調整（${deck.repairReason ?? '構成を確認してください'}）。対戦では見本のデッキを使います。` : '';
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
    this.box.querySelector('.home-deck-editbtn').textContent=deck.kind==='sample'?'この見本から編成':'デッキを編集';
    this.box.querySelector('.home-deck-actions').hidden=this.ruleset!=='kingdom';
    this.part('deckSlots').hidden=this.ruleset!=='kingdom';
    for(const act of ['deckCopy','deckDelete']) { const b=this.box.querySelector(`[data-act=${act}]`);b.disabled=deck.kind==='faction';b.title=deck.kind==='faction'?'4陣営は陣営ごとの固定デッキです':''; }
    this.renderSlots(deck);
    this.part('deckSlots').hidden=this.ruleset!=='kingdom';
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
      const on = deck.kind!=='sample' && !!s && deck.state.active === i;
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

  setRank(short, full) {
    this.part('rankText').textContent = this.ruleset === 'factions' ? '対象外' : short;
    this.part('rank').title = full;
    this.rankFull = full;
  }

  /** フレンドの申請・招待の数（フレンドのタイルとお知らせに印を出す） */
  setSocialBadge(n) {
    this.socialCount = n;
    this.renderBadges();
  }

  renderFacts() {
    this.part('startLabel').textContent = this.mode==='online'?'合言葉の部屋に入る':'対戦開始';
    this.part('modeName').textContent = MODES[this.mode].label;
    this.part('modeIcon').innerHTML = homeIcon(this.mode);
    this.box.querySelector('.home-start').setAttribute('aria-label', `${MODES[this.mode].label}：${this.mode==='online'?'合言葉の部屋に入る':'対戦開始'}`);
  }

  renderWorlds() {
    const wrap = this.part('worlds'); wrap.replaceChildren();
    for (const [id,label] of [['kingdom','通常モード'],['factions','4陣営モード'],['classic','クラシック']]) {
      const b=document.createElement('button'); b.type='button'; b.className='home-world raw-btn'; b.dataset.ruleset=id;
      b.textContent=label; b.setAttribute('aria-pressed',String(id===this.ruleset)); wrap.append(b);
    }
    this.part('worldName').textContent = this.ruleset === 'factions' ? '四つの陣営、激突。' : this.ruleset === 'classic' ? 'スキルを選んで、城を落とせ。' : '城を落とせ。';
  }

  renderModes() {
    const wrap=this.part('modes'); wrap.replaceChildren();
    for(const [id,m] of Object.entries(MODES)) {
      const b=document.createElement('button'); b.type='button'; b.className='home-mode raw-btn'; b.dataset.mode=id;
      b.setAttribute('aria-pressed',String(id===this.mode));
      b.innerHTML=`${homeIcon(id,28)}<span><strong>${m.label}</strong><small>${m.note}</small></span>${homeIcon('check',20)}`;
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
    if(!factionMode)choices.push(...Object.entries(this.decks??{}).filter(([,d])=>d.costDeck).map(([id,d])=>({id,name:d.name,preset:true,description:'見本のデッキを使う'})));
    for(const c of choices) {
      const b=document.createElement('button'); b.type='button'; b.className='home-deck-choice raw-btn';
      b.dataset[factionMode?'faction':c.preset?'costPreset':'chooseSlot']=c.id;
      const on=factionMode ? this.faction===c.id : c.preset ? this.currentDeckInfo?.presetId===c.id : this.currentDeckInfo?.kind==='mine' && this.currentDeckInfo.slot===Number(c.id);
      b.setAttribute('aria-pressed',String(on));
      if(factionMode) { const im=new Image(); im.src=`assets/ui/factions/crest-${c.id}.png`; im.alt=''; im.width=48; im.height=48; b.append(im); }
      const text=document.createElement('span'),name=document.createElement('strong'),note=document.createElement('small');
      name.textContent=c.name; note.textContent=c.description; text.append(name,note); b.append(text); b.insertAdjacentHTML('beforeend', homeIcon(on?'check':'arrow',20));wrap.append(b);
    }
    const note=document.createElement('p');note.className='home-sheet-note';note.textContent=factionMode?'4陣営は陣営ごとの固定デッキです。':'編成はデッキタブの「デッキを編集」から行えます。';wrap.append(note);
  }

  renderMenu() {
    for (const [tab, groups] of Object.entries(GROUPS)) {
      const nav = this.box.querySelector(`[data-menu="${tab}"]`);
      if (!nav) continue;
      for (const [name, ids, style] of groups) {
        const group = document.createElement('section');
        group.className = `home-menu-group is-${style}`;
        const heading = document.createElement('h2');
        heading.textContent = name;
        const grid = document.createElement('div');
        grid.className = 'home-menu-grid';
        for (const id of ids) {
          if(this.ruleset!=='kingdom' && ['rank','ranking','friend','mission'].includes(id))continue;
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
        if (!grid.childElementCount) continue;
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
      b.querySelector('.home-tab-label').textContent = t.id==='deck'&&this.ruleset!=='kingdom'?(this.ruleset==='classic'?'山札':'陣営'):t.label;
      bar.append(b);
    }
    this.showTab(this.tab, { focus: false });
  }

  /** タブを切りかえる（id はタブか、タイルの id。タイルなら、そのタイルのあるタブ） */
  showTab(id, { focus = false } = {}) {
    const tab = PAGES.has(id) ? id : TAB_OF[id] ?? 'battle';
    const secondary=['skin','profile','settings'].includes(tab);
    if(secondary&&!['skin','profile','settings'].includes(this.tab)){this.returnPage=this.tab;this.returnFocus=document.activeElement;}
    const primary = secondary?'menu':tab;
    if(secondary)this.box.querySelector(`[data-page="${tab}"] [data-act=backMenu]`).textContent=`‹ ${TABS.find(t=>t.id===this.returnPage)?.label??'メニュー'}`;
    const order = TABS.map((t) => t.id);
    const dir = Math.sign(order.indexOf(tab) - order.indexOf(this.tab));
    this.tab = tab;
    if (this.box.dataset.tab !== tab) {
      this.box.dataset.tab = tab;
      const sky = this.box.querySelector('.home-sky');
      sky.classList.remove('home-sky-in'); void sky.offsetWidth; sky.classList.add('home-sky-in');
    }
    for (const page of this.box.querySelectorAll('.home-page')) {
      page.id = `home-page-${page.dataset.page}`;
      if(TABS.some(t=>t.id===page.dataset.page))page.setAttribute('aria-labelledby', `home-tab-${page.dataset.page}`);else page.removeAttribute('aria-labelledby');
      const show = page.dataset.page === tab;
      const changed = page.hidden === show;
      page.hidden = !show;
      if (show && changed) {
        page.style.setProperty('--enter-dir', String(dir || 0));
        page.classList.remove('home-page-in'); void page.offsetWidth; page.classList.add('home-page-in');
      }
    }
    for (const b of this.part('tabbar').children) {
      const on = b.dataset.tab === primary;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus({ preventScroll: true });
    }
    this.diorama?.setTab(tab);
    this.syncSceneVisibility();
    this.onPage(tab, this.box.querySelector(`[data-host="${tab}"]`));
    if(['skin','profile','settings'].includes(tab)){const h=this.box.querySelector(`[data-page="${tab}"] h1`);h.tabIndex=-1;h.focus({preventScroll:true});}
    this.box.scrollTop = 0;
  }

  /** 使うデッキを、空いている枠にコピーする（見本のデッキもコピーできる）。
   * 決まりに合わない保存デッキ（見本を使用中）は、見本ではなく保存したデッキの中身を写す（直してから使えるように） */
  copyDeck() {
    const deck = this.currentDeckInfo;
    const list = deck?.kind === 'fallback' ? deck.savedList : deck?.list;
    if (!list) return this.toast('コピーできるデッキがありません', 'info');
    const slot = loadDecks().slots.findIndex((d) => !d);
    if (slot < 0) return this.toast(`空いているデッキ枠がありません（${DECK_SLOTS}つまで）。いらないデッキを削除してください`, 'info');
    const name = `${deck.kind === 'fallback' ? deck.invalidName : deck.name}のコピー`.slice(0, 24);
    if (!saveMyDeck(slot, name, list)) return this.toast('この端末に保存できませんでした', 'info');
    this.useSavedDeck();this.renderDeck(this.data?.deck?.name);
    this.toast(`デッキ${slot + 1}にコピーしました`, 'info');
  }

  /** 使うデッキを削除する（自分で作ったデッキだけ。決まりに合わない保存デッキ（見本を使用中）も消せる。見本は消せない） */
  deleteDeck() {
    const deck = this.currentDeckInfo;
    if (!deck || !['mine', 'fallback'].includes(deck.kind)) return this.toast('見本のデッキは削除できません', 'info');
    const name = deck.kind === 'fallback' ? deck.invalidName : deck.name;
    if (!window.confirm(`「${name}」を削除しますか？`)) return;
    if (!deleteMyDeck(deck.slot)) return this.toast('この端末に保存できませんでした', 'info');
    this.renderDeck(this.data?.deck?.name);
    this.toast(`「${name}」を削除しました`, 'info');
  }

  backPage(){this.showTab(this.returnPage??'menu',{focus:true});if(this.returnFocus?.getClientRects().length)this.returnFocus.focus({preventScroll:true});}

  onKey(e) {
    if(e.key==='Escape'&&['skin','profile','settings'].includes(this.tab)){this.backPage();return;}
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
    if(e.target.closest('.embedded-view,[data-part="matchSetup"],[data-part="onlineSetup"]'))return;
    if(e.target.closest('[data-close-sheet]')) { this.closeSheets(); return; }
    const world=e.target.closest('[data-ruleset]');
    if(world?.tagName==='BUTTON') { if(world.dataset.ruleset!==this.ruleset) this.onRuleset(world.dataset.ruleset); return; }
    const factionQuick = e.target.closest('.home-faction-chip[data-faction-quick]');
    if (factionQuick) { sound.play('tap'); this.selectFaction(factionQuick.dataset.factionQuick); return; }
    const faction=e.target.closest('.home-deck-choice[data-faction]'); // 陣営のカード（mountMiniCard）も data-faction を持つので、陣営を選ぶボタンだけに絞る
    if(faction) { this.closeSheets(); this.selectFaction(faction.dataset.faction); return; }
    const preset=e.target.closest('[data-cost-preset]');
    if(preset&&this.decks?.[preset.dataset.costPreset]?.costDeck){this.costPreset=preset.dataset.costPreset;try{localStorage.setItem('cf-home-cost-preset',this.costPreset)}catch{}this.closeSheets();this.renderDeck();return;}
    const choose=e.target.closest('[data-choose-slot]');
    if(choose) { const slot=Number(choose.dataset.chooseSlot),deck=loadDecks().slots[slot];this.closeSheets(); if(!deck || !checkCostDeck(deck.list,this.cards,this.rarities,this.rules).ok) return this.onDeck(slot);this.useSavedDeck();selectMyDeck(slot);this.renderDeck();return; }

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
      this.onMode(this.mode);
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
      this.useSavedDeck();selectMyDeck(i);
      this.renderDeck(this.data?.deck?.name);
      this.toast(`「${saved.name}」を使います`, 'info');
      return;
    }
    const tile = e.target.closest('.home-tile');
    const act = tile ? tile.dataset.id : e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if(act==='chooseMode') return this.openSheet('mode');
    if(act==='chooseDeck' && this.ruleset==='classic') return;
    if(act==='chooseDeck') { this.renderDeckChoices(); return this.openSheet('deck'); }
    if(act==='backMenu') return this.backPage();
    if(['gacha','shop','skin','profile','settings'].includes(act))return this.showTab(act);
    if(act==='skills')return this.onSkills();
    this.closeSheets();
    if(this.ruleset==='factions' && ['rank','ranking','friend','mission'].includes(act)) return this.toast('この機能は通常モードで利用できます。4陣営は、ひとりで遊ぶ・カジュアル対戦（合言葉）・同じ端末で遊べます。','info');
    if(this.ruleset==='factions' && act==='deck') { this.renderDeckChoices();return this.openSheet('deck'); }
    // クラシック：対戦前にスキルツリーを選ぶ（共通の山札）。ランク・ミッションなどは通常モードだけ
    if(this.ruleset==='classic' && ['rank','ranking','friend','mission'].includes(act)) return this.toast('この機能は通常モードで利用できます。クラシックは、ひとりで遊ぶ・カジュアル対戦（合言葉）・同じ端末で遊べます。','info');
    if(this.ruleset==='classic' && act==='deck') return this.toast('クラシックは共通の山札です。ホームでスキルツリーを編集できます。','info');
    sound.play('tap');
    if (act === 'account') return this.onAccount();
    if (act === 'retry') return this.refresh();
    if (!this.online() && (NEEDS_SERVER.has(act) || act === 'notice')) return this.toast(act === 'notice' ? '新しいお知らせはありません' : SERVER_REASON, 'info');
    if (act === 'start') return this.onPlay(this.mode);
    if (act === 'deckCopy') return this.copyDeck();
    if (act === 'deckDelete') return this.deleteDeck();
    if (act === 'casual') {this.mode='online';this.showTab('battle');this.renderModes();return this.onMode('online');}
    if (act === 'deck') {
      if(this.currentDeckInfo?.kind==='sample'){
        const slot=loadDecks().slots.findIndex(d=>!d);
        if(slot<0)return this.toast('空き枠がありません。保存枠を選んで編集するか、使わない枠を削除してください','info');
        return this.onDeck(slot,this.currentDeckInfo.presetId);
      }
      return this.onDeck();
    }
    if (act === 'catalog') return this.onCatalog();
    if (act === 'help') return this.onHelp();
    if (act === 'rank') return this.onRanked();
    if (act === 'friend') return this.onFriends();
    if (act === 'mission') return this.onMission();
    if (act === 'ranking') return this.onRanking();
    if (act === 'notice') {
      const n = this.data?.rewardsAvailable ?? 0;
      if (this.socialCount > 0) return this.onFriends();
      if (n > 0) return this.showTab('profile');
      if (this.data?.claimable > 0) return this.onMission();
      this.toast('新しいお知らせはありません', 'info');
    }
  }
}
