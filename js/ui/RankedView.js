// ランクマッチの画面：ランクと認定戦の進み具合、相手探し（待機・取り消し・成立・タイムアウトの案内）、シーズンの記録。
// ランクや勝敗はサーバーの値を表示するだけ。相手が見つかったら、サーバーが作った部屋に入る（onMatched）。
import { account } from './Account.js';
import { rankEmblem } from './RankEmblem.js';

const POLL_MS = 2000;
const pad = (n) => String(n).padStart(2, '0');
const daysLeft = (endsAt) => Math.max(0, Math.ceil((endsAt - Date.now()) / 86400000));

export class RankedView {
  constructor({ toast = () => {}, onMatched = () => {}, onNeedMember = () => {} } = {}) {
    Object.assign(this, { toast, onMatched, onNeedMember });
    this.state = 'idle';
    this.pending = false;
    const box = this.box = document.createElement('div');
    box.id = 'ranked'; box.className = 'screen dim'; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'ranked-title');
    box.innerHTML = `<div class="screen-box parchment ranked-box">
      <h2 id="ranked-title">ランクマッチ</h2>
      <div class="ranked-hero">
        <span class="ranked-emblem" data-part="emblem"></span>
        <div class="ranked-rank"><strong data-part="rankName">—</strong><small data-part="rankSub"></small>
          <span class="ranked-rp" role="progressbar" aria-label="次のランクまで"><i data-part="rpFill"></i></span>
          <small data-part="rpText"></small></div>
      </div>
      <div class="ranked-pips" data-part="pips" aria-live="polite"></div>
      <p class="ranked-season" data-part="season"></p>
      <div class="ranked-action" data-part="action"></div>
      <p class="ranked-msg" data-part="msg" role="status"></p>
      <ul class="ranked-rules">
        <li>1対1。勝つとランクポイントが増え、負けると減ります</li>
        <li>切断・途中で抜ける・長く手を打たないのは負けになります</li>
        <li>CPU・ゲスト・カジュアル対戦ではランクは変わりません</li>
      </ul>
      <section data-part="historySec" hidden><h3>シーズンの記録</h3><ol class="ranked-history" data-part="history"></ol></section>
      <button type="button" class="plank-btn ranked-close">閉じる</button>
    </div>`;
    document.getElementById('app').append(box);
    this.part = (n) => box.querySelector(`[data-part="${n}"]`);
    box.querySelector('.ranked-close').addEventListener('click', () => this.close());
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.state !== 'queued') this.close(); });
    box.addEventListener('click', (e) => { if (e.target === box && this.state !== 'queued') this.close(); });
  }

  async open() {
    this.box.hidden = false;
    this.say('');
    this.box.querySelector('.ranked-close').focus({ preventScroll: true });
    await this.refresh();
    if (!this.box.hidden) this.startPolling();
  }

  close() { this.box.hidden = true; this.stopPolling(); clearTimeout(this.matchTimer); }
  say(text, bad = false) { const m = this.part('msg'); m.textContent = text; m.classList.toggle('bad', bad); }
  startPolling() { this.stopPolling(); this.poll = setInterval(() => this.pollStatus(), POLL_MS); this.tickTimer = setInterval(() => this.renderTimer(), 500); }
  stopPolling() { clearInterval(this.poll); clearInterval(this.tickTimer); }

  async refresh() {
    try {
      const [s, st] = await Promise.all([account.api('GET', '/api/ranked/summary'), account.api('GET', '/api/ranked/status')]);
      if (!s.json?.ok) throw new Error('summary');
      this.data = s.json;
      this.apply(st.json ?? { state: 'idle' });
      this.render();
    } catch {
      this.say('サーバーにつながっていません。つながってから、もう一度開いてください', true);
      this.part('action').replaceChildren();
    }
  }

  async pollStatus() {
    if (this.box.hidden) return;
    if (this.pending) return;
    const previous = this.state;
    const operation = this.queueOperation;
    try {
      const r = await account.api('GET', '/api/ranked/status');
      if (!this.box.hidden && !this.pending && operation === this.queueOperation && r.json?.ok) {
        this.apply(r.json);
        if (previous !== this.state) this.renderAction();
      }
    } catch { /* 次の回に */ }
  }

  apply(st) {
    const prev = this.state;
    this.state = st.state;
    this.st = st;
    this.box.dataset.state = this.state;
    if (st.state === 'queued') this.queuedAt = Date.now() - st.waitedMs;
    if (st.state === 'matched' && prev !== 'matched') {
      this.say('対戦相手が見つかりました！');
      this.matchTimer = setTimeout(() => this.enter(), 1000);
    }
    if (st.state === 'timeout') this.say('対戦相手が見つかりませんでした。時間をおいて、もう一度探してください（人が少ない時間帯かもしれません）', true);
  }

  enter() {
    if (this.state !== 'matched' || this.box.hidden) return;
    const st = this.st;
    this.state = 'idle';
    this.close();
    this.onMatched({ token: st.token, playerId: st.playerId });
  }

  render() {
    const d = this.data;
    const sum = d.summary;
    const rank = sum?.rank ?? null;
    this.part('emblem').innerHTML = rankEmblem(rank, 84);
    this.part('rankName').textContent = !d.member ? 'ゲスト' : rank ? rank.divisionLabel : '認定戦中';
    this.part('rankSub').textContent = rank ? (rank.position ? `順位 ${rank.position}位` : '') : d.member ? `認定戦 ${sum.placementTotal - sum.placementLeft}/${sum.placementTotal}` : '';
    const fill = this.part('rpFill');
    const rpProgress = rank?.rpForNext ? Math.round(rank.rpIntoDivision / rank.rpForNext * 100) : rank ? 100 : 0;
    fill.style.width = `${rpProgress}%`;
    fill.parentElement.setAttribute('aria-valuenow', String(rpProgress));
    this.part('rpText').textContent = rank ? (rank.rpForNext ? `RP ${rank.rpIntoDivision}/${rank.rpForNext}（次のランクまで）` : `RP ${rank.rp}`) : '';
    const pips = this.part('pips'); pips.replaceChildren();
    if (d.member && sum && !sum.placed) {
      const label = document.createElement('span'); label.textContent = '認定戦：';
      pips.append(label);
      for (let i = 0; i < sum.placementTotal; i++) { const p = document.createElement('i'); p.className = i < sum.placementTotal - sum.placementLeft ? 'done' : ''; pips.append(p); }
      const note = document.createElement('small'); note.textContent = `あと${sum.placementLeft}試合でランクが決まります`; pips.append(note);
    }
    this.part('season').textContent = `シーズン ${d.season.id}　あと${daysLeft(d.season.endsAt)}日${d.best ? `　最高：${d.best.divisionLabel}` : ''}`;
    const hist = this.part('history'); hist.replaceChildren();
    const past = (d.history ?? []).filter((h) => h.season !== d.season.id && h.peak);
    this.part('historySec').hidden = past.length === 0;
    for (const h of past) {
      const li = document.createElement('li');
      li.textContent = `シーズン${h.season}：最高 ${h.peak.divisionLabel}（${h.wins}勝 ${h.matches - h.wins}敗）`;
      hist.append(li);
    }
    this.renderAction();
  }

  renderAction() {
    const box = this.part('action'); box.replaceChildren();
    const mk = (text, cls, fn, disabled = false) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text; b.disabled = disabled; b.addEventListener('click', fn); box.append(b); return b; };
    if (!this.data) return;
    if (!this.data.member) {
      const p = document.createElement('p'); p.className = 'ranked-note';
      p.textContent = 'ランクマッチは、アカウントを作成すると遊べます。ゲストのままでは遊べません。';
      box.append(p);
      mk('アカウントを作成する', 'plank-btn', () => { this.close(); this.onNeedMember(); });
      return;
    }
    if (this.state === 'queued') {
      const t = document.createElement('p'); t.className = 'ranked-wait'; t.setAttribute('data-part', 'timer');
      box.append(t); this.renderTimer();
      mk('探すのをやめる', 'small-btn', () => this.leaveQueue());
    } else if (this.state === 'matched') {
      const p = document.createElement('p'); p.className = 'ranked-matched'; p.textContent = '対戦成立'; box.append(p);
      mk('試合に入る', 'plank-btn', () => this.enter());
    } else {
      mk('対戦相手を探す', 'plank-btn big ranked-find', () => this.findMatch());
    }
  }

  renderTimer() {
    const t = this.part('action').querySelector('[data-part=timer]');
    if (!t || this.state !== 'queued') return;
    const s = Math.floor((Date.now() - this.queuedAt) / 1000);
    t.textContent = `対戦相手を探しています… ${pad(Math.floor(s / 60))}:${pad(s % 60)}${s > 20 ? '（待つほど、探す実力の範囲が広がります）' : ''}`;
  }

  async findMatch() {
    await this.requestQueue('/api/ranked/queue', '探せませんでした');
  }

  async leaveQueue() {
    await this.requestQueue('/api/ranked/leave', 'やめられませんでした', '探すのをやめました');
  }

  async requestQueue(path, failure, success = '') {
    if (this.pending) return;
    this.pending = true;
    this.queueOperation = Symbol();
    this.say('通信しています…');
    const button = this.part('action').querySelector('button');
    if (button) button.disabled = true;
    try {
      const { json } = await account.api('POST', path, {});
      if (json?.state) this.apply(json);
      if (!json?.ok) this.say(json?.reason ?? failure, true);
      else if (this.state !== 'matched') this.say(success);
    } catch {
      this.say(`${failure}。接続を確認して、もう一度お試しください。`, true);
    } finally {
      this.pending = false;
      this.renderAction();
    }
  }
}

