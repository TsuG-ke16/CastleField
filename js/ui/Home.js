import { profileArt } from './profileArt.js';
// ホーム画面：プレイヤー情報・選んだモード・デッキ・大きな対戦開始ボタン・メニュー。
// いつも入口になる。サーバーのアカウント機能がないとき（python の簡易サーバー・オフライン）は、
// ひとりで遊ぶ・同じ端末・デッキ編成・図鑑・設定だけを使え、サーバーが要るメニューは押すと理由を出す。表示名などは textContent で入れる。
import { account } from './Account.js';
import { loadDecks } from './DeckStore.js';
import { sound } from './Sound.js';
import { rankEmblem } from './RankEmblem.js';

const MODE_KEY = 'cf-home-mode';
const MODES = {
  solo: { label: 'ひとりで遊ぶ', chip: 'ひとりで', note: 'CPUと対戦' },
  online: { label: 'カジュアル対戦', chip: 'カジュアル', note: '合言葉で友だちと' },
  local: { label: '同じ端末で遊ぶ', chip: '同じ端末', note: '2〜8人で交代' },
};
// サーバーのアカウント機能がないと使えないメニュー
const NEEDS_SERVER = new Set(['rank', 'ranking', 'friend', 'profile', 'shop', 'gacha', 'skin', 'mission']);
const SERVER_REASON = 'この機能は、オンライン対戦のサーバー（node server/server.js）で開くと使えます';
const menuIcon = (id) => `<img src="assets/ui/home/${id}.png" alt="" width="36" height="36">`;
const GROUPS = [
  ['対戦', ['rank', 'casual', 'ranking']],
  ['コレクション', ['deck', 'catalog', 'skin']],
  ['ソーシャル', ['friend', 'profile']],
  ['その他', ['mission', 'shop', 'gacha', 'help', 'settings']],
];
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

export class Home {
  /**
   * @param {object} o
   * @param {(mode: string) => void} o.onPlay 選んだモードの設定画面（CPUの強さ・同じ端末・合言葉）へ進む
   * @param {() => void} o.onDeck  @param {() => void} o.onCatalog  @param {() => void} o.onSettings
   * @param {() => void} o.onProfile
   */
  constructor({ onPlay, onDeck, onCatalog, onSettings, onHelp = () => {}, getRecord = () => '', onProfile, onRanked = () => {}, onRanking = () => {}, onFriends = () => {}, onShop = () => {}, onGacha = () => {}, onSkin = () => {}, onMission = () => {}, onAccount, toast = () => {} }) {
    Object.assign(this, { onPlay, onDeck, onCatalog, onSettings, onHelp, getRecord, onProfile, onRanked, onRanking, onFriends, onShop, onGacha, onSkin, onMission, onAccount, toast });
    this.data = null;
    this.mode = 'solo';
    try { const m = localStorage.getItem(MODE_KEY); if (m in MODES) this.mode = m; } catch { /* 保存できなくても動く */ }
    const box = this.box = document.createElement('div');
    box.id = 'home'; box.className = 'screen'; box.hidden = true;
    box.innerHTML = `<div class="home-wrap">
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
          <span class="home-coins" title="ゲーム内通貨（無料）" data-part="coins"><img src="assets/ui/icon-coin.png" alt="" width="22" height="22"><b>0</b></span>
          <button type="button" class="home-icon-btn raw-btn" data-act="notice" aria-label="お知らせ">🔔<i class="home-dot" data-part="dot" hidden></i></button>
          <button type="button" class="home-icon-btn raw-btn" data-act="settings" aria-label="設定">${menuIcon("settings")}</button>
        </div>
      </header>
      <section class="home-hero" aria-label="対戦">
        <div class="home-worlds" role="tablist" aria-label="世界" data-part="worlds"></div>
        <div class="home-landscape"><span data-part="season" class="home-season"></span></div>
        <div class="home-controls"><div class="home-modes" role="tablist" aria-label="ゲームモード" data-part="modes"></div>
        <dl class="home-facts">
          <div><dt>デッキ</dt><dd><span data-part="deck">—</span><button type="button" class="small-btn" data-act="deck">変更</button></dd></div>
          <div><dt>ランク</dt><dd data-part="rank"><span class="home-rank-emblem" data-part="rankEmblem"></span><span data-part="rankText">—</span></dd></div>
          <div><dt>戦績</dt><dd data-part="stats">—</dd></div>
        </dl>
        <button type="button" class="home-start raw-btn" data-act="start"><span data-part="startLabel">対戦開始</span></button>
        <p class="home-note" data-part="note" role="status"></p>
        <button type="button" class="home-retry raw-btn" data-act="retry" hidden>再読み込み</button></div>
      </section>
      <aside class="home-link" data-part="guest" hidden><span>アカウントを作成すると、別の端末でもデータを引き継げます。</span><button type="button" class="home-retry raw-btn" data-act="account">作成する</button></aside>
      <nav class="home-menu" aria-label="メニュー" data-part="menu"></nav>
    </div>`;
    document.getElementById('app').append(box);
    this.part = (n) => box.querySelector(`[data-part="${n}"]`);
    this.renderMenu();
    this.renderModes();
    box.addEventListener('click', (e) => this.onClick(e));
    account.onChange(() => { if (!box.hidden) this.refresh(); });
  }

