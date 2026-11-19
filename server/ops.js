// 運用：構造化ログ（JSON 1行）・メトリクス・稼働確認・定期のバックアップと掃除。
// 個人情報や秘密を出さない：URL の問い合わせ部分（token など）・ヘッダー・本文・IP は記録しない。
// ユーザーIDは、ログではハッシュの先頭だけ。パスの中のIDは :user などに置きかえて数える。
import { createHash } from 'node:crypto';
import { readdirSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

export class Logger {
  constructor({ level = 'info', out = (line) => process.stdout.write(`${line}\n`), now = () => Date.now() } = {}) {
    this.min = LEVELS[level] ?? LEVELS.info;
    this.out = out;
    this.now = now;
  }

  log(level, msg, fields = {}) {
    if ((LEVELS[level] ?? 20) < this.min) return;
    const line = { t: new Date(this.now()).toISOString(), level, msg, ...fields };
    if (line.err instanceof Error) { line.err = { name: line.err.name, message: String(line.err.message).slice(0, 300), stack: String(line.err.stack ?? '').split('\n').slice(0, 5).join(' | ') }; }
    this.out(JSON.stringify(line));
  }

  debug(m, f) { this.log('debug', m, f); }
  info(m, f) { this.log('info', m, f); }
  warn(m, f) { this.log('warn', m, f); }
  error(m, f) { this.log('error', m, f); }
}

export const userHash = (id) => (id ? createHash('sha256').update(String(id)).digest('hex').slice(0, 10) : null);

/** パスを、数える・記録するための決まった形にする（IDや鍵が入らない） */
export function routeClass(method, path) {
  if (path === '/api/stream') return 'GET /api/stream';
  const clean = path.replace(/u_[0-9a-f]{24}/g, ':user').replace(/\/[A-Za-z0-9_-]{20,}/g, '/:id');
  if (clean.startsWith('/api/') || clean === '/healthz' || clean === '/readyz' || clean === '/metrics') return `${method} ${clean}`;
  return 'static';
}

const BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

export class Metrics {
  constructor() {
    this.requests = new Map(); // "route|status" → 数
    this.latency = new Map(); // route → { count, sum, buckets[] }
    this.counters = new Map(); // 名前 → 数（server.js が ranked_matches などを足す）
    this.gauges = new Map(); // 名前 → () => 数
    this.startedAt = Date.now();
  }

  observe(route, status, seconds) {
    const k = `${route}|${status}`;
    this.requests.set(k, (this.requests.get(k) ?? 0) + 1);
    let l = this.latency.get(route);
    if (!l) { l = { count: 0, sum: 0, buckets: BUCKETS.map(() => 0) }; this.latency.set(route, l); }
    l.count += 1; l.sum += seconds;
    BUCKETS.forEach((b, i) => { if (seconds <= b) l.buckets[i] += 1; });
  }

  inc(name, by = 1) { this.counters.set(name, (this.counters.get(name) ?? 0) + by); }
  gauge(name, fn) { this.gauges.set(name, fn); }

  /** Prometheus のテキスト形式 */
  render() {
    const out = ['# TYPE cf_http_requests_total counter'];
    for (const [k, n] of this.requests) { const [route, status] = k.split('|'); out.push(`cf_http_requests_total{route="${route}",status="${status}"} ${n}`); }
    out.push('# TYPE cf_http_request_seconds histogram');
    for (const [route, l] of this.latency) {
      BUCKETS.forEach((b, i) => out.push(`cf_http_request_seconds_bucket{route="${route}",le="${b}"} ${l.buckets[i]}`));
      out.push(`cf_http_request_seconds_bucket{route="${route}",le="+Inf"} ${l.count}`, `cf_http_request_seconds_sum{route="${route}"} ${l.sum.toFixed(4)}`, `cf_http_request_seconds_count{route="${route}"} ${l.count}`);
    }
    for (const [name, n] of this.counters) out.push(`# TYPE cf_${name} counter`, `cf_${name} ${n}`);
    for (const [name, fn] of this.gauges) { let v = 0; try { v = fn(); } catch { /* 取れなければ 0 */ } out.push(`# TYPE cf_${name} gauge`, `cf_${name} ${v}`); }
    out.push('# TYPE cf_uptime_seconds gauge', `cf_uptime_seconds ${Math.round((Date.now() - this.startedAt) / 1000)}`);
    return `${out.join('\n')}\n`;
  }
}

/**
 * 定期の掃除とバックアップ。
 * - 毎時：期限切れのセッション・認証の途中経過・古いミッションの行・90日より古い監査ログを消す
 * - CF_BACKUP_DIR があれば、CF_BACKUP_INTERVAL_HOURS（既定24）ごとにバックアップを作り、CF_BACKUP_KEEP（既定7）世代だけ残す
 */
export function startMaintenance({ db, accounts, missions = null, log, env = process.env, now = () => Date.now(), tickMs = 3600_000 }) {
  const dir = env.CF_BACKUP_DIR || null;
  const everyMs = Number(env.CF_BACKUP_INTERVAL_HOURS ?? 24) * 3600_000;
  const keep = Math.max(1, Number(env.CF_BACKUP_KEEP ?? 7));
  let lastBackup = 0;
  const run = () => {
    try {
      accounts.purge();
      missions?.purge();
      db.run('DELETE FROM audit_log WHERE at < ?', now() - 90 * 86400_000);
      if (dir && now() - lastBackup >= everyMs) {
        mkdirSync(dir, { recursive: true });
        const file = join(dir, `castlefield-${new Date(now()).toISOString().replace(/[:.]/g, '-')}.db`);
        if (!existsSync(file)) db.backupTo(file);
        lastBackup = now();
        const files = readdirSync(dir).filter((f) => /^castlefield-.*\.db$/.test(f)).sort();
        for (const f of files.slice(0, Math.max(0, files.length - keep))) rmSync(join(dir, f), { force: true });
        log.info('backup', { file: file.split('/').pop(), kept: Math.min(files.length, keep) });
      }
    } catch (err) {
      log.error('maintenance', { err });
    }
  };
  run();
  const timer = setInterval(run, tickMs);
  timer.unref();
  return { run, stop: () => clearInterval(timer) };
}
