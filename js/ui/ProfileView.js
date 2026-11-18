// プロフィール画面：自分の情報・戦績・最近の対戦・アイコンと公開設定・レベル報酬の受け取り。
// 値はすべてサーバーから受け取って表示する（ここで経験値や勝敗を変えることはできない）。文字は textContent で入れる。
import { account } from './Account.js';

const REASON = { castleDestroyed: '城を落とした', surrender: '降参', roundLimit: '周回の上限', lastStanding: '最後の1人' };
const PRIVACY_LABEL = { stats: '戦績（勝率など）', history: '対戦履歴', decks: '使用デッキ' };
const LEVELS = { public: 'みんなに公開', friends: 'フレンドだけ（準備中）', private: '非公開' };
const ago = (t) => {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return 'たった今'; if (m < 60) return `${m}分前`;
  const h = Math.round(m / 60); if (h < 24) return `${h}時間前`;
  return `${Math.round(h / 24)}日前`;
};

export class ProfileView {
  constructor({ toast = () => {}, onChanged = () => {} } = {}) {
    this.toast = toast; this.onChanged = onChanged;
    const box = this.box = document.createElement('div');
    box.id = 'profile'; box.className = 'screen dim'; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'profile-title');
    box.innerHTML = `<div class="screen-box parchment profile-box">
      <h2 id="profile-title">プロフィール</h2>
      <div class="profile-state" data-part="state" role="status">読み込み中…</div>
      <div data-part="body" hidden>
        <div class="profile-head">
          <span class="profile-avatar" data-part="avatar"></span>
          <div class="profile-who"><strong data-part="name"></strong><small data-part="title"></small>
            <span class="profile-lv"><b data-part="lv"></b><span class="home-xp"><i data-part="xp"></i></span></span>
            <small data-part="xptext"></small></div>
        </div>
        <section class="profile-rewards" data-part="rewards" hidden>
          <h3>レベル報酬</h3><div data-part="rewardList"></div>
        </section>
        <section><h3>戦績</h3>
          <dl class="profile-stats" data-part="stats"></dl>
          <p class="profile-note">ランク：未参加（ランクマッチは準備中）</p>
        </section>
        <section><h3>最近の対戦</h3><ol class="profile-history" data-part="history"></ol></section>
        <section data-part="deckSec" hidden><h3>使用デッキ</h3><p data-part="deck"></p></section>
        <section data-part="settingsSec" hidden>
          <h3>アイコン</h3><div class="profile-icons" data-part="icons" role="radiogroup" aria-label="アイコン"></div>
          <h3>公開する情報</h3><div data-part="privacy"></div>
        </section>
      </div>
      <button type="button" class="plank-btn profile-close">閉じる</button>
    </div>`;
    document.getElementById('app').append(box);
    this.part = (n) => box.querySelector(`[data-part="${n}"]`);
    box.querySelector('.profile-close').addEventListener('click', () => this.close());
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
    box.addEventListener('click', (e) => { if (e.target === box) this.close(); });
  }

  async open(userId = null) {
    this.box.hidden = false;
    this.part('state').hidden = false; this.part('state').textContent = '読み込み中…';
    this.part('body').hidden = true;
    this.box.querySelector('.profile-close').focus({ preventScroll: true });
    try {
      const [p, h, home] = await Promise.all([
        account.api('GET', userId ? `/api/profile/user/${userId}` : '/api/profile/me'),
        userId ? null : account.api('GET', '/api/home'),
        userId ? null : account.api('GET', '/api/level-rewards'),
      ]);
      if (!p.json?.ok) throw new Error('profile');
      this.render(p.json.profile, h?.json, home?.json);
    } catch {
      this.part('state').textContent = 'プロフィールを読み込めませんでした。つながってから、もう一度開いてください';
    }
  }

  close() { this.box.hidden = true; }

  render(pf, homeJson, rewardsJson) {
    const p = this.part;
    p('state').hidden = true; p('body').hidden = false;
    p('name').textContent = pf.displayName;
    p('title').textContent = pf.title;
    p('lv').textContent = `Lv.${pf.level}`;
    const icon = (homeJson?.icons ?? this.icons ?? []).find((i) => i.id === pf.icon);
    if (homeJson?.icons) this.icons = homeJson.icons;
    const av = p('avatar'); av.replaceChildren();
    if (icon) { const img = new Image(); img.src = icon.image; img.alt = ''; av.append(img); }
    const lv = homeJson?.level;
    p('xp').style.width = lv ? `${lv.maxed ? 100 : Math.round((lv.xpIntoLevel / Math.max(1, lv.xpForNext)) * 100)}%` : '0%';
    p('xptext').textContent = lv ? (lv.maxed ? '最大レベル' : `次のレベルまで ${lv.xpForNext - lv.xpIntoLevel} 経験値`) : '';
    // レベル報酬
    const rw = rewardsJson?.rewards ?? [];
    p('rewards').hidden = rw.length === 0;
    const list = p('rewardList'); list.replaceChildren();
    for (const r of rw) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'plank-btn profile-reward';
      b.textContent = `Lv.${r.level} の報酬を受け取る（コイン ${r.coins}）`;
      b.addEventListener('click', async () => {
        b.disabled = true;
        const res = await account.api('POST', '/api/level-rewards/claim', { level: r.level });
        if (res.json?.ok) { this.toast(`コイン ${res.json.coins} を受け取りました`, 'info'); this.onChanged(); this.open(); } else { this.toast(res.json?.reason ?? '受け取れませんでした'); b.disabled = false; }
      });
      list.append(b);
    }
    // 戦績
    const st = p('stats'); st.replaceChildren();
    if (pf.stats) {
      for (const [k, v] of [['対戦数', pf.stats.matches], ['勝利', pf.stats.wins], ['敗北', pf.stats.losses], ['勝率', pf.stats.winRate == null ? '—' : `${pf.stats.winRate}%`]]) {
        const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = String(v); st.append(dt, dd);
      }
    } else { const dd = document.createElement('dd'); dd.textContent = '非公開です'; st.append(dd); }
    // 履歴
    const hist = p('history'); hist.replaceChildren();
    if (pf.history == null) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = '非公開です'; hist.append(li); }
    else if (!pf.history.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'まだ対戦がありません。オンラインで遊ぶと、ここに残ります'; hist.append(li); }
    for (const m of pf.history ?? []) {
      const li = document.createElement('li'); li.className = m.result;
      const badge = document.createElement('b'); badge.textContent = m.result === 'win' ? '勝' : '負';
      const text = document.createElement('span');
      text.textContent = `${m.opponents.map((o) => o.name).join('・') || '—'}　${REASON[m.reason] ?? ''}・${m.turns}手番`;
      const when = document.createElement('small'); when.textContent = `${ago(m.endedAt)}${m.xpGained ? `　+${m.xpGained} EXP` : ''}`;
      li.append(badge, text, when); hist.append(li);
    }
    p('deckSec').hidden = !pf.deck;
    if (pf.deck) p('deck').textContent = `${pf.deck.name}（${Object.values(pf.deck.list).reduce((a, b) => a + b, 0)}枚）`;
    // 設定（自分だけ）
    p('settingsSec').hidden = !pf.self;
    if (pf.self) this.renderSettings(pf);
  }

  renderSettings(pf) {
    const icons = this.part('icons'); icons.replaceChildren();
    for (const i of this.icons ?? []) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'profile-icon raw-btn'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(i.id === pf.icon)); b.setAttribute('aria-label', i.name);
      const img = new Image(); img.src = i.image; img.alt = ''; b.append(img);
      b.addEventListener('click', () => this.save({ icon: i.id }));
      icons.append(b);
    }
    const pr = this.part('privacy'); pr.replaceChildren();
    for (const [key, label] of Object.entries(PRIVACY_LABEL)) {
      const row = document.createElement('label'); row.className = 'profile-privacy';
      const span = document.createElement('span'); span.textContent = label;
      const sel = document.createElement('select');
      for (const [v, t] of Object.entries(LEVELS)) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.append(o); }
      sel.value = pf.privacy[key];
      sel.addEventListener('change', () => this.save({ privacy: { [key]: sel.value } }));
      row.append(span, sel); pr.append(row);
    }
  }

  async save(change) {
    const r = await account.api('POST', '/api/profile/settings', change);
    if (!r.json?.ok) return this.toast(r.json?.reason ?? '保存できませんでした');
    this.onChanged();
    this.open();
  }
}
