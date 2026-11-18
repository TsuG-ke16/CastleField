// アカウント関係の HTTP の口。サーバー（server.js）から createAccountRoutes() の handle を呼ぶ。
// 守ること：
// - ログイン状態は HttpOnly の Cookie（SameSite=Lax。HTTPS なら Secure と __Host- 付き）。JS からは読めない
// - 書き込みは CSRF 対策：セッションごとの値を X-CF-CSRF ヘッダーで送り、Origin も確かめる。CORS は許さない
// - 回数の制限（IP ごと）、本文の大きさ制限
import { Accounts, AccountError, safeEqual } from './accounts.js';
import { Oidc, providersFromEnv } from './oidc.js';
import { RateLimiter } from './ratelimit.js';

export const ACCOUNT_PREFIXES = ['/api/me', '/api/auth/', '/api/account/', '/api/decks', '/api/profile/', '/healthz'];
const isAccountPath = (p) => ACCOUNT_PREFIXES.some((x) => p === x || (x.endsWith('/') && p.startsWith(x)) || p.startsWith(`${x}/`));

const AUTH_ERRORS = {
  denied: '認証がキャンセルされました',
  state: '認証の有効期限が切れました。もう一度試してください',
  failed: '認証に失敗しました。もう一度試してください',
  linked: 'このアカウントは、別のキャッスルフィールドのアカウントに連携済みです',
};

