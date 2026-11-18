// ホーム画面：プレイヤー情報・選んだモード・デッキ・大きな対戦開始ボタン・メニュー。
// サーバーのアカウント機能があるときだけ出る（なければ今までのタイトルがそのまま入口）。
// まだ作っていない機能（ランクマッチ・フレンド・ショップなど）は「準備中」と表示して押せない。表示名などは textContent で入れる。
import { account } from './Account.js';
import { sound } from './Sound.js';
import { rankEmblem } from './RankEmblem.js';

const MODE_KEY = 'cf-home-mode';
const MODES = {
  solo: { label: 'ひとりで遊ぶ', chip: 'ひとりで', note: 'CPUと対戦', titleButton: 'title-solo' },
  online: { label: 'カジュアル対戦', chip: 'カジュアル', note: '合言葉で友だちと', titleButton: 'title-online' },
  local: { label: '同じ端末で遊ぶ', chip: '同じ端末', note: '2〜8人で交代', titleButton: 'title-local' },
};
const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  rank: svg('<path d="M4 20h16M6 20V9l6-5 6 5v11M10 20v-5h4v5"/>'),
  casual: svg('<path d="M5 4l14 14M19 4L5 18M3 6l3-3M18 21l3-3"/>'),
  friend: svg('<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a5 5 0 0 1 10 0v1M16 5a3 3 0 0 1 0 6M18 20v-1a5 5 0 0 0-3-4.5"/>'),
  deck: svg('<rect x="5" y="3" width="11" height="16" rx="2"/><path d="M8 21h10a2 2 0 0 0 2-2V7"/>'),
  catalog: svg('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M9 7h6"/>'),
  profile: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  shop: svg('<path d="M4 9l1-5h14l1 5M4 9v11h16V9M4 9a3 3 0 0 0 5 0 3 3 0 0 0 6 0 3 3 0 0 0 5 0M10 20v-6h4v6"/>'),
  gacha: svg('<circle cx="12" cy="10" r="7"/><path d="M5 10h14M9 17l-1 4h8l-1-4M12 6v4"/>'),
  skin: svg('<path d="M8 3l-5 4 3 3 2-1v12h8V9l2 1 3-3-5-4a4 4 0 0 1-8 0z"/>'),
  mission: svg('<path d="M6 3h12v18l-6-4-6 4zM9 8h6M9 12h6"/>'),
  ranking: svg('<path d="M8 21V11H4v10zM14 21V3h-4v18zM20 21v-7h-4v7z"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>'),
  bell: svg('<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21h4"/>'),
};
// kind: go = 今ある画面へ進む／soon = まだ作っていない（Phase の予定を出す）
const MENU = [
  { id: 'rank', label: 'ランクマッチ', icon: 'rank', go: 'rank' },
  { id: 'casual', label: 'カジュアル', icon: 'casual', go: 'casual' },
  { id: 'friend', label: 'フレンド対戦', icon: 'friend', go: 'friend' },
  { id: 'deck', label: 'デッキ編成', icon: 'deck', go: 'deck' },
  { id: 'catalog', label: 'カード図鑑', icon: 'catalog', go: 'catalog' },
  { id: 'profile', label: 'プロフィール', icon: 'profile', go: 'profile' },
  { id: 'shop', label: 'ショップ', icon: 'shop', go: 'shop' },
  { id: 'gacha', label: 'ガチャ', icon: 'gacha', go: 'gacha' },
  { id: 'skin', label: 'スキン', icon: 'skin', go: 'skin' },
  { id: 'mission', label: 'ミッション', icon: 'mission', soon: 'Phase 6' },
  { id: 'ranking', label: 'ランキング', icon: 'ranking', go: 'ranking' },
  { id: 'settings', label: '設定', icon: 'settings', go: 'settings' },
];

