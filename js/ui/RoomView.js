// サーバーが送る選択肢と席だけで部屋を描く。名前は必ず textContent。
import { castleArt, colorOf } from './art.js';
import { profileArt } from './profileArt.js';
import { rankEmblem } from './RankEmblem.js';
import { deckChoice, deckSlot } from './DeckStore.js';

const ROOM_DECK_KEY = 'cf-room-deck-v1';
const RULE_ROWS = [['winCondition','勝ち方','winConditions'],['deckMode','山札','deckModes'],['teams','チームの分け方','teamModes'],['stage','ステージ','stages']];

export class RoomView {
  constructor({ onAction, onLeave, onChat, getUnread, onEditDeck, savedDecks, presetDeck, previewDeck }) {
    this.onAction = onAction;
    this.onChat = onChat;           // チャットを開く・閉じる（部屋の画面からも話せる）
    this.getUnread = getUnread;
    this.onEditDeck = onEditDeck;   // デッキ編成の画面を開く
    Object.assign(this, { savedDecks, presetDeck, previewDeck });
    this.onLeave = onLeave;
    this.el = document.createElement('section');
    this.el.id = 'room-screen';
    this.el.className = 'screen';
    this.el.hidden = true;
    document.getElementById('app').append(this.el);
    this.pending = false;
    document.getElementById('app').addEventListener('chat-unread', (e) => {
      const b = this.el.querySelector('.room-chat-btn'); const n = e.detail ?? 0;
      if (b) b.dataset.unread = n > 0 ? (n > 9 ? '9+' : String(n)) : '';
    });
    this.level = null;
    try {
      const cached = JSON.parse(sessionStorage.getItem(ROOM_DECK_KEY));
      if (cached && typeof cached.name === 'string' && cached.list && typeof cached.list === 'object') {
        this.customSelection = cached;
      }
    } catch { /* 部屋のプレビューはページ内だけに保持する */ }
  }
  hide() { this.el.hidden = true; }

  clearMyDeckSelection() {
    this.customSelection = null;
    try { sessionStorage.removeItem(ROOM_DECK_KEY); } catch { /* ストレージなし */ }
  }

  ownSelection() {
    const { room } = this;
    const selection = this.customSelection;
    if (selection?.roomId === room?.roomId && selection?.playerId === room?.you) return selection;
    return null;
  }

  async useMyDeck(slot) {
    const deck = this.savedDecks()[slot];
    if (!deck?.valid) {
      this.onEditDeck?.(slot);
      return;
    }
    const { roomId, you } = this.room;
    const result = await this.act('setSeat', [{ deckList: deck.list }]);
    if (!result?.ok || this.room.roomId !== roomId || this.room.you !== you) return;
    this.customSelection = { ...deck, roomId, playerId: you };
    // サーバーは部屋の表示に編成内容を含めないので、自分が送った内容をこのタブに覚える。
    try { sessionStorage.setItem(ROOM_DECK_KEY, JSON.stringify(this.customSelection)); } catch { /* ストレージなし */ }
    if (!this.el.hidden) this.render(this.room, this.passphrase);
  }

