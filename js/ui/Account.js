// アカウントの画面側。サーバー（server/accounts/）が唯一の正しい情報源で、ここはその窓口。
// - 初回はゲストとして自動で始まる。Google かメールアドレスを登録すると、ゲストのデータを持ったまま引き継げる
// - サーバーがない環境（python の簡易サーバー・オフライン）では、何も起きずにこれまでどおり遊べる
// - デッキは端末にも残す（オフラインで遊べるように）。変えたらクラウドへ送り、起動時にクラウドと合わせる
import { loadDecks, onDecksChanged, replaceDecks } from './DeckStore.js';

const SYNC_KEY = 'cf-deck-sync-v1'; // { userId, dirty, rev }
const BACKUP_PREFIX = 'cf-mydecks-backup-';
const AUTH_MESSAGES = {
  denied: '認証がキャンセルされました',
  state: '認証の有効期限が切れました。もう一度試してください',
  failed: '認証に失敗しました。もう一度試してください',
  linked: 'このGoogleアカウントは、別のキャッスルフィールドのアカウントで使われています',
};

const readMeta = () => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) ?? {}; } catch { return {}; } };
const writeMeta = (m) => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(m)); } catch { /* 保存できなくても動く */ } };
const hasDecks = (s) => !!s?.slots?.some(Boolean);

/** 上書きする前の端末のデッキを、念のためとっておく（最新の3つだけ） */
function backupLocal(state) {
  if (!hasDecks(state)) return;
  try {
    localStorage.setItem(`${BACKUP_PREFIX}${Date.now()}`, JSON.stringify(state));
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(BACKUP_PREFIX)).sort();
    for (const k of keys.slice(0, -3)) localStorage.removeItem(k);
  } catch { /* 容量がなければ諦める */ }
}

export class Account {
  constructor() {
    this.enabled = false; // サーバーのアカウント機能が使えるか
    this.user = null;
    this.csrf = null;
    this.providers = { google: false };
    this.sync = 'idle'; // idle | syncing | saved | offline | conflict
    this.listeners = new Set();
    this.timer = null;
    onDecksChanged(() => this.markDirty());
    addEventListener('online', () => { if (!this.enabled) this.init(); else this.flush(); });
  }

  onChange(fn) { this.listeners.add(fn); }
  emit() { for (const fn of this.listeners) fn(this); }

