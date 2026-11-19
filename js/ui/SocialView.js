// フレンド画面：フレンド一覧（オンライン状態）・パーティー・申請・さがす・設定とブロック。
// フレンドの情報はサーバーが持つ。ここは表示と操作の窓口（名前などは textContent で入れる）。
// 招待・パーティーの知らせは、画面を開いていなくても（ホームにいるあいだ）一定間隔で読んで、バナーで出す。
import { account } from './Account.js';

const STATUS = { online: ['オンライン', 'on'], in_match: ['対戦中', 'match'], offline: ['オフライン', 'off'], hidden: ['非表示', 'off'] };
const SETTING_LABEL = {
  acceptRequests: 'フレンド申請を受ける', acceptInvites: '対戦の招待を受ける', showOnline: 'オンライン状態をフレンドに見せる', searchable: '名前で検索されるようにする',
};
const RELATION_TEXT = { friend: 'フレンド', pending_out: '申請中', pending_in: '申請が来ています' };
const POLL_MS = 4000;
const BACKGROUND_MS = 8000;

export class SocialView {
  /**
   * @param {object} o
   * @param {(passphrase: string) => void} o.onJoinRoom 合言葉の部屋に入る（招待・パーティーの対戦）
   * @param {(userId: string) => void} o.onProfile  @param {() => void} o.onNeedMember
   * @param {(count: number) => void} o.onBadge 知らせの数が変わった
   */
  constructor({ toast = () => {}, onJoinRoom = () => {}, onProfile = () => {}, onNeedMember = () => {}, onBadge = () => {} } = {}) {
    Object.assign(this, { toast, onJoinRoom, onProfile, onNeedMember, onBadge });
    this.tab = 'friends';
    this.data = null;
    this.expanded = null;
    this.confirming = null;
    this.joinedParty = null;
    const box = this.box = document.createElement('div');
    box.id = 'social'; box.className = 'screen dim'; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'social-title');
    box.innerHTML = `<div class="screen-box parchment social-box">
      <h2 id="social-title">フレンド</h2>
      <div class="social-tabs" role="tablist" data-part="tabs"></div>
      <div class="social-body" data-part="body"></div>
      <p class="social-msg" data-part="msg" role="status"></p>
      <button type="button" class="plank-btn social-close">閉じる</button>
    </div>`;
    const banner = this.banner = document.createElement('div');
    banner.id = 'social-banner'; banner.hidden = true; banner.setAttribute('role', 'alert');
    document.getElementById('app').append(box, banner);
    this.part = (n) => box.querySelector(`[data-part="${n}"]`);
    box.querySelector('.social-close').addEventListener('click', () => this.close());
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
    box.addEventListener('click', (e) => this.onClick(e));
    box.addEventListener('submit', (e) => { e.preventDefault(); this.search(); });
    box.addEventListener('change', async (e) => {
      const key = e.target.dataset?.setting; if (!key) return;
      const r = await this.call('/api/social/settings', { settings: { [key]: e.target.checked } });
      if (r) this.data.settings = r.settings; else e.target.checked = !e.target.checked;
    });
    banner.addEventListener('click', (e) => this.onBanner(e));
    setInterval(() => { if (this.box.hidden && this.active()) this.refresh(); }, BACKGROUND_MS);
  }

  /** フレンド機能を使える状態か（アカウント機能があり、会員で、ページが見えている） */
  active() { return account.enabled && account.user?.kind === 'member' && document.visibilityState === 'visible'; }

  async open(tab = 'friends') {
    this.tab = tab; this.say('');
    this.box.hidden = false;
    this.box.querySelector('.social-close').focus({ preventScroll: true });
    if (!account.user || account.user.kind !== 'member') { this.renderGuest(); return; }
    this.part('body').replaceChildren(this.el('p', 'social-empty', '読み込み中…')); // 古い表示を残さない
    await this.refresh();
    clearInterval(this.poll);
    this.poll = setInterval(() => (this.box.hidden ? clearInterval(this.poll) : this.refresh()), POLL_MS);
  }

  close() { this.box.hidden = true; clearInterval(this.poll); }
  say(t, bad = false) { const m = this.part('msg'); m.textContent = t; m.classList.toggle('bad', bad); }

  async call(path, body) {
    const r = await account.api('POST', path, body ?? {});
    if (!r.json?.ok) { this.say(r.json?.reason ?? 'サーバーにつながりません', true); return null; }
    return r.json;
  }

  async refresh() {
    let r;
    try { r = await account.api('GET', '/api/social/state'); } catch { return; }
    if (!r.json?.ok) { if (!this.box.hidden) this.say(r.json?.reason ?? '読み込めませんでした', true); return; }
    this.data = r.json;
    const d = this.data;
    this.onBadge(d.incoming.length + d.invites.length + (d.party?.room && d.party.room.passphrase !== this.joinedParty ? 1 : 0));
    this.renderBanner();
    if (!this.box.hidden) this.render();
  }

  // ---- バナー（招待・パーティーの対戦）----
  renderBanner() {
    const d = this.data;
    const b = this.banner;
    b.replaceChildren();
    const row = (text, buttons) => {
      const p = document.createElement('div'); p.className = 'social-banner-row';
      const t = document.createElement('span'); t.textContent = text; p.append(t);
      for (const [label, attrs] of buttons) { const x = document.createElement('button'); x.type = 'button'; x.className = 'small-btn'; x.textContent = label; Object.assign(x.dataset, attrs); p.append(x); }
      b.append(p);
    };
    const inv = d.invites[0];
    if (inv && inv.kind === 'room') row(`${inv.from.name}さんが対戦に招待しています`, [['参加', { act: 'inv-yes', id: inv.id }], ['断る', { act: 'inv-no', id: inv.id }]]);
    else if (inv && inv.kind === 'party') row(`${inv.from.name}さんがパーティーに招待しています`, [['入る', { act: 'inv-yes', id: inv.id }], ['断る', { act: 'inv-no', id: inv.id }]]);
    else if (d.party?.room && d.party.room.passphrase !== this.joinedParty && !d.party.isLeader) row('パーティーの部屋ができました', [['参加', { act: 'party-join' }]]);
    // 画面を開いているあいだ（フレンド画面の中）は、バナーを出さない
    b.hidden = b.childElementCount === 0 || !this.box.hidden;
  }

  async onBanner(e) {
    const btn = e.target.closest('button'); if (!btn) return;
    const { act, id } = btn.dataset;
    if (act === 'inv-yes' || act === 'inv-no') {
      const r = await this.call('/api/invites/respond', { id, accept: act === 'inv-yes' });
      if (r?.passphrase) this.onJoinRoom(r.passphrase);
      else if (r?.kind === 'party') this.toast('パーティーに入りました', 'info');
      await this.refresh();
    } else if (act === 'party-join') this.joinPartyRoom();
  }

  joinPartyRoom() {
    const pass = this.data?.party?.room?.passphrase;
    if (!pass) return;
    this.joinedParty = pass;
    this.close();
    this.onJoinRoom(pass);
  }

  // ---- 画面 ----
  renderGuest() {
    this.part('tabs').replaceChildren();
    const body = this.part('body'); body.replaceChildren();
    const p = document.createElement('p'); p.className = 'social-note';
    p.textContent = 'フレンド機能は、GoogleかAppleに連携したアカウントで使えます。ゲストのままでは使えません。';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'plank-btn'; b.textContent = 'アカウントを連携する';
    b.addEventListener('click', () => { this.close(); this.onNeedMember(); });
    body.append(p, b);
  }

  render() {
    if (!this.data) return;
    const d = this.data;
    const tabs = this.part('tabs'); tabs.replaceChildren();
    const defs = [['friends', 'フレンド', 0], ['requests', '申請', d.incoming.length], ['search', 'さがす', 0], ['settings', '設定', 0]];
    for (const [id, label, n] of defs) {
      const t = document.createElement('button'); t.type = 'button'; t.className = 'social-tab raw-btn'; t.setAttribute('role', 'tab'); t.setAttribute('aria-selected', String(this.tab === id)); t.dataset.tab = id;
      t.textContent = label;
      if (n) { const c = document.createElement('i'); c.textContent = String(n); t.append(c); }
      tabs.append(t);
    }
    const body = this.part('body');
    // 入力中の文字を、定期更新で消さない
    const typing = this.tab === 'search' && body.querySelector('input');
    if (typing && document.activeElement === typing) return;
    body.replaceChildren();
    ({ friends: () => this.renderFriends(body), requests: () => this.renderRequests(body), search: () => this.renderSearch(body), settings: () => this.renderSettings(body) })[this.tab]();
  }

  el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  btn(label, data, cls = 'small-btn') { const b = this.el('button', cls, label); b.type = 'button'; Object.assign(b.dataset, data); return b; }

  who(c, extra) {
    const w = this.el('div', 'social-who');
    const img = this.el('span', 'social-avatar'); img.textContent = [...c.name][0] ?? '?';
    const t = this.el('div', 'social-name'); const n = this.el('strong', null, c.name); const s = this.el('small', null, `Lv.${c.level}${extra ? `　${extra}` : ''}`); t.append(n, s);
    w.append(img, t);
    return w;
  }

  renderFriends(body) {
    const d = this.data;
    body.append(this.renderParty());
    if (d.friends.length === 0) body.append(this.el('p', 'social-empty', 'まだフレンドがいません。「さがす」で、名前かフレンドコードから探せます'));
    const list = this.el('ul', 'social-list');
    for (const f of d.friends) {
      const [label, cls] = STATUS[f.status] ?? STATUS.offline;
      const li = this.el('li', `social-row${this.expanded === f.userId ? ' open' : ''}`);
      const main = this.btn('', { act: 'toggle', id: f.userId }, 'social-main raw-btn');
      main.append(this.who(f), Object.assign(this.el('span', `social-status ${cls}`), { textContent: label }));
      li.append(main);
      if (this.expanded === f.userId) {
        const acts = this.el('div', 'social-actions');
        acts.append(this.btn('対戦に招待', { act: 'invite', id: f.userId }, 'plank-btn'));
        if (d.party) acts.append(this.btn('パーティーに招待', { act: 'party-invite', id: f.userId }));
        acts.append(this.btn('プロフィール', { act: 'profile', id: f.userId }));
        acts.append(this.btn(this.confirming === `rm-${f.userId}` ? 'もう一度押すと削除' : 'フレンドを削除', { act: 'remove', id: f.userId }));
        acts.append(this.btn(this.confirming === `bl-${f.userId}` ? 'もう一度押すとブロック' : 'ブロック', { act: 'block', id: f.userId }, 'small-btn danger'));
        li.append(acts);
      }
      list.append(li);
    }
    body.append(list);
  }

  renderParty() {
    const p = this.data.party;
    const sec = this.el('section', 'social-party');
    sec.append(this.el('h3', null, 'パーティー'));
    if (!p) {
      sec.append(this.el('p', 'social-note', 'フレンドと一緒に、同じ部屋で遊べます。'));
      sec.append(this.btn('パーティーを作る', { act: 'party-create' }, 'plank-btn'));
      return sec;
    }
    const ul = this.el('ul', 'social-party-members');
    for (const m of p.members) {
      const li = this.el('li');
      li.append(this.el('span', null, `${m.leader ? '👑 ' : ''}${m.name}`));
      if (p.isLeader && m.userId !== account.user.id) li.append(this.btn('外す', { act: 'party-kick', id: m.userId }));
      ul.append(li);
    }
    sec.append(ul);
    const acts = this.el('div', 'social-actions');
    if (p.isLeader) acts.append(this.btn(p.members.length < 2 ? '2人以上で始められます' : 'パーティーで対戦する', { act: 'party-start' }, 'plank-btn'));
    else if (p.room) acts.append(this.btn('部屋に参加する', { act: 'party-join' }, 'plank-btn'));
    else acts.append(this.el('small', null, 'リーダーが始めるのを待っています'));
    acts.append(this.btn('パーティーを抜ける', { act: 'party-leave' }));
    sec.append(acts);
    if (p.isLeader && p.members.length < 2) sec.querySelector('[data-act=party-start]').disabled = true;
    return sec;
  }

  renderRequests(body) {
    const d = this.data;
    body.append(this.el('h3', null, '届いた申請'));
    if (!d.incoming.length) body.append(this.el('p', 'social-empty', '届いている申請はありません'));
    const inc = this.el('ul', 'social-list');
    for (const c of d.incoming) {
      const li = this.el('li', 'social-row'); li.append(this.who(c));
      const a = this.el('div', 'social-actions inline');
      a.append(this.btn('承認', { act: 'accept', id: c.userId }, 'plank-btn'), this.btn('断る', { act: 'decline', id: c.userId }));
      li.append(a); inc.append(li);
    }
    body.append(inc, this.el('h3', null, '送った申請'));
    if (!d.outgoing.length) body.append(this.el('p', 'social-empty', '返事待ちの申請はありません'));
    const out = this.el('ul', 'social-list');
    for (const c of d.outgoing) {
      const li = this.el('li', 'social-row'); li.append(this.who(c, '返事待ち'));
      const a = this.el('div', 'social-actions inline'); a.append(this.btn('取り消す', { act: 'cancel', id: c.userId })); li.append(a); out.append(li);
    }
    body.append(out);
  }

  renderSearch(body) {
    const d = this.data;
    const code = this.el('div', 'social-code');
    code.append(this.el('small', null, 'あなたのフレンドコード'), this.el('strong', null, d.code), this.btn('コピー', { act: 'copy' }));
    const form = this.el('form', 'social-search');
    const input = this.el('input'); input.type = 'search'; input.name = 'q'; input.maxLength = 16; input.placeholder = '名前（2文字以上）かフレンドコード'; input.autocomplete = 'off'; input.enterKeyHint = 'search'; input.value = this.query ?? '';
    const go = this.btn('さがす', {}, 'plank-btn'); go.type = 'submit';
    form.append(input, go);
    body.append(code, form);
    const res = this.el('ul', 'social-list'); res.dataset.part = 'results';
    body.append(res);
    for (const c of this.results ?? []) {
      const li = this.el('li', 'social-row'); li.append(this.who(c));
      const a = this.el('div', 'social-actions inline');
      if (c.relation === 'none') a.append(this.btn('申請する', { act: 'request', id: c.userId }, 'plank-btn'));
      else a.append(this.el('small', null, RELATION_TEXT[c.relation] ?? ''));
      li.append(a); res.append(li);
    }
    if (this.results && this.results.length === 0) body.append(this.el('p', 'social-empty', '見つかりませんでした'));
  }

  renderSettings(body) {
    const d = this.data;
    body.append(this.el('h3', null, '受け取る・見せる'));
    for (const [key, label] of Object.entries(SETTING_LABEL)) {
      const row = this.el('label', 'social-toggle'); row.append(this.el('span', null, label));
      const cb = this.el('input'); cb.type = 'checkbox'; cb.checked = d.settings[key]; cb.dataset.setting = key; row.append(cb); body.append(row);
    }
    body.append(this.el('h3', null, 'ブロックした人'));
    if (!d.blocked.length) body.append(this.el('p', 'social-empty', 'ブロックしている人はいません'));
    const ul = this.el('ul', 'social-list');
    for (const c of d.blocked) { const li = this.el('li', 'social-row'); li.append(this.who(c)); const a = this.el('div', 'social-actions inline'); a.append(this.btn('解除', { act: 'unblock', id: c.userId })); li.append(a); ul.append(li); }
    body.append(ul);
  }

  async search() {
    const q = this.part('body').querySelector('input[name=q]')?.value ?? '';
    this.query = q;
    const r = await this.call('/api/friends/search', { q });
    if (r) { this.results = r.results; this.say(''); }
    this.render();
  }

  async onClick(e) {
    const tab = e.target.closest('.social-tab');
    if (tab) { this.tab = tab.dataset.tab; this.say(''); this.render(); return; }
    const t = e.target.closest('[data-act]');
    if (!t) { if (e.target === this.box) this.close(); return; }
    const { act, id } = t.dataset;
    const confirmed = (key) => { if (this.confirming === key) { this.confirming = null; return true; } this.confirming = key; this.render(); return false; };
    switch (act) {
      case 'toggle': this.expanded = this.expanded === id ? null : id; this.confirming = null; return this.render();
      case 'profile': this.close(); return this.onProfile(id);
      case 'copy': try { await navigator.clipboard.writeText(this.data.code); this.say('コピーしました'); } catch { this.say('コピーできませんでした。コードを見て入力してもらってください', true); } return undefined;
      case 'request': { const r = await this.call('/api/friends/request', { userId: id }); if (r) { await this.search(); await this.refresh(); this.say(r.state === 'accepted' ? 'フレンドになりました' : '申請しました'); } return undefined; }
      case 'accept': case 'decline': await this.call('/api/friends/respond', { userId: id, accept: act === 'accept' }); return this.refresh();
      case 'cancel': await this.call('/api/friends/cancel', { userId: id }); return this.refresh();
      case 'remove': if (confirmed(`rm-${id}`)) { await this.call('/api/friends/remove', { userId: id }); this.expanded = null; await this.refresh(); } return undefined;
      case 'block': if (confirmed(`bl-${id}`)) { await this.call('/api/block', { userId: id }); this.expanded = null; await this.refresh(); } return undefined;
      case 'unblock': await this.call('/api/unblock', { userId: id }); return this.refresh();
      case 'invite': { const r = await this.call('/api/invites/send', { userId: id }); if (r) { this.close(); this.toast('招待を送りました。相手が来るのを待ちます', 'info'); this.onJoinRoom(r.passphrase); } return undefined; }
      case 'party-create': await this.call('/api/party/create'); return this.refresh();
      case 'party-invite': { const r = await this.call('/api/party/invite', { userId: id }); if (r) this.say('パーティーに招待しました'); return undefined; }
      case 'party-leave': await this.call('/api/party/leave'); return this.refresh();
      case 'party-kick': await this.call('/api/party/kick', { userId: id }); return this.refresh();
      case 'party-start': { const r = await this.call('/api/party/start'); if (r) { this.joinedParty = r.passphrase; this.close(); this.onJoinRoom(r.passphrase); } return undefined; }
      case 'party-join': return this.joinPartyRoom();
      default: return undefined;
    }
  }
}
