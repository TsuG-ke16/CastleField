// 回数の制限（IP ごと・窓ごと。メモリだけ。サーバーを再起動すると数え直し）
export class RateLimiter {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.hits = new Map();
    this.lastSweep = 0;
  }

  /** @returns {{ ok: boolean, retryAfterSec: number }} */
  check(key, limit, windowMs) {
    const t = this.now();
    if (t - this.lastSweep > 60_000) {
      this.lastSweep = t;
      for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
    }
    let h = this.hits.get(key);
    if (!h || h.resetAt <= t) { h = { count: 0, resetAt: t + windowMs }; this.hits.set(key, h); }
    h.count += 1;
    return { ok: h.count <= limit, retryAfterSec: Math.max(1, Math.ceil((h.resetAt - t) / 1000)) };
  }
}
