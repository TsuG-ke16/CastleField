// ランクマッチの待ち行列（メモリだけ。サーバーを再起動すると待ち行列は空になる。成立済みの試合は部屋ごと消えるので、画面は「もう一度探す」に戻る）。
// - MMR が近い人どうしを組み合わせる。待つほど探す範囲が広がる（baseRange → maxRange）。タイムアウトしたら案内を返す
// - 同じユーザーは1つの行列・1つの試合にしか入れない
// - 成立したら、サーバーが部屋・対戦 ID・席の鍵を決める。鍵は本人にだけ status で返す
export class Matchmaker {
  /**
   * @param {object} o
   * @param {object} o.cfg ranks.json の matchmaking
   * @param {(userId: string) => number} o.mmrOf
   * @param {(a: {userId:string}, b: {userId:string}) => { roomId: string, matchId: string, seats: Record<string, {token: string, playerId: string}> }} o.createMatch
   */
  constructor({ cfg, mmrOf, createMatch, now = () => Date.now() }) {
    Object.assign(this, { cfg, mmrOf, createMatch, now });
    /** @type {Map<string, {userId: string, mmr: number, joinedAt: number, modeId: string}>} */
    this.queue = new Map();
    /** 成立した試合・タイムアウトの知らせ（userId → { state, ... }） */
    this.results = new Map();
    this.timer = setInterval(() => this.tick(), cfg.tickMs);
    this.timer.unref();
  }

  close() { clearInterval(this.timer); }

  rangeFor(entry, t = this.now()) {
    const c = this.cfg;
    return Math.min(c.maxRange, c.baseRange + Math.floor((t - entry.joinedAt) / c.stepMs) * c.expandPerStep);
  }

  join(userId, modeId = 'kingdom') {
    this.sweepResults();
    const done = this.results.get(userId);
    if (done?.state === 'matched') return { ok: false, reason: 'すでに試合が成立しています', ...this.status(userId) };
    if (done) this.results.delete(userId); // 古いタイムアウトの知らせは捨てて、探し直す
    if (!this.queue.has(userId)) this.queue.set(userId, { userId, mmr: this.mmrOf(userId, modeId), joinedAt: this.now(), modeId });
    this.tick();
    return { ok: true, ...this.status(userId) };
  }

  leave(userId) {
    if (this.results.get(userId)?.state === 'matched') return { ok: false, reason: 'すでに試合が成立しています' };
    this.results.delete(userId);
    this.queue.delete(userId);
    return { ok: true, state: 'idle' };
  }

  status(userId) {
    this.tick();
    const r = this.results.get(userId);
    if (r?.state === 'matched') return { state: 'matched', roomId: r.roomId, matchId: r.matchId, token: r.token, playerId: r.playerId };
    if (r?.state === 'timeout') { this.results.delete(userId); return { state: 'timeout' }; } // 1回だけ伝える
    const q = this.queue.get(userId);
    if (q) return { state: 'queued', waitedMs: this.now() - q.joinedAt, range: this.rangeFor(q), timeoutMs: this.cfg.timeoutMs };
    return { state: 'idle' };
  }

  /** 試合が終わった（部屋の結果が記録された）ので、成立済みの記録を消す */
  finished(matchId) {
    for (const [u, r] of this.results) if (r.state === 'matched' && r.matchId === matchId) this.results.delete(u);
  }

  sweepResults() {
    const t = this.now();
    for (const [u, r] of this.results) if (t - r.at > this.cfg.resultKeepMs) this.results.delete(u);
  }

  tick() {
    const t = this.now();
    for (const [u, q] of this.queue) {
      if (t - q.joinedAt > this.cfg.timeoutMs) { this.queue.delete(u); this.results.set(u, { state: 'timeout', at: t }); }
    }
    const waiting = [...this.queue.values()].sort((x, y) => x.joinedAt - y.joinedAt);
    const taken = new Set();
    for (const a of waiting) {
      if (taken.has(a.userId)) continue;
      let best = null;
      for (const b of waiting) {
        if (b === a || taken.has(b.userId) || b.modeId !== a.modeId) continue;
        const diff = Math.abs(a.mmr - b.mmr);
        // 長く待っている側の許す範囲まで広げる
        if (diff <= Math.max(this.rangeFor(a, t), this.rangeFor(b, t)) && (!best || diff < best.diff)) best = { b, diff };
      }
      if (!best) continue;
      taken.add(a.userId); taken.add(best.b.userId);
      this.queue.delete(a.userId); this.queue.delete(best.b.userId);
      try {
        const m = this.createMatch(a, best.b);
        for (const x of [a, best.b]) this.results.set(x.userId, { state: 'matched', at: t, roomId: m.roomId, matchId: m.matchId, ...m.seats[x.userId] });
      } catch (err) {
        console.error('createMatch', err);
        for (const x of [a, best.b]) this.queue.set(x.userId, x); // 作れなかったら、待ち行列に戻す
      }
    }
  }
}
