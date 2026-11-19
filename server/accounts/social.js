// フレンド・ブロック・招待・パーティー・オンライン状態。フレンド情報はサーバーが持つ（クライアントだけで管理しない）。
// 招待・パーティー・オンライン状態は短い間だけ意味があるのでメモリで持つ（サーバーを再起動すると消える）。
// スパム対策：申請・招待・検索の回数制限、断られたあとの再申請の待ち時間、ブロック、招待・申請を受けない設定。
import { randomBytes } from 'node:crypto';
import { AccountError } from './accounts.js';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const SOCIAL_LIMITS = {
  maxFriends: 100, maxOutgoing: 20, requestsPerHour: 10, searchPerMinute: 20, invitesPerMinute: 6,
  declinedCooldownMs: 24 * 3600 * 1000, inviteTtlMs: 2 * 60 * 1000, partyRoomTtlMs: 10 * 60 * 1000, presenceMs: 75 * 1000, partyMax: 8,
};
const NOT_ALLOWED = 'このプレイヤーには送れません';
const pair = (x, y) => (x < y ? [x, y] : [y, x]);
const rand = (n) => randomBytes(n).toString('base64url');
const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export class Social {
  /**
   * @param {object} o
   * @param {import('./db.js').Db} o.db  @param {import('./accounts.js').Accounts} o.accounts  @param {import('./progress.js').Progress} o.progress
   * @param {(userId: string) => boolean} [o.isBusy] いま試合の途中か
   */
  constructor({ db, accounts, progress, isBusy = () => false, now = () => Date.now(), limits = SOCIAL_LIMITS }) {
    Object.assign(this, { db, accounts, progress, isBusy, now, limits });
    this.presence = new Map(); // userId → 最後に見た時刻
    this.invites = new Map(); // id → { id, from, to, kind: 'room'|'party', passphrase?, partyId?, at }
    this.parties = new Map(); // id → { id, leader, members: [userId], room: { passphrase, at } | null }
    this.partyOf = new Map(); // userId → partyId
  }

  // ---- 基本 ----
  isMember(userId) { return this.db.get('SELECT kind FROM users WHERE id = ?', userId)?.kind === 'member'; }
  requireMember(userId) {
    if (!this.isMember(userId)) throw new AccountError('フレンド機能は、アカウントを作成すると使えます', 403, { code: 'needsMember' });
  }
  settings(userId) {
    const r = this.db.get('SELECT * FROM social_settings WHERE user_id = ?', userId);
    return { acceptRequests: r ? !!r.accept_requests : true, acceptInvites: r ? !!r.accept_invites : true, showOnline: r ? !!r.show_online : true, searchable: r ? !!r.searchable : true };
  }
  updateSettings(userId, s) {
    const cur = this.settings(userId);
    for (const [k, v] of Object.entries(s ?? {})) {
      if (!Object.hasOwn(cur, k) || typeof v !== 'boolean') throw new AccountError('設定が正しくありません');
      cur[k] = v;
    }
    this.db.run(`INSERT INTO social_settings (user_id, accept_requests, accept_invites, show_online, searchable) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET accept_requests = excluded.accept_requests, accept_invites = excluded.accept_invites, show_online = excluded.show_online, searchable = excluded.searchable`,
      userId, +cur.acceptRequests, +cur.acceptInvites, +cur.showOnline, +cur.searchable);
    return cur;
  }
  code(userId) {
    const have = this.db.get('SELECT code FROM user_codes WHERE user_id = ?', userId)?.code;
    if (have) return have;
    for (;;) {
      const code = Array.from(randomBytes(8), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
      try { this.db.run('INSERT INTO user_codes (user_id, code) VALUES (?, ?)', userId, code); return code; } catch { /* かぶったらやり直し */ }
    }
  }
  /** 回数の制限：直近 windowMs に max 回を超えたら例外。ok なら1回ぶん記録する */
  rate(userId, kind, max, windowMs, reason = '操作が多すぎます。少し待ってください') {
    const t = this.now();
    this.db.run('DELETE FROM social_log WHERE at < ?', t - 24 * 3600 * 1000);
    const n = this.db.get('SELECT COUNT(*) AS n FROM social_log WHERE user_id = ? AND kind = ? AND at > ?', userId, kind, t - windowMs).n;
    if (n >= max) throw new AccountError(reason, 429);
    this.db.run('INSERT INTO social_log (user_id, kind, at) VALUES (?, ?, ?)', userId, kind, t);
  }

  blockedEither(x, y) {
    return !!this.db.get('SELECT 1 AS x FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)', x, y, y, x);
  }
  row(x, y) { const [a, b] = pair(x, y); return this.db.get('SELECT * FROM friendships WHERE user_a = ? AND user_b = ?', a, b); }
  isFriend(x, y) { return this.row(x, y)?.status === 'accepted'; }

  card(userId) {
    const u = this.accounts.publicUser(userId);
    if (!u) return null;
    const prow = this.progress.profileRow(userId);
    return { userId, name: u.displayName, icon: prow.icon, level: this.progress.levelInfo(this.progress.getXp(userId)).level };
  }

  relation(me, other) {
    const r = this.row(me, other);
    if (!r) return 'none';
    if (r.status === 'accepted') return 'friend';
    if (r.status === 'pending') return r.requested_by === me ? 'pending_out' : 'pending_in';
    return 'none';
  }

  // ---- オンライン状態 ----
  touch(userId) { this.presence.set(userId, this.now()); }
  statusOf(target, viewer) {
    if (target !== viewer && !this.settings(target).showOnline) return 'hidden';
    if (this.isBusy(target)) return 'in_match';
    return this.now() - (this.presence.get(target) ?? 0) <= this.limits.presenceMs ? 'online' : 'offline';
  }

  // ---- 検索・申請 ----
  search(me, q) {
    this.requireMember(me);
    this.rate(me, 'search', this.limits.searchPerMinute, 60_000);
    const text = String(q ?? '').trim();
    if (text.length < 2 || text.length > 16) throw new AccountError('2〜16文字で入れてください（フレンドコードなら8文字）');
    let rows;
    if (/^[A-Za-z0-9]{8}$/.test(text) && this.db.get('SELECT 1 AS x FROM user_codes WHERE code = ?', text.toUpperCase())) {
      rows = this.db.all('SELECT u.id FROM user_codes c JOIN users u ON u.id = c.user_id WHERE c.code = ? AND u.kind = \'member\'', text.toUpperCase());
    } else {
      rows = this.db.all(`SELECT u.id FROM users u LEFT JOIN social_settings s ON s.user_id = u.id
        WHERE u.kind = 'member' AND u.display_name LIKE ? ESCAPE '\\' AND COALESCE(s.searchable, 1) = 1 ORDER BY u.display_name LIMIT 20`, `${escapeLike(text)}%`);
    }
    return rows.map((r) => r.id).filter((id) => id !== me && !this.blockedEither(me, id))
      .map((id) => ({ ...this.card(id), relation: this.relation(me, id) }));
  }

  request(me, target) {
    this.requireMember(me);
    if (typeof target !== 'string' || target === me || !this.isMember(target) || this.blockedEither(me, target) || !this.settings(target).acceptRequests) {
      throw new AccountError(NOT_ALLOWED, 403);
    }
    return this.db.tx(() => {
      const row = this.row(me, target);
      if (row?.status === 'accepted') throw new AccountError('すでにフレンドです', 409);
      if (row?.status === 'pending' && row.requested_by === target) return this.accept(me, target); // 相手からも来ていた：そのまま成立
      if (row?.status === 'pending') throw new AccountError('すでに申請しています', 409);
      if (row?.status === 'declined' && this.now() - row.updated_at < this.limits.declinedCooldownMs) throw new AccountError(NOT_ALLOWED, 403);
      if (this.friendCount(me) >= this.limits.maxFriends) throw new AccountError(`フレンドは${this.limits.maxFriends}人までです`, 409);
      if (this.friendCount(target) >= this.limits.maxFriends) throw new AccountError(NOT_ALLOWED, 403);
      const out = this.db.get("SELECT COUNT(*) AS n FROM friendships WHERE status = 'pending' AND requested_by = ?", me).n;
      if (out >= this.limits.maxOutgoing) throw new AccountError('返事待ちの申請が多すぎます。返事が来てから送ってください', 409);
      this.rate(me, 'request', this.limits.requestsPerHour, 3600_000, '申請が多すぎます。しばらくしてから送ってください');
      const [a, b] = pair(me, target); const t = this.now();
      this.db.run(`INSERT INTO friendships (user_a, user_b, status, requested_by, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?, ?)
        ON CONFLICT(user_a, user_b) DO UPDATE SET status = 'pending', requested_by = excluded.requested_by, updated_at = excluded.updated_at`, a, b, me, t, t);
      return { state: 'pending' };
    });
  }
  friendCount(u) { return this.db.get("SELECT COUNT(*) AS n FROM friendships WHERE status = 'accepted' AND (user_a = ? OR user_b = ?)", u, u).n; }
  accept(me, from) {
    const [a, b] = pair(me, from);
    this.db.run("UPDATE friendships SET status = 'accepted', updated_at = ? WHERE user_a = ? AND user_b = ?", this.now(), a, b);
    return { state: 'accepted' };
  }
  respond(me, from, accept) {
    this.requireMember(me);
    return this.db.tx(() => {
      const r = typeof from === 'string' ? this.row(me, from) : null;
      if (!r || r.status !== 'pending' || r.requested_by !== from) throw new AccountError('その申請はもうありません', 404);
      if (this.blockedEither(me, from)) throw new AccountError(NOT_ALLOWED, 403);
      if (accept) {
        if (this.friendCount(me) >= this.limits.maxFriends || this.friendCount(from) >= this.limits.maxFriends) throw new AccountError('フレンドの上限です', 409);
        return this.accept(me, from);
      }
      const [a, b] = pair(me, from);
      this.db.run("UPDATE friendships SET status = 'declined', updated_at = ? WHERE user_a = ? AND user_b = ?", this.now(), a, b);
      return { state: 'declined' };
    });
  }
  cancel(me, to) {
    const r = typeof to === 'string' ? this.row(me, to) : null;
    if (r?.status === 'pending' && r.requested_by === me) { const [a, b] = pair(me, to); this.db.run('DELETE FROM friendships WHERE user_a = ? AND user_b = ?', a, b); }
    return { ok: true };
  }
  remove(me, other) {
    this.requireMember(me);
    if (typeof other === 'string') { const [a, b] = pair(me, other); this.db.run("DELETE FROM friendships WHERE user_a = ? AND user_b = ? AND status = 'accepted'", a, b); this.dropLinks(me, other); }
    return { ok: true };
  }

  // ---- ブロック ----
  block(me, target) {
    this.requireMember(me);
    if (typeof target !== 'string' || target === me || !this.accounts.publicUser(target)) throw new AccountError('ブロックできません');
    this.db.tx(() => {
      this.db.run('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)', me, target, this.now());
      const [a, b] = pair(me, target);
      this.db.run('DELETE FROM friendships WHERE user_a = ? AND user_b = ?', a, b); // フレンド・申請は消える
      this.dropLinks(me, target);
    });
    return { ok: true };
  }
  unblock(me, target) { this.db.run('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?', me, target); return { ok: true }; }
  /** 2人の間の招待・同じパーティーを消す */
  dropLinks(x, y) {
    for (const [id, inv] of this.invites) if ((inv.from === x && inv.to === y) || (inv.from === y && inv.to === x)) this.invites.delete(id);
    const px = this.partyOf.get(x);
    if (px && px === this.partyOf.get(y)) { const p = this.parties.get(px); this.leaveParty(p.leader === x ? y : x); }
  }

  // ---- 招待（部屋）----
  /** フレンドを対戦に招く。サーバーが合言葉を決めて返す（招待を受けた人にだけ渡す）。招く側は、その合言葉でふつうの部屋に入る */
  inviteToRoom(me, to) {
    this.requireMember(me);
    this.checkInvitable(me, to);
    this.rate(me, 'invite', this.limits.invitesPerMinute, 60_000, '招待が多すぎます。少し待ってください');
    for (const [id, inv] of this.invites) if (inv.from === me && inv.to === to && inv.kind === 'room') this.invites.delete(id); // 同じ相手への古い招待は置きかえる
    const inv = { id: rand(9), from: me, to, kind: 'room', passphrase: `f-${rand(12)}`, at: this.now() };
    this.invites.set(inv.id, inv);
    return { id: inv.id, passphrase: inv.passphrase };
  }
  checkInvitable(me, to) {
    if (typeof to !== 'string' || to === me || !this.isFriend(me, to) || this.blockedEither(me, to) || !this.settings(to).acceptInvites) throw new AccountError(NOT_ALLOWED, 403);
  }
  sweep() {
    const t = this.now();
    for (const [id, inv] of this.invites) if (t - inv.at > this.limits.inviteTtlMs) this.invites.delete(id);
    for (const p of this.parties.values()) if (p.room && t - p.room.at > this.limits.partyRoomTtlMs) p.room = null;
  }
  respondInvite(me, id, accept) {
    this.requireMember(me);
    this.sweep();
    const inv = this.invites.get(id);
    if (!inv || inv.to !== me) throw new AccountError('その招待はもうありません', 404);
    this.invites.delete(id);
    if (!accept) return { ok: true };
    if (this.blockedEither(me, inv.from)) throw new AccountError(NOT_ALLOWED, 403);
    if (inv.kind === 'party') { this.joinParty(me, inv.partyId); return { ok: true, kind: 'party' }; }
    return { ok: true, kind: 'room', passphrase: inv.passphrase };
  }

  // ---- パーティー ----
  createParty(me) {
    this.requireMember(me);
    if (this.partyOf.has(me)) throw new AccountError('すでにパーティーにいます', 409);
    const p = { id: rand(8), leader: me, members: [me], room: null };
    this.parties.set(p.id, p); this.partyOf.set(me, p.id);
    return this.partyView(p, me);
  }
  inviteToParty(me, to) {
    this.requireMember(me);
    const p = this.parties.get(this.partyOf.get(me));
    if (!p) throw new AccountError('パーティーを作ってから招待してください', 409);
    if (p.members.length >= this.limits.partyMax) throw new AccountError('パーティーは満員です', 409);
    this.checkInvitable(me, to);
    if (this.partyOf.has(to)) throw new AccountError('すでに別のパーティーにいます', 409);
    this.rate(me, 'invite', this.limits.invitesPerMinute, 60_000, '招待が多すぎます。少し待ってください');
    for (const [id, inv] of this.invites) if (inv.from === me && inv.to === to && inv.kind === 'party') this.invites.delete(id);
    const inv = { id: rand(9), from: me, to, kind: 'party', partyId: p.id, at: this.now() };
    this.invites.set(inv.id, inv);
    return { ok: true };
  }
  joinParty(me, partyId) {
    const p = this.parties.get(partyId);
    if (!p) throw new AccountError('そのパーティーはもうありません', 404);
    if (this.partyOf.has(me)) throw new AccountError('すでにパーティーにいます', 409);
    if (p.members.length >= this.limits.partyMax) throw new AccountError('パーティーは満員です', 409);
    p.members.push(me); this.partyOf.set(me, p.id);
  }
  leaveParty(me) {
    const p = this.parties.get(this.partyOf.get(me));
    if (!p) return { ok: true };
    this.partyOf.delete(me);
    p.members = p.members.filter((m) => m !== me);
    if (p.members.length === 0) { this.parties.delete(p.id); return { ok: true }; }
    if (p.leader === me) p.leader = p.members[0];
    if (p.members.length === 1) { this.partyOf.delete(p.members[0]); this.parties.delete(p.id); } // 1人になったら解散
    return { ok: true };
  }
  kick(me, target) {
    const p = this.parties.get(this.partyOf.get(me));
    if (!p || p.leader !== me || target === me || !p.members.includes(target)) throw new AccountError('追い出せません', 403);
    this.leaveParty(target);
    return { ok: true };
  }
  /** リーダーが対戦の部屋を作る。メンバーにだけ合言葉が見える（各自がふつうの部屋に入る） */
  startParty(me) {
    const p = this.parties.get(this.partyOf.get(me));
    if (!p || p.leader !== me) throw new AccountError('リーダーだけが始められます', 403);
    if (p.members.length < 2) throw new AccountError('2人以上で始められます', 409);
    p.room = { passphrase: `p-${rand(12)}`, at: this.now() };
    return { passphrase: p.room.passphrase };
  }
  partyView(p, viewer) {
    if (!p) return null;
    return {
      id: p.id, leader: p.leader, isLeader: p.leader === viewer, max: this.limits.partyMax,
      members: p.members.map((m) => ({ ...this.card(m), status: this.statusOf(m, viewer), leader: m === p.leader })),
      room: p.room ? { passphrase: p.room.passphrase } : null,
    };
  }

  /** アカウント削除のとき：メモリにある招待・パーティー・オンライン状態を消す */
  forget(userId) {
    this.leaveParty(userId);
    for (const [id, inv] of this.invites) if (inv.from === userId || inv.to === userId) this.invites.delete(id);
    this.presence.delete(userId);
  }

  // ---- まとめ ----
  /** 画面が定期的に読むもの。呼ぶと「オンライン」になる */
  state(me) {
    this.requireMember(me);
    this.touch(me);
    this.sweep();
    const rows = this.db.all("SELECT * FROM friendships WHERE (user_a = ? OR user_b = ?) AND status IN ('accepted','pending')", me, me);
    const other = (r) => (r.user_a === me ? r.user_b : r.user_a);
    const friends = rows.filter((r) => r.status === 'accepted').map((r) => ({ ...this.card(other(r)), status: this.statusOf(other(r), me) })).filter((f) => f.userId)
      .sort((x, y) => (x.status === 'online' || x.status === 'in_match' ? 0 : 1) - (y.status === 'online' || y.status === 'in_match' ? 0 : 1) || x.name.localeCompare(y.name));
    const pend = (mine) => rows.filter((r) => r.status === 'pending' && (r.requested_by === me) === mine).map((r) => ({ ...this.card(other(r)), at: r.updated_at })).filter((c) => c.userId);
    const blocked = this.db.all('SELECT blocked_id FROM blocks WHERE blocker_id = ? ORDER BY created_at DESC', me).map((r) => this.card(r.blocked_id)).filter(Boolean);
    const invites = [...this.invites.values()].filter((i) => i.to === me && !this.blockedEither(me, i.from))
      .map((i) => ({ id: i.id, kind: i.kind, at: i.at, from: this.card(i.from) })).filter((i) => i.from);
    return {
      code: this.code(me), settings: this.settings(me), friends, incoming: pend(false), outgoing: pend(true), blocked, invites,
      party: this.partyView(this.parties.get(this.partyOf.get(me)), me),
    };
  }
}
