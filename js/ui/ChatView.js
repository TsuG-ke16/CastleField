// チャットとスタンプ。上の「💬」ボタンで開く。
// - スタンプ：決まった一覧（data/stamps.json）から選ぶ。ひとりで遊ぶ（CPU がスタンプで返す）でも使える
// - 文字：オンライン対戦だけ（短い文。サーバーが長さ・間隔を決めている）
// 送る・届いたものを受け取る相手は main.js が決める（send / add）。表示名は人が入れた文字なので textContent で出す。

import { sound } from './Sound.js';

const BUBBLE_MS = 3500;   // 吹き出しが出ている時間
const LOG_MAX = 40;       // パネルに残す数

export class ChatView {
  /**
   * @param {object} o
   * @param {{id:string, icon:string, label:string}[]} o.stamps
   * @param {HTMLElement} o.button 開くボタン（#chat-open）
   * @param {HTMLElement} o.root 置き場所（#app）
   * @param {number} [o.maxLength] 文字の最大数
   */
  constructor({ stamps, button, root, maxLength = 40 }) {
    this.stamps = stamps ?? [];
    this.button = button;
    this.root = root;
    this.maxLength = maxLength;
    this.send = null;          // (payload) => Promise<{ok, reason}>。main.js が入れる
    this.myId = null;
    this.textEnabled = false;
    this.unread = 0;
    this.lineIds = new Set();
    this.revision = 0;
    this.build();
    this.button.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(); });
    root.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || this.panel.hidden) return;
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
    });
    this.button.setAttribute('aria-controls', 'chat-panel');
    this.button.setAttribute('aria-expanded', 'false');
    window.addEventListener('resize', () => this.fitPanel());
    window.visualViewport?.addEventListener('resize', () => this.fitPanel());
    window.visualViewport?.addEventListener('scroll', () => this.fitPanel());
    this.setEnabled(false);
  }

  build() {
    const panel = document.createElement('section');
    panel.id = 'chat-panel';
    panel.className = 'chat-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'チャット');
    panel.innerHTML =
      '<div class="chat-head"><b>チャット</b><button type="button" class="chat-close round-btn" aria-label="閉じる">✕</button></div>' +
      '<div class="chat-content"><ol class="chat-log inset-panel" aria-live="polite"></ol>' +
      '<div class="chat-stamps" role="group" aria-label="スタンプ"></div></div>' +
      '<form class="chat-form" autocomplete="off"><input class="chat-input" type="text" enterkeyhint="send" aria-label="メッセージ" placeholder="ひとこと（短く）"><button type="submit" class="small-btn chat-send">送る</button></form>' +
      '<p class="chat-note" role="status"></p>';
    this.root.appendChild(panel);
    this.panel = panel;
    this.log = panel.querySelector('.chat-log');
    this.note = panel.querySelector('.chat-note');
    this.form = panel.querySelector('.chat-form');
    this.input = panel.querySelector('.chat-input');
    this.input.maxLength = this.maxLength;
    this.closer = panel.querySelector('.chat-close');
    this.closer.addEventListener('click', (e) => { e.stopPropagation(); this.close(true); });
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      if (!text) return;
      this.submit({ text }, () => { if (this.input.value.trim() === text) this.input.value = ''; });
    });
    const bubbles = document.createElement('div');
    bubbles.id = 'chat-bubbles';
    bubbles.setAttribute('aria-hidden', 'true');
    this.root.appendChild(bubbles);
    this.bubbles = bubbles;
  }

  buildStamps() {
    const grid = this.panel.querySelector('.chat-stamps');
    if (grid.childElementCount) return;
    for (const s of this.stamps) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chat-stamp';
      b.dataset.stamp = s.id;
      b.title = s.label;
      b.setAttribute('aria-label', s.label);
      const i = this.stampArt(s);
      const l = document.createElement('span'); l.className = 'chat-stamp-label'; l.textContent = s.label;
      b.append(i, l);
      b.addEventListener('click', (e) => { e.stopPropagation(); this.submit({ stamp: s.id }); });
      grid.appendChild(b);
    }
  }

  /** チャットを使えるか（使えないときはボタンも出さない）と、文字を送れるか */
  setEnabled(enabled, { text = false } = {}) {
    this.enabled = enabled;
    this.textEnabled = enabled && text;
    this.button.hidden = !enabled;
    this.form.hidden = !this.textEnabled;
    if (!enabled) this.close();
  }

  fitPanel() {
    const root = this.root.getBoundingClientRect();
    const hud = document.getElementById('hud').getBoundingClientRect();
    const viewport = window.visualViewport;
    const top = Math.max(6, hud.bottom - root.top + 6, (viewport?.offsetTop ?? 0) - root.top + 6);
    const viewportEnd = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
    const available = Math.max(0, Math.min(viewportEnd, root.bottom) - root.top - top - 8);
    this.panel.style.setProperty('--chat-top', `${top}px`);
    this.panel.style.setProperty('--chat-space', `${available}px`);
    this.bubbles.style.setProperty('--chat-bubbles-top', `${top}px`);
  }

  open() {
    if (!this.enabled) return;
    this.buildStamps();
    this.panel.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
    this.unread = 0;
    this.renderBadge();
    this.bubbles.replaceChildren();
    this.fitPanel();
    this.log.scrollTop = this.log.scrollHeight;
    this.closer.focus({ preventScroll: true });
  }

  close(returnFocus = false) {
    this.panel.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
    if (returnFocus && !this.button.hidden) this.button.focus({ preventScroll: true });
  }

  toggle() {
    if (this.panel.hidden) this.open(); else this.close(true);
  }

  /** 試合・部屋が変わったとき：履歴と吹き出しを空にする */
  reset() {
    this.revision++;
    this.lineIds.clear();
    this.log.replaceChildren();
    this.bubbles.replaceChildren();
    this.input.value = '';
    this.unread = 0;
    this.note.textContent = '';
    this.renderBadge();
    this.close();
  }

  async submit(payload, onOk) {
    if (!this.send) return;
    const revision = this.revision;
    let res;
    try { res = await this.send(payload); }
    catch { res = { ok: false, reason: '接続を確認して、もう一度送ってください' }; }
    if (revision !== this.revision) return;
    if (res && res.ok === false) {
      this.note.textContent = res.reason ?? '送れませんでした';
      return;
    }
    this.note.textContent = '';
    onOk?.();
  }

  stampArt(stamp) {
    const art = document.createElement('span');
    art.className = 'chat-stamp-art';
    art.setAttribute('aria-hidden', 'true');
    const fallback = document.createElement('span');
    fallback.textContent = stamp.icon;
    art.append(fallback);
    const image = document.createElement('img');
    image.hidden = true;
    image.alt = '';
    image.addEventListener('load', () => {
      image.hidden = false;
      fallback.hidden = true;
    }, { once: true });
    image.src = `assets/ui/stamps/${stamp.id}.png`;
    art.append(image);
    return art;
  }

  stampOf(id) {
    return this.stamps.find((s) => s.id === id) ?? null;
  }

  /** 履歴をまとめて入れる（つなぎ直したとき。吹き出しは出さない） */
  addAll(messages) {
    this.log.replaceChildren();
    this.lineIds.clear();
    for (const m of messages ?? []) this.addLine(m, { bubble: false, unread: false });
  }

  /** 届いた1通。パネルが閉じていれば未読を数え、吹き出しを出す */
  add(msg) {
    this.addLine(msg, { bubble: true, unread: this.panel.hidden && msg.playerId !== this.myId });
  }

  addLine(msg, { bubble, unread }) {
    const stamp = msg.stamp !== undefined ? this.stampOf(msg.stamp) : null;
    if (msg.stamp !== undefined && !stamp) return;
    if (msg.text === undefined && !stamp) return;
    if (msg.id != null && this.lineIds.has(msg.id)) return;
    if (msg.id != null) this.lineIds.add(msg.id);
    const mine = msg.playerId === this.myId;
    const li = document.createElement('li');
    li.className = `chat-line${mine ? ' mine' : ''}`;
    const who = document.createElement('b'); who.className = 'chat-who'; who.textContent = msg.name ?? '';
    const body = document.createElement('span'); body.className = 'chat-body';
    if (stamp) body.append(this.stampArt(stamp), document.createTextNode(stamp.label));
    else body.textContent = msg.text;
    li.chatId = msg.id;
    li.append(who, body);
    this.log.appendChild(li);
    while (this.log.children.length > LOG_MAX) {
      const oldest = this.log.firstElementChild;
      this.lineIds.delete(oldest.chatId);
      oldest.remove();
    }
    this.log.scrollTop = this.log.scrollHeight;
    if (unread) {
      this.unread += 1;
      this.renderBadge();
      sound.play('chatNotice');
    }
    if (bubble && this.panel.hidden) this.bubble(msg, stamp, mine);
  }

  bubble(msg, stamp, mine) {
    const box = document.createElement('div');
    box.className = `chat-bubble${mine ? ' mine' : ''}${stamp ? ' stamp' : ''}`;
    const who = document.createElement('small'); who.textContent = msg.name ?? '';
    const body = stamp ? this.stampArt(stamp) : document.createElement('span');
    if (!stamp) body.textContent = msg.text;
    this.fitPanel();
    if (stamp) box.title = stamp.label;
    box.append(who, body);
    this.bubbles.appendChild(box);
    while (this.bubbles.children.length > 3) this.bubbles.firstElementChild.remove();
    setTimeout(() => box.remove(), BUBBLE_MS);
  }

  renderBadge() {
    this.button.dataset.unread = this.unread > 0 ? (this.unread > 9 ? '9+' : String(this.unread)) : '';
    this.button.setAttribute('aria-label', this.unread > 0 ? `チャット（未読${this.unread}）` : 'チャット');
  }
}