export function createAccountRoutes({ db, cards = null, env = process.env, oidc = null, accounts = null, limiter = new RateLimiter(), now = () => Date.now(), log = console, readJson }) {
  const acc = accounts ?? new Accounts(db, { cards, now });
  const publicUrl = (env.CF_PUBLIC_URL ?? '').replace(/\/+$/, '');
  const trustProxy = env.CF_TRUST_PROXY === '1';
  const forceSecure = env.CF_SECURE_COOKIES === '1' || publicUrl.startsWith('https://');
  const idp = oidc ?? new Oidc(providersFromEnv(env), { redirectBase: publicUrl });
  const purger = setInterval(() => { try { acc.purge(); } catch (e) { log.error('purge', e); } }, 10 * 60 * 1000);
  purger.unref();

  const isSecure = (req) => forceSecure || !!req.socket.encrypted || (trustProxy && req.headers['x-forwarded-proto'] === 'https');
  const cookieName = (req) => (isSecure(req) ? '__Host-cf_sid' : 'cf_sid');
  const ipOf = (req) => (trustProxy && String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()) || req.socket.remoteAddress || '?';

  function readCookie(req) {
    const name = cookieName(req);
    for (const part of String(req.headers.cookie ?? '').split(';')) {
      const i = part.indexOf('=');
      if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
    }
    return null;
  }
  const cookieHeader = (req, value, maxAgeSec) =>
    `${cookieName(req)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${isSecure(req) ? '; Secure' : ''}`;

  function send(req, res, status, body, extraHeaders = {}) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders,
    });
    res.end(JSON.stringify(body));
  }
  const fail = (req, res, status, reason, extra = {}, headers = {}) => send(req, res, status, { ok: false, reason, ...extra }, headers);

  function sameOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return true; // ブラウザ以外（テスト・curl）。Cookie があっても CSRF の値が要る
    try { return new URL(origin).host === req.headers.host; } catch { return false; }
  }

  function meBody(session, req, extra = {}) {
    return {
      ok: true,
      user: session ? acc.publicUser(session.userId) : null,
      csrf: session?.csrf ?? null,
      providers: idp.available(),
      oauthReady: !!publicUrl,
      secure: isSecure(req),
      ...extra,
    };
  }

  /** @returns {boolean} このリクエストを処理したか */
  async function handle(req, res, url) {
    const path = url.pathname;
    if (!isAccountPath(path)) return false;
    try {
      if (path === '/healthz') {
        db.get('SELECT 1');
        send(req, res, 200, { ok: true });
        return true;
      }
      if (req.method === 'OPTIONS') { fail(req, res, 405, 'このAPIは同じサイトからだけ使えます'); return true; }
      const rl = limiter.check(`${ipOf(req)}:${path.startsWith('/api/auth/') ? 'auth' : 'api'}`, path.startsWith('/api/auth/') ? 30 : 240, 60_000);
      if (!rl.ok) { fail(req, res, 429, '操作が多すぎます。少し待ってください', {}, { 'Retry-After': String(rl.retryAfterSec) }); return true; }

      const token = readCookie(req);
      const session = token ? acc.getSession(token) : null;
      const mutating = req.method !== 'GET' && req.method !== 'HEAD';

      // OAuth の戻り先（外部サイトから来るので CSRF の値は使えない。state で守る）
      const cb = /^\/api\/auth\/oauth\/callback\/(google|apple)$/.exec(path);
      if (cb && req.method === 'GET') { await oauthCallback(req, res, url, cb[1]); return true; }

      if (mutating) {
        if (!sameOrigin(req)) { fail(req, res, 403, '送り元が正しくありません'); return true; }
        if (req.headers['x-cf-client'] !== '1') { fail(req, res, 403, 'このAPIは画面から使ってください'); return true; }
        const needCsrf = !(req.method === 'POST' && path === '/api/auth/guest' && !session);
        if (needCsrf && !(session && safeEqual(req.headers['x-cf-csrf'] ?? '', session.csrf))) {
          fail(req, res, 403, session ? '画面を読み込み直してください（確認の値が違います）' : 'ログインしていません', { code: session ? 'csrf' : 'noSession' });
          return true;
        }
      }

      if (req.method === 'GET' && path === '/api/me') { send(req, res, 200, meBody(session, req)); return true; }

      if (req.method === 'POST' && path === '/api/auth/guest') {
        if (session) { send(req, res, 200, meBody(session, req)); return true; }
        const g = acc.startGuest();
        send(req, res, 200, meBody({ userId: g.userId, csrf: g.session.csrf }, req), { 'Set-Cookie': cookieHeader(req, g.session.token, g.session.maxAgeSec) });
        return true;
      }

      // ここから先はログインが要る
      if (!session) { fail(req, res, 401, 'ログインしていません', { code: 'noSession' }); return true; }
      const body = mutating ? await readJson(req) : {};
      if (mutating && (body?.tooLarge || !body || typeof body !== 'object')) { fail(req, res, body?.tooLarge ? 413 : 400, 'JSON で送ってください'); return true; }

      if (req.method === 'POST' && path === '/api/auth/logout') {
        acc.logout(token, session.userId, { confirmGuestLoss: body.confirmGuestLoss === true });
        send(req, res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(req, '', 0) });
        return true;
      }
      if (req.method === 'POST' && path === '/api/auth/oauth/start') {
        const provider = body.provider;
        if (provider !== 'google' && provider !== 'apple') { fail(req, res, 400, '連携先が正しくありません'); return true; }
        const b = idp.begin(provider);
        if (!b) { fail(req, res, 501, publicUrl ? `${provider === 'google' ? 'Google' : 'Apple'}ログインはこのサーバーでは設定されていません` : 'サーバーの公開URL（CF_PUBLIC_URL）が設定されていません', { code: 'notConfigured' }); return true; }
        acc.saveOAuthState({ state: b.state, provider, nonce: b.nonce, verifier: b.verifier, userId: session.userId });
        send(req, res, 200, { ok: true, url: b.url });
        return true;
      }
      if (req.method === 'POST' && path === '/api/auth/link/resolve') {
        const out = acc.resolveConflict(session.userId, body.id, body.action);
        if (out.session) {
          send(req, res, 200, { ok: true, result: out.result }, { 'Set-Cookie': cookieHeader(req, out.session.token, out.session.maxAgeSec) });
        } else send(req, res, 200, { ok: true, result: out.result });
        return true;
      }
      if (req.method === 'POST' && path === '/api/account/delete') {
        if (body.confirm !== 'delete') { fail(req, res, 400, '確認の文字が正しくありません'); return true; }
        acc.deleteAccount(session.userId);
        send(req, res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(req, '', 0) });
        return true;
      }
      if (req.method === 'POST' && path === '/api/profile/name') {
        const name = acc.rename(session.userId, body.name);
        send(req, res, 200, { ok: true, displayName: name });
        return true;
      }
      if (req.method === 'GET' && path === '/api/decks') { send(req, res, 200, { ok: true, ...acc.getDecks(session.userId) }); return true; }
      if (req.method === 'PUT' && path === '/api/decks') {
        const base = Number.isInteger(body.baseRevision) ? body.baseRevision : null;
        send(req, res, 200, { ok: true, ...acc.putDecks(session.userId, body, base) });
        return true;
      }
      if (req.method === 'POST' && path === '/api/decks/import') {
        send(req, res, 200, { ok: true, ...acc.importDecks(session.userId, body) });
        return true;
      }
      fail(req, res, 404, 'ありません');
      return true;
    } catch (err) {
      if (err instanceof AccountError) { fail(req, res, err.status, err.reason, err.extra); return true; }
      log.error('accounts', err);
      if (!res.headersSent) fail(req, res, 500, 'サーバーでエラーが起きました');
      return true;
    }
  }

  async function oauthCallback(req, res, url, provider) {
    const back = (q, headers = {}) => {
      res.writeHead(303, { Location: `/?${new URLSearchParams(q)}`, 'Cache-Control': 'no-store', ...headers });
      res.end();
    };
    const row = acc.takeOAuthState(url.searchParams.get('state'), provider);
    if (!row) return back({ auth: 'error', why: 'state' });
    if (url.searchParams.get('error')) return back({ auth: 'error', why: 'denied' });
    const code = url.searchParams.get('code');
    if (!code || code.length > 2000) return back({ auth: 'error', why: 'failed' });
    let subject;
    try {
      ({ subject } = await idp.finish(provider, { code, nonce: row.nonce, verifier: row.verifier }));
    } catch (err) {
      log.error('oauth', provider, err?.message);
      return back({ auth: 'error', why: 'failed' });
    }
    try {
      const out = acc.completeOAuth({ provider, subject, intentUserId: row.user_id });
      if (out.result === 'conflict') {
        // 元のログイン状態（ゲスト）はそのまま。確認の画面で選んでもらう
        return back({ auth: 'conflict', id: out.conflictId });
      }
      return back({ auth: out.result }, { 'Set-Cookie': cookieHeader(req, out.session.token, out.session.maxAgeSec) });
    } catch (err) {
      if (err instanceof AccountError) return back({ auth: 'error', why: 'linked' });
      log.error('oauth', err);
      return back({ auth: 'error', why: 'failed' });
    }
  }

  return { handle, accounts: acc, authErrors: AUTH_ERRORS, close: () => clearInterval(purger) };
}
