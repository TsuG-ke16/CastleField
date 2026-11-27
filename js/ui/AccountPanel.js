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
      <section class="account-section account-email" data-part="link">
        <h3 data-part="linkTitle"></h3>
        <p class="account-note" data-part="linkNote"></p>
        <form data-part="emailForm" novalidate>
          <label>メールアドレス<input type="email" data-part="emailInput" maxlength="254" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false"></label>
          <label>パスワード（8文字以上）<input type="password" data-part="passInput" maxlength="128" autocomplete="current-password"></label>
          <p class="account-note small">確認メールは送りません。<strong>パスワードを忘れると、戻すことはできません。</strong>メモしておいてください。</p>
          <div class="account-email-actions">
            <button type="button" class="plank-btn" data-act="emailRegister">アカウントを作成</button>
            <button type="button" class="small-btn" data-act="emailLogin">ログイン（アカウントを作成済みの人）</button>
          </div>
        </form>
        <div class="account-oauth" data-part="oauth">
          <p class="account-or" data-part="or">または</p>
          <button type="button" class="plank-btn alt account-provider" data-provider="google">Googleで作成・ログイン</button>
        </div>
      </section>
      <section class="account-section account-email" data-part="passSection" hidden>
        <h3>パスワードの変更</h3>
        <form data-part="passForm" novalidate>
          <label>今のパスワード<input type="password" data-part="curPass" maxlength="128" autocomplete="current-password"></label>
          <label>新しいパスワード（8文字以上）<input type="password" data-part="newPass" maxlength="128" autocomplete="new-password"></label>
          <button type="button" class="small-btn" data-act="changePass">パスワードを変える</button>
        </form>
      </section>
      <section class="account-section account-conflict" data-part="conflict" hidden>
        <h3>すでに作成済みのアカウントです</h3>
        <p class="account-note">このアカウントには、すでにデータがあります。そちらに切りかえますか？この端末のデッキは、空いている枠に移します（もとのデータは消えません）。</p>
        <button type="button" class="plank-btn" data-act="switch">切りかえる</button>
        <button type="button" class="small-btn" data-act="cancel">やめる</button>
      </section>
      <p class="account-msg" data-part="msg" role="status"></p>
      <div class="account-danger">
        <button type="button" class="small-btn" data-act="export">データを書き出す</button>
        <button type="button" class="small-btn" data-act="logout">ログアウト</button>
        <button type="button" class="small-btn danger" data-act="delete">アカウントを削除</button>
      </div>
      <button type="button" class="plank-btn account-close" data-act="close">閉じる</button>
    </div>`;
    document.getElementById('app').append(box);
    const part = this.part = (n) => box.querySelector(`[data-part="${n}"]`);
    box.addEventListener('click', (e) => this.onClick(e));
    box.addEventListener('submit', (e) => e.preventDefault()); // Enter でページが読み直されないように（ボタンで選んでもらう）
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
    account.onChange(() => { if (!box.hidden) this.render(); });
  }

  /** 起動時に、Google の認証の戻り先を処理する */
  handleReturn() {
    const r = readAuthResult();
    if (!r) return;
    if (r.kind === 'conflict' && r.conflictId) { this.conflictId = r.conflictId; this.open(); return; }
    if (r.kind === 'error') { this.open(); this.say(r.message, true); return; }
    this.toast(r.kind === 'linked' ? 'Googleでログインできるようになりました。データは引き継がれます' : r.kind === 'created' ? 'アカウントを作成しました' : 'ログインしました');
    account.init();
  }

  open() { this.opener=document.activeElement; this.render(); this.box.hidden = false; this.part('card').focus?.(); this.box.querySelector('[data-act="close"]').focus({ preventScroll: true }); }
  close() { this.box.hidden = true; this.confirmingDelete = false; this.say(''); this.opener?.focus({preventScroll:true}); }
  say(text, bad = false) { const m = this.part('msg'); m.textContent = text; m.classList.toggle('bad', bad); }

  render() {
    const p = this.part;
    const on = account.enabled && account.user;
    for (const n of ['card', 'sync', 'link']) p(n).hidden = !on;
    p('passSection').hidden = true;
    this.box.querySelector('.account-danger').hidden = !on;
    p('conflict').hidden = !this.conflictId;
    if (!on) {
      this.say(account.enabled ? 'サーバーにつながっていません。つながると自動でゲストとして始まります' : 'この環境ではアカウント機能は使えません。オンライン対戦のサーバー（node server/server.js）で開くと使えます');
      return;
    }
    const u = account.user;
    const member = u.kind === 'member';
    p('name').textContent = u.displayName;
    const methods = u.providers.map((x) => (x === 'google' ? 'Google' : 'メールアドレス')).join('・');
    p('kind').textContent = member ? `アカウント作成済み（ログイン：${methods || '—'}）` : 'ゲスト（アカウント未作成）';
    p('avatar').textContent = [...u.displayName][0] ?? '?';
    p('sync').textContent = SYNC_TEXT[account.sync] ?? '';
    const hasEmail = u.providers.includes('email');
    const hasGoogle = u.providers.includes('google');
    const googleReady = !!account.providers.google && account.oauthReady;
    // ゲスト：アカウントを作る（またはログイン）。作成済み：まだないログイン方法を足せる
    p('linkTitle').textContent = member ? 'ログイン方法を追加' : 'アカウントを作成';
    p('linkNote').textContent = member
      ? '別の端末では、同じ方法でログインするとデータを引き継げます。'
      : 'アカウントを作ると、いまのデッキや名前を持ったまま、別の端末でも遊べます。ランクマッチとフレンドも使えます。作らないと、ブラウザのデータを消したときに戻れません。';
    p('emailForm').hidden = hasEmail;
    p('passSection').hidden = !hasEmail;
    // 作成済み（Google）のときは、メールは「このアカウントに追加」だけ（別のアカウントへのログインは、ログアウトしてから）
    this.box.querySelector('[data-act="emailRegister"]').textContent = member ? 'メールアドレスでもログインできるようにする' : 'アカウントを作成';
    this.box.querySelector('[data-act="emailLogin"]').hidden = member;
    // Google は、サーバーで設定されているときだけ出す（遊ぶ人に「未設定」は見せない）
    const showGoogle = googleReady && !hasGoogle;
    p('oauth').hidden = !showGoogle;
    p('or').hidden = hasEmail;
    this.box.querySelector('.account-provider[data-provider="google"]').textContent = member ? 'Googleでもログインできるようにする' : 'Googleで作成・ログイン';
    p('link').hidden = hasEmail && !showGoogle; // 足せるものがなければ、この欄ごと隠す
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
    if (act === 'emailRegister' || act === 'emailLogin') {
      const email = this.part('emailInput').value;
      const pass = this.part('passInput').value;
      if (!email.trim() || !pass) return this.say('メールアドレスとパスワードを入れてください', true);
      const wasGuest = account.user?.kind === 'guest';
      this.say(act === 'emailRegister' ? (wasGuest ? 'アカウントを作成しています…' : '登録しています…') : 'ログインしています…');
      const r = await account.emailAuth(act === 'emailRegister' ? 'register' : 'login', email, pass);
      if (!r.ok) return this.say(r.reason, true);
      this.part('passInput').value = '';
      if (r.result === 'conflict') { this.conflictId = r.conflictId; this.say(''); return this.render(); }
      this.say(r.result !== 'linked' ? 'ログインしました' : wasGuest ? 'アカウントを作成しました。別の端末でも、このメールアドレスでログインできます' : 'メールアドレスでもログインできるようになりました');
      return this.render();
    }
    if (act === 'changePass') {
      const r = await account.changePassword(this.part('curPass').value, this.part('newPass').value);
      if (!r.ok) return this.say(r.reason, true);
      this.part('curPass').value = ''; this.part('newPass').value = '';
      this.say('パスワードを変えました。ほかの端末では、もう一度ログインしてください');
      return this.render();
    }
    if (act === 'switch' || act === 'cancel') {
      const r = await account.resolveConflict(this.conflictId, act);
      this.conflictId = null;
      if (!r.ok) { this.say(r.reason, true); return this.render(); }
      if (act === 'switch') { this.toast('アカウントを切りかえました'); await account.init(); }
      return this.render();
    }
    if (act === 'export') {
      const r = await fetch('/api/account/export', { credentials: 'same-origin', cache: 'no-store', headers: { 'X-CF-Client': '1' } });
      if (!r.ok) { const j = await r.json().catch(() => null); return this.say(j?.reason ?? '書き出せませんでした', true); }
      const url = URL.createObjectURL(await r.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: 'castlefield-my-data.json' });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      return this.say('自分のデータを書き出しました（ダウンロードを確認してください）');
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
