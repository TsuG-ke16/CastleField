// アカウントの中身（HTTP を知らない）。サーバーが唯一の正しい情報源。
// - ゲスト・Google・Apple のアカウント、セッション、連携、削除
// - デッキのクラウド保存（端末のデッキの取り込みを含む）
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const DECK_SLOTS = 4;
export const MAX_NAME = 16;
export const MAX_DECK_NAME = 24;
const DAY = 24 * 60 * 60 * 1000;

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const rand = (n = 32) => randomBytes(n).toString('base64url');
export const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

export class AccountError extends Error {
  constructor(reason, status = 400, extra = {}) { super(reason); this.reason = reason; this.status = status; this.extra = extra; }
}

export class Accounts {
  /**
   * @param {import('./db.js').Db} db
   * @param {object} [o]
   * @param {object} [o.cards] cards.json（デッキに入れられるカード種類の確認用）
   * @param {() => number} [o.now]
   */
  constructor(db, { cards = null, modeIds = ['kingdom'], now = () => Date.now(), sessionAbsoluteMs = 90 * DAY, sessionIdleMs = 30 * DAY } = {}) {
    this.db = db;
    this.cards = cards;
    this.modeIds = modeIds; // 使えるモード（世界）
    this.now = now;
    this.sessionAbsoluteMs = sessionAbsoluteMs;
    this.sessionIdleMs = sessionIdleMs;
  }

  // ---- ユーザー ----
  audit(event, userId = null, detail = null) {
    this.db.run('INSERT INTO audit_log (at, event, user_hash, detail) VALUES (?, ?, ?, ?)',
      this.now(), event, userId ? sha256(userId).slice(0, 16) : null, detail ? String(detail).slice(0, 200) : null);
  }

  createUser(kind, displayName) {
    const id = `u_${randomBytes(12).toString('hex')}`;
    const t = this.now();
    const name = displayName ?? `ゲスト${String(randomBytes(2).readUInt16BE() % 10000).padStart(4, '0')}`;
    this.db.run('INSERT INTO users (id, kind, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)', id, kind, name, t, t);
    this.db.run('INSERT INTO user_settings (user_id) VALUES (?)', id);
    return id;
  }

  publicUser(userId) {
    const u = this.db.get('SELECT id, kind, display_name, created_at FROM users WHERE id = ?', userId);
    if (!u) return null;
    const providers = this.db.all('SELECT provider FROM identities WHERE user_id = ? ORDER BY provider', userId).map((r) => r.provider);
    return { id: u.id, kind: u.kind, displayName: u.display_name, createdAt: u.created_at, providers };
  }

  rename(userId, name) {
    const n = String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    if (n.length < 1 || n.length > MAX_NAME) throw new AccountError(`名前は1〜${MAX_NAME}文字にしてください`);
    this.db.run('UPDATE users SET display_name = ? WHERE id = ?', n, userId);
    return n;
  }

  // ---- セッション ----
  /** ログイン状態を作る。返す token は Cookie にだけ入れる（DB にはハッシュだけ保存） */
  createSession(userId) {
    const token = rand(32);
    const csrf = rand(24);
    const t = this.now();
    this.db.run('INSERT INTO sessions (id_hash, user_id, csrf, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      sha256(token), userId, csrf, t, t, t + this.sessionAbsoluteMs);
    return { token, csrf, maxAgeSec: Math.floor(this.sessionAbsoluteMs / 1000) };
  }

  /** @returns {{ userId: string, csrf: string } | null} */
  getSession(token) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
    const row = this.db.get('SELECT * FROM sessions WHERE id_hash = ?', sha256(token));
    if (!row || row.revoked_at) return null;
    const t = this.now();
    if (row.expires_at <= t || row.last_used_at + this.sessionIdleMs <= t) return null;
    // 書き込みを減らすため、使った時刻は1時間に1回だけ更新する
    if (t - row.last_used_at > Math.min(60 * 60 * 1000, this.sessionIdleMs / 4)) {
      this.db.run('UPDATE sessions SET last_used_at = ? WHERE id_hash = ?', t, row.id_hash);
      this.db.run('UPDATE users SET last_seen_at = ? WHERE id = ?', t, row.user_id);
    }
    return { userId: row.user_id, csrf: row.csrf };
  }