  refreshDecks(saved) {
    if (this.el.hidden || !this.room || this.room.started) return;
    // 部屋で選んだマイデッキの名前は、このタブに覚えてある。名前が変わったら、覚えている名前も直す
    const kept = this.ownSelection();
    const latest = kept && this.savedDecks()[kept.slot];
    if (latest && latest.name !== kept.name) {
      this.customSelection = { ...kept, name: latest.name };
      try { sessionStorage.setItem(ROOM_DECK_KEY, JSON.stringify(this.customSelection)); } catch { /* ストレージなし */ }
    }
    const me = this.room.players.find(player => player.playerId === this.room.you);
    if (me?.costDeck === 'custom' && saved?.list && this.ownSelection()?.slot === saved.slot) {
      void this.useMyDeck(saved.slot);
    } else this.render(this.room, this.passphrase);
  }
  node(tag, text, cls) {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  }
  async act(method, args) {
    if (this.pending) return;
    this.pending = true;
    this.render(this.room, this.passphrase);
    let res;
    try {
      res = await this.onAction(method, args);
      this.notice = res?.ok ? '' : (res?.reason ?? '送信できませんでした');
    } catch { this.notice = '接続を確認して、もう一度ためしてください'; }
    this.pending = false;
    if (!this.el.hidden) this.render(this.room, this.passphrase);
    return res;
  }
  select(parent, label, choices, value, editable, change, slot) {
    const row = this.node(editable ? 'div' : 'label', null, 'room-select');
    row.append(this.node('span', label));
    if (editable) {
      const input = this.node('select');
      for (const choice of choices ?? []) {
        const opt = this.node('option', choice.name);
        opt.value = choice.id;
        opt.disabled = Boolean(choice.locked);
        input.append(opt);
      }
      input.value = value ?? '';
      input.disabled = this.pending;
      input.addEventListener('change', () => change(input.value));
      row.append(input);
      input.dataset.slot = slot ?? label;
      input.setAttribute('aria-label', label);
    } else {
      row.append(this.node('b', choices?.find(c => c.id === value)?.name ?? '—'));
    }
    parent.append(row);
  }
  /** 数を自分で入力する行（部屋主だけ。入力を終えたとき・Enter で送る。範囲外は直して送り直す） */
  numberInput(parent, label, value, range, editable, change, slot) {
    const row = this.node(editable ? 'div' : 'label', null, 'room-select');
    row.append(this.node('span', label));
    if (editable) {
      const input = this.node('input');
      input.type = 'number'; input.inputMode = 'numeric'; input.step = '1';
      if (range) { input.min = range.min; input.max = range.max; }
      input.value = value ?? '';
      input.disabled = this.pending;
      input.dataset.slot = slot ?? label;
      input.addEventListener('change', () => {
        let n = Math.round(Number(input.value));
        if (!Number.isFinite(n)) n = Number(value);
        if (range) n = Math.min(range.max, Math.max(range.min, n));
        input.value = n;
        if (n !== Number(value)) change(n);
      });
      row.append(input);
    } else {
      row.append(this.node('b', value ?? '—'));
    }
    parent.append(row);
  }
  button(parent, text, action, disabled = false, cls = 'small-btn') {
    const btn = this.node('button', text, cls);
    btn.type = 'button'; btn.disabled = disabled || this.pending;
    btn.addEventListener('click', action); parent.append(btn);
    return btn;
  }
  /** ルールを変更する画面（部屋主だけ）。ルールの選択・城のHP */
  rulesDialog(room, choices) {
    const close = () => { this.rulesOpen = false; this.render(this.room, this.passphrase); };
    const back = this.node('div', null, 'room-modal');
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    back.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    const panel = this.node('section', null, 'room-modal-panel');
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', 'ルールを変更');
    panel.append(this.node('h2', 'ルールを変更'));
    for (const [key,label,list] of RULE_ROWS) {
      if (!choices[list]?.length) continue; // ステージを使わないサーバーなど
      this.select(panel, label, choices[list], room.settings[key], true, v => this.act('setRules', [{[key]:v}]), `rule:${key}`);
    }
    this.numberInput(panel, '城のHP', room.settings.castleHp, choices.castleHpRange, true, v => this.act('setRules', [{castleHp:v}]), 'rule:castleHp');
    this.button(panel, '閉じる', close, false, 'plank-btn');
    back.append(panel);
    queueMicrotask(() => panel.querySelector('select, input, button')?.focus({ preventScroll: true }));
    return back;
  }
  render(room, passphrase) {
    this.room = room; this.passphrase = passphrase;
    this.el.hidden = false; this.el.replaceChildren();
    const box = this.node('div', null, 'room-box'); this.el.append(box);
    const host = room.you === room.hostId;
    const choices = room.choices ?? {};
    box.append(this.node('h1', 'みんなの部屋'));
    box.append(this.node('strong', passphrase || room.roomId, 'room-passphrase'));
    const head = this.node('div', null, 'room-heading');
    head.append(this.node('h2', `参加者 ${room.players.length} / ${room.capacity}`));
    const headBtns = this.node('div', null, 'room-heading-btns'); head.append(headBtns);
    if (this.onChat) {
      const chatBtn = this.button(headBtns, '💬 チャット', () => this.onChat()); chatBtn.classList.add('room-chat-btn');
      const unread = this.getUnread?.() ?? 0;
      chatBtn.dataset.unread = unread > 0 ? (unread > 9 ? '9+' : String(unread)) : '';
    }
    this.button(headBtns, '部屋を出る', this.onLeave); box.append(head);
    const seats = this.node('div', null, 'room-seats'); box.append(seats);
    for (const p of room.players) {
      const seat = this.node('article', null, 'room-seat');
      seat.classList.toggle('room-self', p.playerId === room.you);
      seat.dataset.team = room.settings.teams === 'choose' ? (p.team ?? '') : '';
      const title = this.node('h3', p.name);
      // 名前の横に、アイコンとランク（小さいランクのアイコンは名前の横、ランク名はその下）
      const head = this.node('div', null, 'room-seat-head');
      const avatar = this.node('span', null, 'room-avatar'); avatar.setAttribute('aria-hidden', 'true');
      const src = p.profile ? profileArt(p.profile.icon, p.profile.iconImage) : null;
      if (src) { const img = new Image(); img.src = src; img.alt = ''; avatar.append(img); }
      else avatar.textContent = p.cpu ? 'C' : ([...String(p.name ?? '?')][0] ?? '?');
      const meta = this.node('div', null, 'room-seat-meta');
      const line = this.node('div', null, 'room-seat-nameline'); line.append(title);
      if (p.profile?.rank) {
        const emblem = this.node('span', null, 'room-rank-icon'); emblem.innerHTML = rankEmblem(p.profile.rank, 20);
        line.append(emblem);
      }
      const tags = this.node('span', null, 'room-seat-tags');
      if (p.playerId === room.you) tags.append(this.node('small', 'あなた'));
      if (p.playerId === room.hostId) tags.append(this.node('small', '部屋主'));
      if (tags.children.length) line.append(tags);
      meta.append(line);
      if (p.profile?.rank) meta.append(this.node('small', p.profile.rank.divisionLabel ?? p.profile.rank.name, 'room-rank-name'));
      head.append(avatar, meta);
      seat.append(head);
      // 選んだ城の絵を席に出す（城の種類を変えると絵も変わる）
      const pic = this.node('div', null, 'room-seat-pic'); pic.setAttribute('aria-hidden', 'true');
      pic.innerHTML = castleArt(colorOf(p.playerId), 0, p.castle ?? 'standard'); seat.append(pic);
      if (!p.connected) seat.append(this.node('p', '再接続を待っています', 'room-note'));
      const edit = p.playerId === room.you || (host && Boolean(p.cpu));
      const set = (patch) => this.act('setSeat', p.playerId === room.you ? [patch] : [patch, p.playerId]);
      this.select(seat, '城', choices.castles, p.castle, edit, v => set({castle:v}), `${p.playerId}:castle`);
      const acts = this.node('div', null, 'room-seat-actions'); // 席のボタン（デッキ編成・ルール変更・部屋主を譲る・CPUを外す）
      if (room.settings.deckMode === 'cost') {
        // デッキ編成（コスト制）：見本のデッキか、自分で編成したデッキ（自分の席だけ）
        const mine = p.playerId === room.you;
        const saved = mine ? this.savedDecks() : [];
        const selection = mine && p.costDeck === 'custom' ? this.ownSelection() : null;
        const list = [...(choices.costDecks ?? [])];
        for (const deck of saved) {
          if (deck?.valid) list.push({ id: deckChoice(deck.slot), name: deck.name });
        }
        if (p.costDeck === 'custom' && !selection) list.push({ id: 'server-custom', name: 'マイデッキ', locked: true });
        if (selection && !saved[selection.slot]?.valid) {
          list.push({ id: deckChoice(selection.slot), name: selection.name, locked: true });
        }
        const selected = p.costDeck === 'custom' ? (selection ? deckChoice(selection.slot) : 'server-custom') : p.costDeck;
        this.select(seat, 'デッキ', list, selected, edit, v => {
          const slot = deckSlot(v);
          return slot === null ? set({ costDeck: v }) : this.useMyDeck(slot);
        }, `${p.playerId}:costDeck`);
        if (mine) {
          const preview = this.node('div');
          this.previewDeck(preview, selection ?? this.presetDeck(p.costDeck));
          seat.append(preview);
        }
        const invalid = saved.find(deck => deck && !deck.valid);
        if (mine && this.onEditDeck) this.button(acts, invalid ? '保存したデッキを修正' : 'デッキを編成する', () => this.onEditDeck(invalid?.slot));
      } else {
        this.select(seat, 'デッキ', choices.decks, p.deck, edit && room.settings.deckMode === 'own', v => set({deck:v}), `${p.playerId}:deck`);
        if (room.settings.deckMode === 'own' && p.playerId === room.you) {
          const preview = this.node('div');
          this.previewDeck(preview, this.presetDeck(p.deck));
          seat.append(preview);
        }
      }
      if (room.settings.teams === 'choose') this.select(seat, 'チーム', choices.teams, p.team, edit, v => set({team:v}), `${p.playerId}:team`);
      if (host && p.playerId === room.you) this.button(acts, 'ルールを変更', () => { this.rulesOpen = true; this.render(this.room, this.passphrase); });
      if (host && !p.cpu && p.playerId !== room.you && !p.left) this.button(acts, '部屋主を譲る', () => this.act('transferHost', [p.playerId]));
      if (host && p.cpu) this.button(acts, 'CPUを外す', () => this.act('removeCpu', [p.playerId]));
      if (acts.children.length) seat.append(acts);
      seats.append(seat);
    }
    if (host) {
      // CPUを足す（ルールではないので、変更画面とは別に、席の下に置く）
      const add = this.node('div', null, 'room-add-cpu'); box.append(add);
      this.level ??= choices.cpuLevels?.[0]?.id;
      this.select(add, 'CPUの強さ', choices.cpuLevels, this.level, true, v => {this.level=v;}, 'cpuLevel');
      this.button(add, 'CPUを追加', () => this.act('addCpu', [this.level]), room.players.length >= room.capacity);
    }
    // 対戦ルール：部屋主も含めて、ここでは見るだけ。変えるのは部屋主の席の「ルールを変更」から
    const settings = this.node('section', null, 'room-settings'); box.append(settings);
    settings.append(this.node('h2', '対戦ルール'));
    for (const [key,label,list] of RULE_ROWS) {
      if (!choices[list]?.length) continue;
      this.select(settings, label, choices[list], room.settings[key], false);
    }
    this.numberInput(settings, '城のHP', room.settings.castleHp, choices.castleHpRange, false);
    if (!host) this.rulesOpen = false;
    if (this.rulesOpen) box.append(this.rulesDialog(room, choices));
    let reason = '';
    if (room.players.length < room.minPlayers) reason = `開始には${room.minPlayers}人必要です。仲間を招待するかCPUを追加してください。`;
    else if (room.settings.teams === 'choose' && new Set(room.players.map(p => p.team)).size < 2) reason = '2つ以上のチームに分かれてください。';
    else if (room.settings.teams === 'choose' && room.players.some(p => room.players.filter(q => q.team === p.team).length > 7)) reason = '1チームは7人までです。';
    const launch = this.node('section', null, 'room-launch');
    box.insertBefore(launch, seats);
    const description = this.node('p', host ? reason : '部屋主が対戦を始めるのを待っています', 'room-note');
    description.id = 'room-start-reason';
    if (description.textContent) launch.append(description);
    if (host) {
      const start = this.button(launch, '対戦をはじめる', () => this.act('start', []), Boolean(reason), 'plank-btn room-start');
      if (reason) start.setAttribute('aria-describedby', description.id);
    }
    const status = this.node('p', this.pending ? '送信しています…' : this.notice ?? '', 'room-status');
    status.setAttribute('role', 'status'); launch.append(status);
  }
}
