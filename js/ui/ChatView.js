// チャットとスタンプ。上の「💬」ボタンで開く。
// - スタンプ：決まった一覧（data/stamps.json）から選ぶ。ひとりで遊ぶ（CPU がスタンプで返す）でも使える
// - 文字：オンライン対戦だけ（短い文。サーバーが長さ・間隔を決めている）
// 送る・届いたものを受け取る相手は main.js が決める（send / add）。表示名は人が入れた文字なので textContent で出す。

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
    this.lastAt = 0;
    this.build();
    this.button.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(); });
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.panel.hidden) this.close(); });
    this.setEnabled(false);
  }

  build() {
    const panel = document.createElement('section');
    panel.id = 'chat-panel';
    panel.className = 'chat-panel parchment';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'チャット');
    panel.innerHTML =
      '<div class="chat-head"><b>チャット</b><button type="button" class="chat-close round-btn" aria-label="閉じる">✕</button></div>' +
      '<ol class="chat-log inset-panel" aria-live="polite"></ol>' +
      '<div class="chat-stamps" role="group" aria-label="スタンプ"></div>' +
      '<form class="chat-form" autocomplete="off"><input class="chat-input" type="text" enterkeyhint="send" aria-label="メッセージ" placeholder="ひとこと（短く）"><button type="submit" class="small-btn chat-send">送る</button></form>' +
      '<p class="chat-note" role="status"></p>';
    this.root.appendChild(panel);
    this.panel = panel;
    this.log = panel.querySelector('.chat-log');
    this.note = panel.querySelector('.chat-note');
    this.form = panel.querySelector('.chat-form');
    this.input = panel.querySelector('.chat-input');
    this.input.maxLength = this.maxLength;
    const grid = panel.querySelector('.chat-stamps');
    for (const s of this.stamps) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chat-stamp';
      b.dataset.stamp = s.id;
      b.title = s.label;
      b.setAttribute('aria-label', s.label);
      const i = document.createElement('span'); i.className = 'chat-stamp-icon'; i.textContent = s.icon;
      const l = document.createElement('span'); l.className = 'chat-stamp-label'; l.textContent = s.label;
      b.append(i, l);
      b.addEventListener('click', (e) => { e.stopPropagation(); this.submit({ stamp: s.id }); });
      grid.appendChild(b);
    }
    panel.querySelector('.chat-close').addEventListener('click', (e) => { e.stopPropagation(); this.close(); });
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      if (!text) return;
      this.submit({ text }, () => { this.input.value = ''; });
    });
    // 吹き出し（最後に届いたものを、上に少しのあいだ出す）
    const bubbles = document.createElement('div');
    bubbles.id = 'chat-bubbles';
    bubbles.setAttribute('aria-hidden', 'true');
    this.root.appendChild(bubbles);
    this.bubbles = bubbles;
  }

  /** チャットを使えるか（使えないときはボタンも出さない）と、文字を送れるか */
  setEnabled(enabled, { text = false } = {}) {
    this.enabled = enabled;
    this.textEnabled = enabled && text;
    this.button.hidden = !enabled;
    this.form.hidden = !this.textEnabled;
    if (!enabled) this.close();
  }

  open() {
    if (!this.enabled) return;
    this.panel.hidden = false;
    this.unread = 0;
    this.renderBadge();
    this.log.scrollTop = this.log.scrollHeight;
    if (this.textEnabled) this.input.focus({ preventScroll: true });
  }

  close() {
    this.panel.hidden = true;
  }

  toggle() {
    if (this.panel.hidden) this.open(); else this.close();
  }

  /** 試合・部屋が変わったとき：履歴と吹き出しを空にする */
  reset() {
    this.log.replaceChildren();
    this.bubbles.replaceChildren();
    this.unread = 0;
    this.note.textContent = '';
    this.renderBadge();
    this.close();
  }

  async submit(payload, onOk) {
    if (!this.send) return;
    const res = await this.send(payload);
    if (res && res.ok === false) {
      this.note.textContent = res.reason ?? '送れませんでした';
      return;
    }
    this.note.textContent = '';
    onOk?.();
  }

  stampOf(id) {
    return this.stamps.find((s) => s.id === id) ?? null;
  }

  /** 履歴をまとめて入れる（つなぎ直したとき。吹き出しは出さない） */
  addAll(messages) {
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
    const mine = msg.playerId === this.myId;
    const li = document.createElement('li');
    li.className = `chat-line${mine ? ' mine' : ''}`;
    const who = document.createElement('b'); who.className = 'chat-who'; who.textContent = msg.name ?? '';
    const body = document.createElement('span'); body.className = 'chat-body';
    body.textContent = stamp ? `${stamp.icon} ${stamp.label}` : msg.text;
    li.append(who, body);
    this.log.appendChild(li);
    while (this.log.children.length > LOG_MAX) this.log.firstElementChild.remove();
    this.log.scrollTop = this.log.scrollHeight;
    if (unread) {
      this.unread += 1;
      this.renderBadge();
    }
    if (bubble) this.bubble(msg, stamp, mine);
  }

  bubble(msg, stamp, mine) {
    const box = document.createElement('div');
    box.className = `chat-bubble${mine ? ' mine' : ''}${stamp ? ' stamp' : ''}`;
    const who = document.createElement('small'); who.textContent = msg.name ?? '';
    const body = document.createElement('span'); body.textContent = stamp ? stamp.icon : msg.text;
    if (stamp) box.title = stamp.label;
    box.append(who, body);
    this.bubbles.appendChild(box);
    while (this.bubbles.children.length > 3) this.bubbles.firstElementChild.remove();
    setTimeout(() => box.remove(), BUBBLE_MS);
  }

  renderBadge() {
    this.button.dataset.unread = this.unread > 0 ? String(Math.min(9, this.unread)) : '';
    this.button.setAttribute('aria-label', this.unread > 0 ? `チャット（未読${this.unread}）` : 'チャット');
  }
}