  revokeSession(token) {
    if (typeof token === 'string') this.db.run('UPDATE sessions SET revoked_at = ? WHERE id_hash = ? AND revoked_at IS NULL', this.now(), sha256(token));
  }

  revokeAllSessions(userId) {
    this.db.run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', this.now(), userId);
  }

  /** 期限切れのセッション・認証の途中経過を片づける */
  purge() {
    const t = this.now();
    this.db.run('DELETE FROM sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL AND revoked_at < ?', t, t - 7 * DAY);
    this.db.run('DELETE FROM oauth_states WHERE expires_at <= ?', t);
    this.db.run('DELETE FROM link_conflicts WHERE expires_at <= ?', t);
  }

  startGuest() {
    return this.db.tx(() => {
      const userId = this.createUser('guest');
      this.audit('guest_created', userId);
      return { userId, session: this.createSession(userId) };
    });
  }

  logout(token, userId, { confirmGuestLoss = false } = {}) {
    const u = this.db.get('SELECT kind FROM users WHERE id = ?', userId);
    if (u?.kind === 'guest' && !confirmGuestLoss) {
      throw new AccountError('ゲストのままログアウトすると、データに戻れなくなります', 409, { needsConfirm: true });
    }
    this.revokeSession(token);
  }

  // ---- OAuth のあとの処理 ----
  saveOAuthState({ state, provider, nonce, verifier, userId = null, ttlMs = 10 * 60 * 1000 }) {
    const t = this.now();
    this.db.run('INSERT INTO oauth_states (state, provider, nonce, verifier, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      state, provider, nonce, verifier, userId, t, t + ttlMs);
  }

  /** state は1回しか使えない（取り出すと消える） */
  takeOAuthState(state, provider) {
    return this.db.tx(() => {
      const row = typeof state === 'string' ? this.db.get('SELECT * FROM oauth_states WHERE state = ?', state) : null;
      if (!row) return null;
      this.db.run('DELETE FROM oauth_states WHERE state = ?', state);
      if (row.provider !== provider || row.expires_at <= this.now()) return null;
      return row;
    });
  }

  /**
   * 認証に成功したあとの結果。
   * @returns {{ result: 'logged-in'|'linked'|'created'|'conflict', session?, userId?, conflictId? }}
   * - intentUserId：連携を始めたときのログイン中のユーザー（ゲストなど）。なければ「ログイン」
   */
  completeOAuth({ provider, subject, intentUserId }) {
    return this.db.tx(() => {
      const owner = this.db.get('SELECT user_id FROM identities WHERE provider = ? AND subject = ?', provider, subject)?.user_id ?? null;
      const intent = intentUserId ? this.db.get('SELECT id, kind FROM users WHERE id = ?', intentUserId) : null;
      if (!owner) {
        if (intent) {
          this.db.run('INSERT INTO identities (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)', provider, subject, intent.id, this.now());
          this.db.run("UPDATE users SET kind = 'member' WHERE id = ?", intent.id);
          this.audit('identity_linked', intent.id, provider);
          return { result: 'linked', userId: intent.id, session: this.rotateSession(intent.id) };
        }
        const userId = this.createUser('member');
        this.db.run('INSERT INTO identities (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)', provider, subject, userId, this.now());
        this.audit('member_created', userId, provider);
        return { result: 'created', userId, session: this.createSession(userId) };
      }
      if (!intent || intent.id === owner) {
        this.audit('login', owner, provider);
        return { result: 'logged-in', userId: owner, session: this.rotateSession(owner, intent?.id === owner) };
      }
      // すでに別のアカウントに結びついている
      if (intent.kind !== 'guest') {
        throw new AccountError('このGoogle/Appleアカウントは、別のキャッスルフィールドのアカウントに連携済みです', 409);
      }
      const guestHasData = this.db.get('SELECT COUNT(*) AS n FROM user_decks WHERE user_id = ?', intent.id).n > 0;
      if (!guestHasData) {
        // ゲストに引き継ぐものがなければ、確認なしでそのアカウントに切りかえる
        this.deleteUserRows(intent.id);
        this.audit('login_replaced_empty_guest', owner, provider);
        return { result: 'logged-in', userId: owner, session: this.createSession(owner) };
      }
      const id = rand(18);
      const t = this.now();
      this.db.run('DELETE FROM link_conflicts WHERE guest_user_id = ?', intent.id);
      this.db.run('INSERT INTO link_conflicts (id, guest_user_id, target_user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)', id, intent.id, owner, t, t + 10 * 60 * 1000);
      return { result: 'conflict', conflictId: id };
    });
  }

  /** 権限が変わったので、セッションを作り直す（古いものは失効） */
  rotateSession(userId) {
    this.revokeAllSessions(userId);
    return this.createSession(userId);
  }

  /** 「ゲストのデータを持って、既存のアカウントに切りかえる」か「やめる」 */
  resolveConflict(currentUserId, conflictId, action) {
    return this.db.tx(() => {
      const c = typeof conflictId === 'string' ? this.db.get('SELECT * FROM link_conflicts WHERE id = ?', conflictId) : null;
      if (!c || c.guest_user_id !== currentUserId || c.expires_at <= this.now()) throw new AccountError('この操作はもう使えません。最初からやり直してください', 410);
      this.db.run('DELETE FROM link_conflicts WHERE id = ?', c.id);
      if (action === 'cancel') return { result: 'cancelled' };
      if (action !== 'switch') throw new AccountError('操作が正しくありません');
      this.importDecks(c.target_user_id, this.getDecks(c.guest_user_id)); // 空いている枠にだけ入れる（相手のデータは消さない）
      this.deleteUserRows(c.guest_user_id);
      this.audit('guest_merged', c.target_user_id);
      return { result: 'switched', userId: c.target_user_id, session: this.createSession(c.target_user_id) };
    });
  }

  deleteUserRows(userId) {
    this.db.run('DELETE FROM users WHERE id = ?', userId); // 関連する行は ON DELETE CASCADE で一緒に消える
  }

  /** アカウント削除：個人に結びつくデータを全部消す（監査ログには、ハッシュ化したIDと「削除した」という事実だけ残る） */
  deleteAccount(userId) {
    this.db.tx(() => {
      this.audit('account_deleted', userId);
      this.db.run("UPDATE match_players SET name = '（削除済み）' WHERE user_id = ?", userId); // 相手の戦績は残すが、名前は消す
      this.deleteUserRows(userId);
    });
  }

  // ---- デッキ ----
  validateDeckSlots(input) {
    if (!input || typeof input !== 'object' || !Array.isArray(input.slots) || input.slots.length > DECK_SLOTS) throw new AccountError('デッキの形が正しくありません');
    const slots = Array.from({ length: DECK_SLOTS }, (_, i) => {
      const d = input.slots[i];
      if (d == null) return null;
      if (typeof d !== 'object' || typeof d.name !== 'string' || !d.list || typeof d.list !== 'object' || Array.isArray(d.list)) throw new AccountError('デッキの形が正しくありません');
      const name = d.name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_DECK_NAME);
      if (!name) throw new AccountError('デッキの名前を入れてください');
      const list = {};
      let total = 0;
      for (const [type, n] of Object.entries(d.list)) {
        if (!Number.isInteger(n) || n < 1 || n > 99) throw new AccountError('カードの枚数が正しくありません');
        if (this.cards && !Object.hasOwn(this.cards, type)) throw new AccountError('知らないカードが入っています');
        list[type] = n; total += n;
      }
      if (total < 1 || total > 300) throw new AccountError('デッキの枚数が正しくありません');
      return { name, list };
    });
    const active = Number.isInteger(input.active) && slots[input.active] ? input.active : Math.max(0, slots.findIndex(Boolean));
    return { active, slots };
  }