export class Home {
  /**
   * @param {object} o
   * @param {(mode: string, titleButtonId: string) => void} o.onPlay 遊ぶ画面（今のタイトルの各モード）へ進む
   * @param {() => void} o.onDeck  @param {() => void} o.onCatalog  @param {() => void} o.onSettings
   * @param {() => void} o.onProfile
   */
  constructor({ onPlay, onDeck, onCatalog, onSettings, onProfile, onRanked = () => {}, onRanking = () => {}, onFriends = () => {}, onShop = () => {}, onGacha = () => {}, onSkin = () => {}, toast = () => {} }) {
    Object.assign(this, { onPlay, onDeck, onCatalog, onSettings, onProfile, onRanked, onRanking, onFriends, onShop, onGacha, onSkin, toast });
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
            <span class="home-level"><b data-part="lv">Lv.1</b><span class="home-xp" role="progressbar" aria-label="次のレベルまで" data-part="xpbar"><i data-part="xpfill"></i></span></span>
          </span>
        </button>
        <div class="home-side">
          <span class="home-coins" title="ゲーム内通貨（無料）" data-part="coins"><img src="assets/ui/icon-coin.png" alt="" width="22" height="22"><b>0</b></span>
          <button type="button" class="home-icon-btn raw-btn" data-act="notice" aria-label="お知らせ">${ICONS.bell}<i class="home-dot" data-part="dot" hidden></i></button>
          <button type="button" class="home-icon-btn raw-btn" data-act="settings" aria-label="設定">${ICONS.settings}</button>
        </div>
      </header>
      <section class="home-hero parchment" aria-label="対戦">
        <div class="home-modes" role="tablist" aria-label="ゲームモード" data-part="modes"></div>
        <dl class="home-facts">
          <div><dt>デッキ</dt><dd><span data-part="deck">—</span><button type="button" class="small-btn" data-act="deck">変更</button></dd></div>
          <div><dt>ランク</dt><dd data-part="rank"><span class="home-rank-emblem" data-part="rankEmblem"></span><span data-part="rankText">—</span></dd></div>
          <div><dt>戦績</dt><dd data-part="stats">—</dd></div>
        </dl>
        <button type="button" class="plank-btn big home-start" data-act="start"><span data-part="startLabel">対戦開始</span></button>
        <p class="home-note" data-part="note" role="status"></p>
      </section>
      <nav class="home-menu" aria-label="メニュー" data-part="menu"></nav>
    </div>`;
    document.getElementById('app').append(box);
    this.part = (n) => box.querySelector(`[data-part="${n}"]`);
    this.renderMenu();
    this.renderModes();
    box.addEventListener('click', (e) => this.onClick(e));
    account.onChange(() => { if (!box.hidden) this.refresh(); });
  }

  /** ホームを入口にするか（アカウント機能があって、ログイン中のとき） */
  available() { return account.enabled && !!account.user; }

  open() {
    this.box.hidden = false;
    this.refresh();
    this.box.querySelector('.home-start').focus({ preventScroll: true });
  }

  close() { this.box.hidden = true; }

  async refresh() {
    this.renderFacts();
    try {
      const r = await account.api('GET', '/api/home');
      if (!r.json?.ok) throw new Error('home');
      this.data = r.json;
      this.part('note').textContent = '';
    } catch {
      this.part('note').textContent = 'サーバーにつながっていません。ひとりで遊ぶ・同じ端末は、そのまま遊べます';
    }
    this.render();
  }

  render() {
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
    const iconSrc = d?.iconImage ?? d?.icons?.find((i) => i.id === d.icon)?.image;
    const av = this.part('avatar');
    av.replaceChildren();
    if (iconSrc) { const img = new Image(); img.src = iconSrc; img.alt = ''; av.append(img); } else av.textContent = [...(u?.displayName ?? '?')][0];
    this.part('coins').querySelector('b').textContent = String(d?.coins ?? 0);
    this.part('dot').hidden = !(d?.rewardsAvailable > 0 || this.socialCount > 0);
    const sum = d?.rank;
    const member = u?.kind === 'member';
    this.part('rankEmblem').innerHTML = member ? rankEmblem(sum?.rank ?? null, 26) : '';
    this.part('rankText').textContent = !member ? 'ゲストはランクマッチ不可（連携すると遊べます）'
      : sum?.rank ? `${sum.rank.divisionLabel}（${sum.rank.rp} RP）` : sum ? `認定戦 ${sum.placementTotal - sum.placementLeft}/${sum.placementTotal}` : '—';
    this.part('deck').textContent = d?.deck?.name ?? '未設定';
    this.part('stats').textContent = d?.stats?.matches ? `${d.stats.matches}戦 ${d.stats.wins}勝 ${d.stats.losses}敗（勝率 ${d.stats.winRate}%）` : 'まだ対戦がありません';
    this.renderFacts();
  }

  /** フレンドの申請・招待の数（フレンドのタイルとお知らせに印を出す） */
  setSocialBadge(n) {
    this.socialCount = n;
    const tile = this.box.querySelector('.home-tile[data-id=friend]');
    tile?.querySelector('.home-badge')?.remove();
    if (n > 0 && tile) { const b = document.createElement('em'); b.className = 'home-badge'; b.textContent = String(n); tile.append(b); }
    this.part('dot').hidden = !(n > 0 || this.data?.rewardsAvailable > 0);
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
    for (const m of MENU) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'home-tile raw-btn'; b.dataset.id = m.id;
      if (m.soon) { b.disabled = true; b.classList.add('soon'); b.title = `準備中（${m.soon}で作ります）`; }
      b.innerHTML = `<span class="home-tile-icon">${ICONS[m.icon]}</span><span class="home-tile-label"></span>${m.soon ? '<em>準備中</em>' : ''}`;
      b.querySelector('.home-tile-label').textContent = m.label;
      nav.append(b);
    }
  }

  onClick(e) {
    const modeBtn = e.target.closest('.home-mode');
    if (modeBtn) {
      this.mode = modeBtn.dataset.mode;
      try { localStorage.setItem(MODE_KEY, this.mode); } catch { /* ok */ }
      sound.play('tap');
      this.renderModes(); this.renderFacts();
      return;
    }
    const tile = e.target.closest('.home-tile');
    const act = tile ? MENU.find((m) => m.id === tile.dataset.id)?.go : e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    sound.play('tap');
    if (act === 'start') return this.onPlay(this.mode, MODES[this.mode].titleButton);
    if (act === 'casual') return this.onPlay('online', MODES.online.titleButton);
    if (act === 'deck') return this.onDeck();
    if (act === 'catalog') return this.onCatalog();
    if (act === 'settings') return this.onSettings();
    if (act === 'profile') return this.onProfile();
    if (act === 'rank') return this.onRanked();
    if (act === 'friend') return this.onFriends();
    if (act === 'shop') return this.onShop();
    if (act === 'gacha') return this.onGacha();
    if (act === 'skin') return this.onSkin();
    if (act === 'ranking') return this.onRanking();
    if (act === 'notice') {
      const n = this.data?.rewardsAvailable ?? 0;
      if (this.socialCount > 0) return this.onFriends();
      if (n > 0) return this.onProfile();
      this.toast('新しいお知らせはありません', 'info');
    }
  }
}