  async api(method, path, body) {
    const res = await fetch(path, {
      method, credentials: 'same-origin', cache: 'no-store',
      headers: { 'X-CF-Client': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(this.csrf ? { 'X-CF-CSRF': this.csrf } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('json')) return { status: res.status, json: null };
    return { status: res.status, json: await res.json().catch(() => null) };
  }

  /** 起動時：状態を読み、なければゲストを作り、デッキをクラウドと合わせる */
  async init() {
    try {
      let r = await this.api('GET', '/api/me');
      if (!r.json?.ok) { this.enabled = false; this.emit(); return; } // アカウント機能のないサーバー
      this.enabled = true;
      this.adopt(r.json);
      if (!this.user) {
        r = await this.api('POST', '/api/auth/guest', {});
        if (!r.json?.ok) throw new Error('guest');
        this.adopt(r.json);
      }
      this.emit();
      await this.syncDecks();
    } catch {
      this.sync = this.enabled ? 'offline' : 'idle';
      this.emit();
    }
  }

  adopt(me) {
    this.user = me.user;
    this.csrf = me.csrf ?? this.csrf;
    this.providers = me.providers ?? this.providers;
    this.oauthReady = !!me.oauthReady;
  }

  // ---- デッキの同期 ----
  markDirty() {
    if (!this.enabled || !this.user) return;
    writeMeta({ ...readMeta(), userId: this.user.id, dirty: true });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 600);
  }

  async flush() {
    if (!this.enabled || !this.user || !readMeta().dirty) return;
    await this.syncDecks();
  }

  async syncDecks() {
    if (!this.user) return;
    this.sync = 'syncing'; this.emit();
    try {
      const meta = readMeta();
      const local = loadDecks();
      if (meta.userId !== this.user.id) {
        // この端末で、このアカウントを初めて使う：端末のデッキをクラウドへ取り込む（持っているデッキは消えない）
        backupLocal(local);
        const imp = await this.api('POST', '/api/decks/import', { active: local.active, slots: local.slots });
        if (!imp.json?.ok) throw new Error('import');
        replaceDecks(imp.json);
        writeMeta({ userId: this.user.id, dirty: false, rev: imp.json.revision });
        this.skipped = imp.json.skipped ?? 0;
      } else if (meta.dirty) {
        const put = await this.api('PUT', '/api/decks', { active: local.active, slots: local.slots, baseRevision: meta.rev });
        if (put.status === 409 && put.json?.conflict) {
          // ほかの端末が先に変えていた：端末の内容はとっておいて、クラウドを採用する
          backupLocal(local);
          const cloud = await this.api('GET', '/api/decks');
          replaceDecks(cloud.json);
          writeMeta({ userId: this.user.id, dirty: false, rev: cloud.json.revision });
          this.sync = 'conflict'; this.emit();
          return;
        }
        if (!put.json?.ok) throw new Error('put');
        writeMeta({ userId: this.user.id, dirty: false, rev: put.json.revision });
      } else {
        const cloud = await this.api('GET', '/api/decks');
        if (!cloud.json?.ok) throw new Error('get');
        if (hasDecks(cloud.json) || !hasDecks(local)) replaceDecks(cloud.json);
        else await this.api('POST', '/api/decks/import', { active: local.active, slots: local.slots });
        writeMeta({ userId: this.user.id, dirty: false, rev: cloud.json.revision });
      }
      this.sync = 'saved';
    } catch {
      this.sync = 'offline'; // 端末には保存済み。つながったらまた送る
    }
    this.emit();
  }

  // ---- 操作 ----
  async startOAuth(provider) {
    const r = await this.api('POST', '/api/auth/oauth/start', { provider });
    if (!r.json?.ok) return { ok: false, reason: r.json?.reason ?? 'サーバーにつながりません' };
    location.href = r.json.url;
    return { ok: true };
  }

  /**
   * メールアドレスとパスワード。action は register（いまのアカウントに登録）/ login（登録済みのアカウントに入る）。
   * 成功したらセッションが新しくなるので、状態を読み直す。ゲストのデータがあるアカウントへのログインは { result: 'conflict', conflictId }
   */
  async emailAuth(action, email, password) {
    const r = await this.api('POST', `/api/auth/email/${action === 'register' ? 'register' : 'login'}`, { email, password });
    if (!r.json?.ok) return { ok: false, reason: r.json?.reason ?? 'サーバーにつながりません' };
    if (r.json.result !== 'conflict') await this.init(); // ログインで別のアカウントになったら、この端末のデッキはそちらの空き枠に取り込む（Google と同じ）
    return r.json;
  }

  async changePassword(current, next) {
    const r = await this.api('POST', '/api/auth/email/password', { current, next });
    if (!r.json?.ok) return { ok: false, reason: r.json?.reason ?? 'サーバーにつながりません' };
    await this.init(); // セッションが新しくなる
    return r.json;
  }

  async logout(confirmGuestLoss = false) {
    const r = await this.api('POST', '/api/auth/logout', { confirmGuestLoss });
    if (r.json?.ok) { this.user = null; this.csrf = null; writeMeta({}); return { ok: true }; }
    return { ok: false, reason: r.json?.reason ?? 'ログアウトできませんでした', needsConfirm: !!r.json?.needsConfirm };
  }

  async deleteAccount() {
    const r = await this.api('POST', '/api/account/delete', { confirm: 'delete' });
    if (r.json?.ok) { this.user = null; this.csrf = null; writeMeta({}); }
    return r.json ?? { ok: false, reason: 'サーバーにつながりません' };
  }

  async rename(name) {
    const r = await this.api('POST', '/api/profile/name', { name });
    if (r.json?.ok) this.user = { ...this.user, displayName: r.json.displayName };
    return r.json ?? { ok: false, reason: 'サーバーにつながりません' };
  }

  async resolveConflict(id, action) {
    const r = await this.api('POST', '/api/auth/link/resolve', { id, action });
    return r.json ?? { ok: false, reason: 'サーバーにつながりません' };
  }
}

export const account = new Account();

/** 連携の戻り先（?auth=...）を読み、URL から消す。{ kind, message, conflictId } か null */
export function readAuthResult() {
  const q = new URLSearchParams(location.search);
  const auth = q.get('auth');
  if (!auth) return null;
  const why = q.get('why');
  const id = q.get('id');
  for (const k of ['auth', 'why', 'id']) q.delete(k);
  history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}${location.hash}`);
  if (auth === 'error') return { kind: 'error', message: AUTH_MESSAGES[why] ?? AUTH_MESSAGES.failed };
  return { kind: auth, conflictId: id };
}