  checkMode(modeId) {
    if (typeof modeId !== 'string' || !this.modeIds.includes(modeId)) throw new AccountError('そのモードは使えません');
    return modeId;
  }

  /** @returns {{ active: number, slots: ({name:string,list:object}|null)[], revision: number }} モード（世界）ごと。省略すると王国 */
  getDecks(userId, modeId = 'kingdom') {
    const slots = Array(DECK_SLOTS).fill(null);
    for (const r of this.db.all('SELECT slot, name, list_json FROM user_decks WHERE user_id = ? AND mode_id = ?', userId, modeId)) {
      if (r.slot < DECK_SLOTS) slots[r.slot] = { name: r.name, list: JSON.parse(r.list_json) };
    }
    const s = this.db.get('SELECT active_deck, deck_revision FROM user_deck_settings WHERE user_id = ? AND mode_id = ?', userId, modeId) ?? { active_deck: 0, deck_revision: 0 };
    return { active: s.active_deck, slots, revision: s.deck_revision };
  }

  writeDecks(userId, { active, slots }, modeId = 'kingdom') {
    this.db.run('DELETE FROM user_decks WHERE user_id = ? AND mode_id = ?', userId, modeId);
    const t = this.now();
    slots.forEach((d, slot) => {
      if (d) this.db.run('INSERT INTO user_decks (user_id, mode_id, slot, name, list_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)', userId, modeId, slot, d.name, JSON.stringify(d.list), t);
    });
    this.db.run(`INSERT INTO user_deck_settings (user_id, mode_id, active_deck, deck_revision) VALUES (?, ?, ?, 1)
      ON CONFLICT(user_id, mode_id) DO UPDATE SET active_deck = excluded.active_deck, deck_revision = deck_revision + 1`, userId, modeId, active);
  }

