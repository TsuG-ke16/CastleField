// ミッションとシーズン報酬の画面。進み具合・達成はサーバーの値を表示するだけ（ここから達成を申告することはできない）。
import { account } from './Account.js';
import { rankEmblem } from './RankEmblem.js';
import { itemPreview } from './Cosmetics.js';

const KINDS = [['daily', 'デイリー'], ['weekly', 'ウィークリー'], ['season', 'シーズン'], ['rewards', 'シーズン報酬']];
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const remain = (t) => {
  const ms = Math.max(0, t - Date.now()); const h = Math.floor(ms / 3600000);
  return h >= 48 ? `あと${Math.floor(h / 24)}日` : h >= 1 ? `あと${h}時間` : `あと${Math.max(1, Math.floor(ms / 60000))}分`;
};

export class MissionView {
  constructor({ toast = () => {}, onChanged = () => {} } = {}) {
    Object.assign(this, { toast, onChanged });
    this.tab = 'daily';
    const box = this.box = document.createElement('div');
    box.id = 'missions'; box.className = 'screen dim'; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'missions-title');
    box.innerHTML = `<div class="screen-box parchment collection-box">
      <header class="collection-head"><h2 id="missions-title">ミッション</h2></header>
      <div class="social-tabs mission-tabs" role="tablist" data-part="tabs"></div>
      <div class="collection-body" data-part="body"></div>
      <p class="collection-msg" data-part="msg" role="status"></p>
      <button type="button" class="plank-btn collection-close">閉じる</button></div>`;
    document.getElementById('app').append(box);
    this.part = (n) => box.querySelector(`[data-part="${n}"]`);
    box.querySelector('.collection-close').addEventListener('click', () => this.close());
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
    box.addEventListener('click', (e) => this.onClick(e));
  }

  async open(tab = 'daily') {
    this.tab = tab; this.say('');
    this.box.hidden = false;
    this.box.querySelector('.collection-close').focus({ preventScroll: true });
    this.part('body').replaceChildren(el('p', 'collection-empty', '読み込み中…'));
    await this.load();
  }
  close() { this.box.hidden = true; clearTimeout(this.receiptTimer); this.part('msg').classList.remove('mission-received'); }
  say(t, bad = false) { const m = this.part('msg'); m.textContent = t; m.classList.toggle('bad', bad); }

  async load() {
    try {
      const [m, s] = await Promise.all([account.api('GET', '/api/missions'), account.api('GET', '/api/season/rewards')]);
      if (!m.json?.ok) throw new Error('missions');
      this.data = m.json.periods; this.rewards = s.json?.ok ? s.json : { rewards: [] };
      this.render();
    } catch {
      this.part('body').replaceChildren(el('p', 'collection-empty', '読み込めませんでした。つながってから、もう一度開いてください'));
    }
  }

  render() {
    const tabs = this.part('tabs'); tabs.replaceChildren();
    for (const [id, label] of KINDS) {
      const t = el('button', 'social-tab raw-btn', label); t.type = 'button'; t.dataset.tab = id; t.setAttribute('role', 'tab'); t.setAttribute('aria-selected', String(this.tab === id));
      const n = id === 'rewards' ? this.rewards.rewards.filter((r) => r.eligible && !r.claimed && r.items?.length).length : this.data[id].missions.filter((m) => m.completed && !m.claimed).length;
      if (n) t.append(Object.assign(el('i'), { textContent: String(n) }));
      tabs.append(t);
    }
    const body = this.part('body'); body.replaceChildren();
    if (this.tab === 'rewards') return this.renderRewards(body);
    const p = this.data[this.tab];
    body.append(el('p', 'mission-reset', `更新まで ${remain(p.resetsAt)}`));
    const list = el('ul', 'mission-list');
    for (const m of p.missions) {
      const li = el('li', `mission-row${m.completed ? ' done' : ''}`);
      li.append(el('strong', 'mission-name', m.name));
      const bar = el('span', 'mission-bar'); const fill = el('i'); fill.style.width = `${Math.round((m.progress / m.target) * 100)}%`; bar.append(fill); bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', m.name); bar.setAttribute('aria-valuenow', String(m.progress)); bar.setAttribute('aria-valuemax', String(m.target));
      const count = el('small', null, `${m.progress}/${m.target}`);
      const reward = el('span', 'mission-reward', `🪙 ${m.coins}`);
      const act = el('button', 'small-btn mission-claim', m.claimed ? '受け取り済み' : m.completed ? '受け取る' : '未達成');
      act.type = 'button'; act.disabled = !m.completed || m.claimed; act.dataset.act = 'claim'; act.dataset.id = m.id;
      li.append(bar, count, reward, act); list.append(li);
    }
    body.append(list, el('p', 'collection-note', 'ミッションは、オンライン対戦（サーバーが確かめた試合）で進みます。ひとりで遊ぶ・同じ端末では進みません。'));
  }

  renderRewards(body) {
    const rw = this.rewards.rewards;
    if (!rw.length) body.append(el('p', 'collection-empty', 'まだ終わったシーズンがありません。ランクマッチで認定戦を終えて遊ぶと、シーズンが終わったあとに報酬を受け取れます'));
    const list = el('ul', 'mission-list');
    for (const r of rw) {
      const li = el('li', 'mission-row season');
      const em = el('span', 'ranking-emblem'); em.innerHTML = r.peak ? rankEmblem(r.peak, 36) : rankEmblem(null, 36);
      li.append(em, el('strong', 'mission-name', `シーズン${r.season}　${r.peak ? `最高 ${r.peak.divisionLabel}` : '対象外'}`));
      li.append(el('small', null, r.eligible ? '' : `ランク戦を${r.minMatches}試合以上＋認定戦の終了が必要（${r.matches}試合）`));
      if (r.eligible && r.items?.length) { const rw = el('span', 'mission-reward'); for (const it of r.items) rw.append(itemPreview(it)); rw.title = r.items.map((it) => it.name).join('・'); li.append(rw); }
      const act = el('button', 'small-btn mission-claim', r.claimed ? '受け取り済み' : '受け取る');
      act.type = 'button'; act.disabled = !r.eligible || r.claimed || !r.items?.length; act.dataset.act = 'season'; act.dataset.id = String(r.season);
      li.append(act); list.append(li);
    }
    body.append(list);
  }

  async onClick(e) {
    const tab = e.target.closest('.social-tab[data-tab]');
    if (tab) { this.tab = tab.dataset.tab; this.say(''); if (this.data) this.render(); return; }
    const b = e.target.closest('[data-act]');
    if (!b) { if (e.target === this.box) this.close(); return; }
    b.disabled = true;
    const path = b.dataset.act === 'claim' ? '/api/missions/claim' : '/api/season/claim';
    const body = b.dataset.act === 'claim' ? { missionId: b.dataset.id } : { season: Number(b.dataset.id) };
    const r = await account.api('POST', path, body).catch(() => ({}));
    if (!r.json?.ok) {
      this.say(r.json?.reason ?? 'サーバーにつながりません', true);
      b.disabled = false;
      return;
    }
    if (!this.box.hidden) {
      const balance = Number.isFinite(r.json.balance) ? `（残高 ${r.json.balance}）` : '';
      this.say(r.json.items ? `${r.json.items.length}個の報酬（アイコンフレーム・カード裏面）を受け取りました。所持品から装備できます` : `+${r.json.coins} コインを受け取りました${balance}`);
      const receipt = this.part('msg');
      receipt.classList.remove('mission-received');
      requestAnimationFrame(() => { if (!this.box.hidden) receipt.classList.add('mission-received'); });
      clearTimeout(this.receiptTimer);
      this.receiptTimer = setTimeout(() => receipt.classList.remove('mission-received'), 1600);
      await this.load();
    }
    this.onChanged();
  }
}