/** ランキング（上位の一覧と、自分のランク） */
export class RankingView {
  constructor() {
    const box = this.box = document.createElement('div');
    box.id = 'ranking'; box.className = 'screen dim'; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'ranking-title');
    box.innerHTML = `<div class="screen-box parchment ranking-box"><h2 id="ranking-title">ランキング</h2>
      <p class="ranking-season" data-part="season"></p><p class="ranking-me" data-part="me"></p>
      <ol class="ranking-list" data-part="list"></ol><p class="ranking-empty" data-part="empty" hidden>まだ認定戦を終えた人がいません。ランクマッチで遊ぶと、ここに載ります</p>
      <button type="button" class="plank-btn ranked-close">閉じる</button></div>`;
    document.getElementById('app').append(box);
    this.part = (n) => box.querySelector(`[data-part="${n}"]`);
    box.querySelector('.ranked-close').addEventListener('click', () => { box.hidden = true; });
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') box.hidden = true; });
    box.addEventListener('click', (e) => { if (e.target === box) box.hidden = true; });
  }

  async open() {
    this.box.hidden = false;
    this.box.querySelector('.ranked-close').focus({ preventScroll: true });
    const list = this.part('list'); list.replaceChildren();
    this.part('empty').hidden = true;
    let r;
    try { r = (await account.api('GET', '/api/ranking?limit=50')).json; } catch { r = null; }
    if (!r?.ok) { this.part('season').textContent = '読み込めませんでした。つながってから、もう一度開いてください'; return; }
    this.part('season').textContent = `シーズン ${r.season.id}　あと${daysLeft(r.season.endsAt)}日`;
    this.part('me').textContent = r.me ? (r.me.rank ? `あなた：${r.me.rank.divisionLabel}（${r.me.position}位）` : `あなた：認定戦中（あと${r.me.placementLeft}試合）`) : 'ランキングに載るには、アカウントを作成してランクマッチで遊びます';
    this.part('empty').hidden = r.board.length > 0;
    for (const e of r.board) {
      const li = document.createElement('li');
      const pos = document.createElement('b'); pos.textContent = String(e.position);
      const em = document.createElement('span'); em.className = 'ranking-emblem'; em.innerHTML = rankEmblem(e.rank, 28);
      const name = document.createElement('span'); name.className = 'ranking-name'; name.textContent = e.name;
      const rp = document.createElement('small'); rp.textContent = `${e.rank.divisionLabel}・${e.rp}RP`;
      li.append(pos, em, name, rp);
      list.append(li);
    }
  }
}