  /** ホームを入口にするか（いつも。アカウント機能がなければ、端末だけで使えるメニューにする） */
  available() { return true; }

  /** サーバーのアカウント機能につながっているか */
  online() { return account.enabled && !!account.user; }

  open() {
    this.box.hidden = false;
    this.refresh();
    this.box.querySelector('.home-start').focus({ preventScroll: true });
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
    this.part('season').textContent = this.season ? `シーズン ${this.season.id}` : '';
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
  }

  render() {
    const local = !this.online();
    this.box.classList.toggle('home-local', local);
    for (const tile of this.box.querySelectorAll('.home-tile')) {
      const off = local && NEEDS_SERVER.has(tile.dataset.id);
      tile.classList.toggle('home-tile-off', off);
      if (off) tile.title = SERVER_REASON; else tile.removeAttribute('title');
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
    const iconSrc = profileArt(d?.icon, d?.iconImage ?? d?.icons?.find((i) => i.id === d.icon)?.image);
    const av = this.part('avatar');
    av.replaceChildren();
    if (iconSrc) { const img = new Image(); img.src = iconSrc; img.alt = ''; av.append(img); } else av.textContent = [...(u?.displayName ?? '?')][0];
    this.part('coins').querySelector('b').textContent = String(d?.coins ?? 0);
    this.part('guest').hidden = u?.kind !== 'guest';
    this.renderBadges();
    this.renderSeason();
    // 世界（モード）：いまは王国だけ。ほかは準備中（アカウント・レベル・通貨・所持品は世界をこえて共通）
    const worlds = this.part('worlds'); worlds.replaceChildren();
    for (const w of d?.modes ?? [{ id: 'kingdom', name: '王国', available: true }]) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'home-world raw-btn'; b.textContent = w.available || w.name.includes('準備中') ? w.name : `${w.name}・準備中`; b.disabled = !w.available;
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(w.id === (d?.defaultMode ?? 'kingdom'))); if (!w.available) b.title = '準備中です'; worlds.append(b);
    }
    const sum = d?.rank;
    const member = u?.kind === 'member';
    this.part('rankEmblem').innerHTML = member ? rankEmblem(sum?.rank ?? null, 26) : '';
    this.part('rankText').textContent = !member ? 'アカウントを作ると参加できます'
      : sum?.rank ? `${sum.rank.divisionLabel}（${sum.rank.rp} RP）` : sum ? `認定戦 ${sum.placementTotal - sum.placementLeft}/${sum.placementTotal}` : '—';
    this.part('deck').textContent = d?.deck?.name ?? '未設定';
    this.part('stats').textContent = d?.stats?.matches ? `${d.stats.matches}戦 ${d.stats.wins}勝 ${d.stats.losses}敗（勝率 ${d.stats.winRate}%）` : 'まだ対戦がありません';
    this.renderFacts();
  }

  /** サーバーのアカウント機能がないとき：端末の情報だけで描く */
  renderLocal() {
    this.part('name').textContent = 'プレイヤー';
    this.part('title').textContent = 'この端末で遊ぶ';
    this.part('lvWrap').hidden = true;
    this.part('coins').hidden = true;
    const av = this.part('avatar');
    av.replaceChildren();
    av.textContent = '🏰';
    this.part('guest').hidden = true;
    this.part('season').textContent = '';
    const worlds = this.part('worlds'); worlds.replaceChildren();
    const w = document.createElement('button'); w.type = 'button'; w.className = 'home-world raw-btn'; w.textContent = '王国'; w.setAttribute('role', 'tab'); w.setAttribute('aria-selected', 'true'); worlds.append(w);
    this.part('rankEmblem').innerHTML = '';
    this.part('rankText').textContent = 'サーバーで遊ぶと参加できます';
    let deck = null;
    try { const state = loadDecks(); deck = state.slots?.[state.active]; } catch { /* 読めなくても動く */ }
    this.part('deck').textContent = deck?.name ?? '見本のデッキ';
    this.part('stats').textContent = this.getRecord() || 'まだ対戦がありません';
    for (const tile of this.box.querySelectorAll('.home-tile')) tile.querySelector('.home-badge')?.remove();
    this.part('dot').hidden = true;
    this.renderFacts();
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
      const s = document.createElement('strong'); s.textContent = m.chip;
      const n = document.createElement('small'); n.textContent = m.note;
      b.append(s, n); wrap.append(b);
    }
  }

  renderMenu() {
    const nav = this.part('menu');
    for (const [name, ids] of GROUPS) {
      const group = document.createElement('section');
      group.className = 'home-menu-group';
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
        button.innerHTML = `<span class="home-tile-icon">${id === 'help' ? '<b class="home-tile-glyph" aria-hidden="true">？</b>' : menuIcon(id)}</span><span class="home-tile-label"></span>`;
        button.querySelector('.home-tile-label').textContent = MENU[id];
        grid.append(button);
      }
      group.append(heading, grid);
      nav.append(group);
    }
  }

  onClick(e) {
    const modeBtn = e.target.closest('.home-mode');
    if (modeBtn) {
      this.mode = modeBtn.dataset.mode;
      try { localStorage.setItem(MODE_KEY, this.mode); } catch { /* ok */ }
      sound.play('tap');
      for (const tab of this.part('modes').children) tab.setAttribute('aria-selected', String(tab === modeBtn));
      this.renderFacts();
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
