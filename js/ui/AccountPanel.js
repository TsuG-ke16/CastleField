// アカウントの画面（タイトルの「アカウント」から開く）。表示名などは textContent で入れる（HTML として扱わない）。
import { account, readAuthResult } from './Account.js';

const SYNC_TEXT = {
  idle: '', syncing: 'デッキを保存しています…', saved: 'デッキはクラウドに保存されています',
  offline: 'つながっていません。デッキはこの端末に保存済みで、つながったら送ります',
  conflict: 'ほかの端末でデッキが変わっていたため、そちらを使いました（この端末のデッキは念のためとってあります）',
};

export class AccountPanel {
  constructor({ toast = () => {} } = {}) {
    this.toast = toast;
    this.confirmingDelete = false;
    this.conflictId = null;
    const box = this.box = document.createElement('div');
    box.id = 'account'; box.className = 'screen dim'; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'account-title');
    box.innerHTML = `<div class="screen-box parchment account-box">
      <h2 id="account-title">アカウント</h2>
      <div class="account-card" data-part="card">
        <span class="account-avatar" data-part="avatar" aria-hidden="true"></span>
        <div class="account-who"><strong data-part="name"></strong><small data-part="kind"></small></div>
      </div>
      <p class="account-sync" data-part="sync" role="status"></p>
      <section class="account-section" data-part="link">
        <h3 data-part="linkTitle"></h3>
        <p class="account-note" data-part="linkNote"></p>
        <div class="account-oauth">
          <button type="button" class="plank-btn account-provider" data-provider="google">Googleで連携</button>
          <button type="button" class="plank-btn alt account-provider" data-provider="apple">Appleで連携</button>
        </div>
      </section>
      <section class="account-section account-conflict" data-part="conflict" hidden>
        <h3>すでに使っているアカウントです</h3>
        <p class="account-note">このGoogle/Appleアカウントには、すでにデータがあります。そちらに切りかえますか？この端末のデッキは、空いている枠に移します（もとのデータは消えません）。</p>
        <button type="button" class="plank-btn" data-act="switch">切りかえる</button>
        <button type="button" class="small-btn" data-act="cancel">やめる</button>
      </section>
      <section class="account-section" data-part="rename">
        <label>表示名<input data-part="nameInput" maxlength="16" autocomplete="nickname" placeholder="なまえ"></label>
        <button type="button" class="small-btn" data-act="rename">名前を変える</button>
      </section>
      <p class="account-msg" data-part="msg" role="status"></p>
      <div class="account-danger">
        <button type="button" class="small-btn" data-act="logout">ログアウト</button>
        <button type="button" class="small-btn danger" data-act="delete">アカウントを削除</button>
      </div>
      <button type="button" class="plank-btn account-close" data-act="close">閉じる</button>
    </div>`;
    document.getElementById('app').append(box);
    const part = this.part = (n) => box.querySelector(`[data-part="${n}"]`);
    box.addEventListener('click', (e) => this.onClick(e));
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
    account.onChange(() => { if (!box.hidden) this.render(); });
  }

  /** 起動時に、連携の戻り先を処理する */
  handleReturn() {
    const r = readAuthResult();
    if (!r) return;
    if (r.kind === 'conflict' && r.conflictId) { this.conflictId = r.conflictId; this.open(); return; }
    if (r.kind === 'error') { this.open(); this.say(r.message, true); return; }
    this.toast(r.kind === 'linked' ? 'アカウントを連携しました。データは引き継がれます' : 'ログインしました');
    account.init();
  }

  open() { this.render(); this.box.hidden = false; this.part('card').focus?.(); this.box.querySelector('[data-act="close"]').focus({ preventScroll: true }); }
  close() { this.box.hidden = true; this.confirmingDelete = false; this.say(''); }
  say(text, bad = false) { const m = this.part('msg'); m.textContent = text; m.classList.toggle('bad', bad); }

  render() {
    const p = this.part;
    const on = account.enabled && account.user;
    for (const n of ['card', 'sync', 'link', 'rename']) p(n).hidden = !on;
    this.box.querySelector('.account-danger').hidden = !on;
    p('conflict').hidden = !this.conflictId;
    if (!on) {
      this.say(account.enabled ? 'サーバーにつながっていません。つながると自動でゲストとして始まります' : 'この環境ではアカウント機能は使えません。オンライン対戦のサーバー（node server/server.js）で開くと使えます');
      return;
    }
    const u = account.user;
    const member = u.kind === 'member';
    p('name').textContent = u.displayName;
    p('kind').textContent = member ? `連携済み：${u.providers.map((x) => (x === 'google' ? 'Google' : 'Apple')).join('・')}` : 'ゲスト（まだ連携していません）';
    p('avatar').textContent = [...u.displayName][0] ?? '?';
    p('sync').textContent = SYNC_TEXT[account.sync] ?? '';
    p('linkTitle').textContent = member ? '連携を追加' : 'データを引き継げるようにする';
    p('linkNote').textContent = member
      ? '別の端末では、同じアカウントでログインするとデッキを引き継げます。'
      : 'GoogleかAppleに連携すると、いまのデッキを持ったまま、別の端末でも遊べます。連携しないと、ブラウザのデータを消したときに戻れません。';
    for (const b of this.box.querySelectorAll('.account-provider')) {
      const prov = b.dataset.provider;
      const name = prov === 'google' ? 'Google' : 'Apple';
      const ready = account.providers[prov] && account.oauthReady;
      b.disabled = !ready || u.providers.includes(prov);
      b.textContent = u.providers.includes(prov) ? `${name}：連携済み` : ready ? `${name}で${member ? '連携' : '連携・ログイン'}` : `${name}（このサーバーでは未設定）`;
    }
    p('nameInput').value = u.displayName;
    const del = this.box.querySelector('[data-act="delete"]');
    del.textContent = this.confirmingDelete ? 'もう一度押すと削除' : 'アカウント削除';
    this.box.querySelector('[data-act="logout"]').textContent = 'ログアウト';
  }

  async onClick(e) {
    const prov = e.target.closest('.account-provider');
    if (prov && !prov.disabled) {
      this.say('認証の画面へ移動します…');
      const r = await account.startOAuth(prov.dataset.provider);
      if (!r.ok) this.say(r.reason, true);
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) { if (e.target === this.box) this.close(); return; }
    if (act === 'close') return this.close();
    if (act === 'rename') {
      const r = await account.rename(this.part('nameInput').value);
      this.say(r.ok ? '名前を変えました' : r.reason, !r.ok);
      return this.render();
    }
    if (act === 'switch' || act === 'cancel') {
      const r = await account.resolveConflict(this.conflictId, act);
      this.conflictId = null;
      if (!r.ok) { this.say(r.reason, true); return this.render(); }
      if (act === 'switch') { this.toast('アカウントを切りかえました'); await account.init(); }
      return this.render();
    }
    if (act === 'logout') {
      const guest = account.user?.kind === 'guest';
      if (guest && !this.confirmLogout) { this.confirmLogout = true; this.say('ゲストのままログアウトすると、このデータには戻れません。もう一度押すとログアウトします', true); return; }
      const r = await account.logout(guest);
      this.confirmLogout = false;
      if (!r.ok) return this.say(r.reason, true);
      this.close(); this.toast('ログアウトしました'); await account.init();
      return;
    }
    if (act === 'delete') {
      if (!this.confirmingDelete) { this.confirmingDelete = true; this.say('アカウントとデッキなどのデータを、サーバーから完全に削除します。元に戻せません', true); return this.render(); }
      const r = await account.deleteAccount();
      this.confirmingDelete = false;
      if (!r.ok) { this.say(r.reason, true); return this.render(); }
      this.close(); this.toast('アカウントを削除しました'); await account.init();
    }
  }
}