  /** 保存。baseRevision を渡すと、ほかの端末が先に変えていたときは 409（上書きして消さないため） */
  putDecks(userId, input, baseRevision = null, modeId = 'kingdom') {
    this.checkMode(modeId);
    const clean = this.validateDeckSlots(input);
    return this.db.tx(() => {
      const cur = this.getDecks(userId, modeId);
      if (baseRevision != null && baseRevision !== cur.revision) throw new AccountError('ほかの端末でデッキが変わっています', 409, { conflict: true, revision: cur.revision });
      this.writeDecks(userId, clean, modeId);
      return this.getDecks(userId, modeId);
    });
  }

  /**
   * 端末のデッキの取り込み：持っているデッキは消さず、まだないデッキを空いている枠に入れる。
   * 同じ名前・同じ中身のデッキはもうあるものとして飛ばす（何度送っても結果は同じ）。枠が足りないぶんは skipped に数える
   */
  importDecks(userId, input, modeId = 'kingdom') {
    this.checkMode(modeId);
    const clean = this.validateDeckSlots(input);
    return this.db.tx(() => {
      const cur = this.getDecks(userId, modeId);
      const hadAny = cur.slots.some(Boolean);
      const slots = [...cur.slots];
      const same = (a, b) => a.name === b.name && JSON.stringify(Object.entries(a.list).sort()) === JSON.stringify(Object.entries(b.list).sort());
      let imported = 0; let skipped = 0;
      let firstPlaced = null;
      clean.slots.forEach((d, i) => {
        if (!d || slots.some((x) => x && same(x, d))) return;
        const free = slots.findIndex((x) => !x);
        if (free < 0) { skipped += 1; return; }
        slots[free] = d; imported += 1;
        if (i === clean.active) firstPlaced = free;
      });
      if (imported) this.writeDecks(userId, { active: hadAny ? cur.active : (firstPlaced ?? slots.findIndex(Boolean)), slots }, modeId);
      return { ...this.getDecks(userId, modeId), imported: imported > 0, skipped };
    });
  }
}
