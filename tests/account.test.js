// アカウント・認証・デッキ保存のテスト。Google/Apple は、テスト用の認証サーバー（本物と同じ手順・署名）で確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameServer, loadData } from '../server/server.js';
import { Db } from '../server/accounts/db.js';
import { Accounts } from '../server/accounts/accounts.js';
import { appleClientSecret } from '../server/accounts/oidc.js';

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

/** テスト用の OIDC 認証サーバー。/token で、nonce を入れた署名つき ID トークンを返す */
async function startIdp({ clientId = 'test-client' } = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
  const codes = new Map(); // code → { sub, nonce }
  const idp = { clientId, forge: null };
  const make = (claims, key = privateKey, alg = 'RS256') => {
    const head = b64({ alg, kid: 'k1', typ: 'JWT' });
    const body = b64(claims);
    const sig = alg === 'none' ? '' : sign('sha256', Buffer.from(`${head}.${body}`), key).toString('base64url');
    return `${head}.${body}.${sig}`;
  };
  const server = createServer((req, res) => {
    if (req.url === '/jwks') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ keys: [jwk] })); }
    if (req.url === '/token') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const f = new URLSearchParams(body);
        const c = codes.get(f.get('code'));
        res.setHeader('Content-Type', 'application/json');
        if (!c || f.get('client_secret') !== 'shh') { res.statusCode = 400; return res.end('{"error":"invalid_grant"}'); }
        codes.delete(f.get('code'));
        const now = Math.floor(Date.now() / 1000);
        const claims = { iss: 'https://accounts.google.com', aud: clientId, sub: c.sub, nonce: c.nonce, iat: now, exp: now + 600, ...(idp.forge?.claims ?? {}) };
        res.end(JSON.stringify({ id_token: idp.forge?.token ?? make(claims) }));
      });
      return undefined;
    }
    res.statusCode = 404; return res.end();
  });
  await new Promise((r) => server.listen(0, r));
  idp.base = `http://localhost:${server.address().port}`;
  /** ブラウザが認証画面でログインしたことにして、戻り先の URL を作る */
  idp.approve = (authUrl, sub) => {
    const u = new URL(authUrl);
    const code = `code-${Math.random().toString(36).slice(2)}`;
    codes.set(code, { sub, nonce: u.searchParams.get('nonce') });
    return `/api/auth/oauth/callback/google?code=${code}&state=${u.searchParams.get('state')}`;
  };
  idp.make = make; idp.privateKey = privateKey;
  idp.close = () => server.close();
  return idp;
}

async function setup({ dbPath = ':memory:', idp = null } = {}) {
  const providers = idp ? { google: {
    authEndpoint: `${idp.base}/auth`, tokenEndpoint: `${idp.base}/token`, jwksUri: `${idp.base}/jwks`,
    issuers: ['https://accounts.google.com'], scope: 'openid', pkce: true, clientId: idp.clientId, clientSecret: () => 'shh',
  } } : {};
  const { Oidc } = await import('../server/accounts/oidc.js');
  const server = createGameServer({
    data: loadData(), cpuDelayMs: 0,
    accounts: { dbPath, env: { CF_PUBLIC_URL: 'http://localhost' }, routes: { oidc: new Oidc(providers, { redirectBase: 'http://localhost' }), log: { error() {} } } },
  });
  await new Promise((r) => server.listen(0, r));
  return { server, base: `http://localhost:${server.address().port}` };
}

/** Cookie を覚えるクライアント（ブラウザの代わり） */
function client(base) {
  const c = { cookie: '', csrf: null, base };
  c.req = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, {
      method, redirect: 'manual',
      headers: { 'Content-Type': 'application/json', 'X-CF-Client': '1', ...(c.csrf ? { 'X-CF-CSRF': c.csrf } : {}), ...(c.cookie ? { Cookie: c.cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const s of set) {
      const [pair] = s.split(';');
      if (/Max-Age=0/i.test(s)) c.cookie = ''; else c.cookie = pair;
    }
    c.lastSetCookie = set;
    const ct = res.headers.get('content-type') ?? '';
    const json = ct.includes('json') ? await res.json() : null;
    return { status: res.status, json, headers: res.headers };
  };
  c.guest = async () => { const r = await c.req('POST', '/api/auth/guest', {}); c.csrf = r.json.csrf; return r; };
  c.me = async () => { const r = await c.req('GET', '/api/me'); c.csrf = r.json.csrf ?? c.csrf; return r.json; };
  return c;
}

const deck = (n = 10) => ({ infantry: n, spearman: 4 });
const slots = (...ds) => ({ active: 0, slots: [...ds, null, null, null, null].slice(0, 4).map((d) => d && { name: 'テスト', list: d }) });

/** OAuth を最後まで通す：start → 認証画面 → 戻り先 */
async function oauthLogin(c, idp, sub) {
  const start = await c.req('POST', '/api/auth/oauth/start', { provider: 'google' });
  assert.equal(start.status, 200, JSON.stringify(start.json));
  const back = await c.req('GET', idp.approve(start.json.url, sub));
  assert.equal(back.status, 303);
  await c.me(); // 連携のあとはセッションが作り直される（画面も読み込み直す）
  return new URL(back.headers.get('location'), 'http://x').searchParams;
}

test('ゲスト：作ると Cookie が付き、HttpOnly・SameSite、CSRF の値が返る', async () => {
  const { server, base } = await setup();
  const c = client(base);
  assert.equal((await c.me()).user, null);
  const r = await c.guest();
  assert.equal(r.json.user.kind, 'guest');
  assert.match(r.json.user.displayName, /^ゲスト\d{4}$/);
  assert.ok(r.json.csrf);
  assert.match(c.lastSetCookie[0], /HttpOnly/);
  assert.match(c.lastSetCookie[0], /SameSite=Lax/);
  assert.doesNotMatch(c.lastSetCookie[0], /Secure/); // http のとき
  assert.equal((await c.me()).user.id, r.json.user.id);
  server.close();
});

test('ゲスト：HTTPS（公開URLが https）なら Secure と __Host- が付く', async () => {
  const server = createGameServer({ data: loadData(), accounts: { dbPath: ':memory:', env: { CF_PUBLIC_URL: 'https://game.example.com' } } });
  await new Promise((r) => server.listen(0, r));
  const res = await fetch(`http://localhost:${server.address().port}/api/auth/guest`, { method: 'POST', headers: { 'X-CF-Client': '1', 'Content-Type': 'application/json' }, body: '{}' });
  const cookie = res.headers.getSetCookie()[0];
  assert.match(cookie, /^__Host-cf_sid=/);
  assert.match(cookie, /; Secure/);
  server.close();
});

test('CSRF：確認の値がない・違う・別の送り元なら書き込めない', async () => {
  const { server, base } = await setup();
  const c = client(base);
  await c.guest();
  const good = c.csrf;
  c.csrf = null;
  assert.equal((await c.req('PUT', '/api/decks', slots(deck()))).status, 403);
  c.csrf = 'wrong';
  assert.equal((await c.req('PUT', '/api/decks', slots(deck()))).status, 403);
  c.csrf = good;
  assert.equal((await c.req('PUT', '/api/decks', slots(deck()), { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await c.req('PUT', '/api/decks', slots(deck()), { 'X-CF-Client': '0' })).status, 403);
  assert.equal((await c.req('PUT', '/api/decks', slots(deck()))).status, 200);
  // CORS は許さない
  const pre = await fetch(`${base}/api/me`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
  assert.equal(pre.status, 405);
  assert.equal(pre.headers.get('access-control-allow-origin'), null);
  server.close();
});

test('ログアウト：ゲストは確認が要る。ログアウト後は古い Cookie が使えない', async () => {
  const { server, base } = await setup();
  const c = client(base);
  await c.guest();
  const old = c.cookie;
  assert.equal((await c.req('POST', '/api/auth/logout', {})).status, 409);
  assert.equal((await c.req('POST', '/api/auth/logout', { confirmGuestLoss: true })).status, 200);
  assert.equal(c.cookie, '');
  c.cookie = old; // 盗まれた Cookie を使っても
  assert.equal((await c.me()).user, null);
  server.close();
});

test('セッション：期限（絶対・放置）が切れると使えない', () => {
  const db = new Db(':memory:');
  let t = 1_000_000;
  const acc = new Accounts(db, { now: () => t, sessionAbsoluteMs: 1000 * 60 * 60 * 24, sessionIdleMs: 1000 * 60 * 60 });
  const { session } = acc.startGuest();
  assert.ok(acc.getSession(session.token));
  t += 1000 * 60 * 59; assert.ok(acc.getSession(session.token)); // 使うと放置の時計が戻る
  t += 1000 * 60 * 59; assert.ok(acc.getSession(session.token));
  t += 1000 * 60 * 61; assert.equal(acc.getSession(session.token), null); // 放置
  const g2 = acc.startGuest();
  t += 1000 * 60 * 30; for (let i = 0; i < 60; i++) { t += 1000 * 60 * 30; acc.getSession(g2.session.token); }
  assert.equal(acc.getSession(g2.session.token), null); // 絶対の期限
  db.close();
});

test('デッキ：保存・取得・検証（知らないカード・不正な枚数・形）', async () => {
  const { server, base } = await setup();
  const c = client(base);
  await c.guest();
  const put = await c.req('PUT', '/api/decks', slots(deck(), { infantry: 5 }));
  assert.equal(put.json.slots[0].list.infantry, 10);
  assert.equal(put.json.slots[1].list.infantry, 5);
  assert.equal((await c.req('GET', '/api/decks')).json.slots[1].name, 'テスト');
  for (const bad of [slots({ nosuchcard: 1 }), slots({ infantry: 0 }), slots({ infantry: 1.5 }), slots({ infantry: 'x' }), { active: 0, slots: 'x' }, { active: 0, slots: [{ name: '', list: { infantry: 1 } }] }]) {
    assert.equal((await c.req('PUT', '/api/decks', bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await c.req('GET', '/api/decks')).json.slots[0].list.infantry, 10); // 失敗しても元のまま
  server.close();
});

test('デッキ：ほかの端末が先に変えていたら 409（上書きで消さない）', async () => {
  const { server, base } = await setup();
  const c = client(base);
  await c.guest();
  const r1 = (await c.req('PUT', '/api/decks', slots(deck()))).json;
  await c.req('PUT', '/api/decks', { ...slots(deck(8)), baseRevision: r1.revision }); // 別の端末
  const stale = await c.req('PUT', '/api/decks', { ...slots(deck(3)), baseRevision: r1.revision });
  assert.equal(stale.status, 409);
  assert.equal((await c.req('GET', '/api/decks')).json.slots[0].list.infantry, 8);
  server.close();
});

test('端末のデッキの取り込み：空いている枠にだけ入る。何度送っても同じ', async () => {
  const { server, base } = await setup();
  const c = client(base);
  await c.guest();
  await c.req('PUT', '/api/decks', slots(deck(7)));
  const local = { active: 1, slots: [{ name: '古い端末', list: { knight: 2 } }, { name: '端末の2枠目', list: { spearman: 3 } }, null, null] };
  const a = await c.req('POST', '/api/decks/import', local);
  assert.equal(a.json.slots[0].list.infantry, 7); // 持っているデッキは消えない
  assert.deepEqual(a.json.slots.map((d) => d?.name ?? null), ['テスト', '古い端末', '端末の2枠目', null]); // 空き枠へ順に入る
  assert.equal(a.json.imported, true);
  const b = await c.req('POST', '/api/decks/import', local);
  assert.equal(b.json.imported, false);
  assert.deepEqual(b.json.slots, a.json.slots);
  server.close();
});

test('端末のデッキの取り込み：同時に何度送られても1回ぶんだけ', async () => {
  const { server, base } = await setup();
  const c = client(base);
  await c.guest();
  const local = { active: 0, slots: [{ name: 'A', list: { infantry: 3 } }, null, null, null] };
  const rs = await Promise.all(Array.from({ length: 8 }, () => c.req('POST', '/api/decks/import', local)));
  assert.ok(rs.every((r) => r.status === 200));
  const d = (await c.req('GET', '/api/decks')).json;
  assert.equal(d.slots.filter(Boolean).length, 1);
  server.close();
});

test('Google：ゲストに連携すると、ゲストのデッキを持ったまま member になる。別端末でログインすると同じデッキ', async () => {
  const idp = await startIdp();
  const { server, base } = await setup({ idp });
  const phone = client(base);
  await phone.guest();
  const id = (await phone.me()).user.id;
  await phone.req('PUT', '/api/decks', slots(deck(9)));
  const q = await oauthLogin(phone, idp, 'google-sub-1');
  assert.equal(q.get('auth'), 'linked');
  const me = await phone.me();
  assert.equal(me.user.kind, 'member');
  assert.equal(me.user.id, id); // 同じユーザー（データ消失・重複登録なし）
  assert.deepEqual(me.user.providers, ['google']);
  assert.equal((await phone.req('GET', '/api/decks')).json.slots[0].list.infantry, 9);

  const pc = client(base); // 別端末：ゲストを作らず、そのままログイン
  const q2 = await oauthLogin({ ...pc, req: async (m, p, b) => { const r = await pc.req(m, p, b); return r; } }, idp, 'google-sub-1').catch(() => null);
  assert.equal(q2, null); // ログインしていないと start は使えない（連携は「ログイン済み」から）
  await pc.guest();
  const q3 = await oauthLogin(pc, idp, 'google-sub-1'); // ゲストに引き継ぐものがなければ確認なしで切りかわる
  assert.equal(q3.get('auth'), 'logged-in');
  assert.equal((await pc.me()).user.id, id);
  assert.equal((await pc.req('GET', '/api/decks')).json.slots[0].list.infantry, 9);
  server.close(); idp.close();
});

test('Google：データのあるゲストが既存アカウントにログインすると確認が出て、切りかえるとデッキが空き枠に移る', async () => {
  const idp = await startIdp();
  const { server, base } = await setup({ idp });
  const a = client(base);
  await a.guest();
  await a.req('PUT', '/api/decks', slots(deck(9)));
  await oauthLogin(a, idp, 'sub-A');
  const accountId = (await a.me()).user.id;

  const b = client(base);
  await b.guest();
  await b.req('PUT', '/api/decks', { active: 0, slots: [{ name: '新しい端末', list: { knight: 2 } }, null, null, null] });
  const q = await oauthLogin(b, idp, 'sub-A');
  assert.equal(q.get('auth'), 'conflict');
  assert.equal((await b.me()).user.kind, 'guest'); // まだ切りかわっていない
  const conflictId = q.get('id');
  // 他人（別のセッション）は解決できない
  const other = client(base); await other.guest();
  assert.equal((await other.req('POST', '/api/auth/link/resolve', { id: conflictId, action: 'switch' })).status, 410);
  assert.equal((await b.req('POST', '/api/auth/link/resolve', { id: conflictId, action: 'switch' })).status, 200);
  assert.equal((await b.me()).user.id, accountId);
  const d = (await b.req('GET', '/api/decks')).json;
  assert.equal(d.slots[0].list.infantry, 9); // もとのデッキは消えない
  assert.equal(d.slots[1].name, '新しい端末');
  assert.equal((await b.req('POST', '/api/auth/link/resolve', { id: conflictId, action: 'switch' })).status, 410); // 1回だけ
  server.close(); idp.close();
});

test('OAuth：state は1回きり・使い回しや偽の state は失敗。ID トークンの偽造・期限切れ・宛先違いは拒否', async () => {
  const idp = await startIdp();
  const { server, base } = await setup({ idp });
  const c = client(base);
  await c.guest();
  const start = await c.req('POST', '/api/auth/oauth/start', { provider: 'google' });
  const path = idp.approve(start.json.url, 'sub-x');
  assert.equal(new URL((await c.req('GET', path)).headers.get('location'), 'http://x').searchParams.get('auth'), 'linked');
  const again = await c.req('GET', path);
  assert.equal(new URL(again.headers.get('location'), 'http://x').searchParams.get('why'), 'state');
  assert.equal(new URL((await c.req('GET', '/api/auth/oauth/callback/google?code=a&state=zzz')).headers.get('location'), 'http://x').searchParams.get('why'), 'state');

  const { privateKey: other } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const now = Math.floor(Date.now() / 1000);
  const good = { iss: 'https://accounts.google.com', aud: 'test-client', sub: 'sub-y', iat: now, exp: now + 600 };
  const names = ['別の鍵で署名', 'alg_none', '期限切れ', '宛先違い', '発行元違い', 'nonce 違い'];
  for (const name of names) {
    const c2 = client(base); await c2.guest();
    const s = await c2.req('POST', '/api/auth/oauth/start', { provider: 'google' });
    const nonce = new URL(s.json.url).searchParams.get('nonce');
    idp.forge = { token: mk2(name, idp, other, nonce, good, now) };
    const r = await c2.req('GET', idp.approve(s.json.url, 'sub-y'));
    assert.equal(new URL(r.headers.get('location'), 'http://x').searchParams.get('why'), 'failed', name);
    assert.equal((await c2.me()).user.kind, 'guest', name);
  }
  idp.forge = null;
  server.close(); idp.close();
});
function mk2(name, idp, other, nonce, good, now) {
  const base = { ...good, nonce };
  if (name === '別の鍵で署名') return idp.make(base, other);
  if (name === 'alg_none') return idp.make(base, null, 'none');
  if (name === '期限切れ') return idp.make({ ...base, exp: now - 3600 });
  if (name === '宛先違い') return idp.make({ ...base, aud: 'someone-else' });
  if (name === '発行元違い') return idp.make({ ...base, iss: 'https://evil.example' });
  return idp.make({ ...base, nonce: 'WRONG' });
}

test('OAuth：連携済みの Google を別のメンバーに連携しようとすると断る', async () => {
  const idp = await startIdp();
  const { server, base } = await setup({ idp });
  const a = client(base); await a.guest(); await oauthLogin(a, idp, 'sub-shared');
  const b = client(base); await b.guest(); await oauthLogin(b, idp, 'sub-other'); // b は member
  const q = await oauthLogin(b, idp, 'sub-shared');
  assert.equal(q.get('why'), 'linked');
  server.close(); idp.close();
});

test('OAuth：未設定のとき・公開URLがないときは、理由つきで断る', async () => {
  const { server, base } = await setup(); // google 未設定
  const c = client(base); await c.guest();
  const r = await c.req('POST', '/api/auth/oauth/start', { provider: 'google' });
  assert.equal(r.status, 501);
  assert.equal(r.json.code, 'notConfigured');
  assert.equal((await c.me()).providers.google, false);
  assert.equal((await c.req('POST', '/api/auth/oauth/start', { provider: 'evil' })).status, 400);
  server.close();
});

test('Apple の client_secret：ES256 の JWT が作れる', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const jwt = appleClientSecret({ teamId: 'TEAM', keyId: 'KEY', clientId: 'com.example', pem, now: 1_700_000_000_000 });
  const [h, p, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'ES256', kid: 'KEY', typ: 'JWT' });
  const claims = JSON.parse(Buffer.from(p, 'base64url'));
  assert.equal(claims.iss, 'TEAM'); assert.equal(claims.sub, 'com.example'); assert.equal(claims.aud, 'https://appleid.apple.com');
  assert.ok(claims.exp - claims.iat <= 300);
  assert.equal(Buffer.from(s, 'base64url').length, 64);
  assert.ok(publicKey);
});

test('アカウント削除：確認が要り、個人データ・セッションが全部消える。ほかの人は無事', async () => {
  const { server, base } = await setup();
  const a = client(base); await a.guest(); await a.req('PUT', '/api/decks', slots(deck()));
  const b = client(base); await b.guest(); await b.req('PUT', '/api/decks', slots(deck(2)));
  const aid = (await a.me()).user.id;
  assert.equal((await a.req('POST', '/api/account/delete', { confirm: 'yes' })).status, 400);
  assert.equal((await a.req('POST', '/api/account/delete', { confirm: 'delete' })).status, 200);
  assert.equal((await a.me()).user, null);
  const db = server.account.accounts.db;
  for (const t of ['users', 'sessions', 'user_decks', 'user_settings', 'identities']) {
    const col = t === 'users' ? 'id' : 'user_id';
    assert.equal(db.get(`SELECT COUNT(*) AS n FROM ${t} WHERE ${col} = ?`, aid).n, 0, t);
  }
  assert.equal(db.all('SELECT detail FROM audit_log').every((r) => !String(r.detail ?? '').includes(aid)), true);
  assert.equal((await b.req('GET', '/api/decks')).json.slots[0].list.infantry, 2);
  server.close();
});

test('名前の変更：1〜16文字。制御文字は空白に', async () => {
  const { server, base } = await setup();
  const c = client(base); await c.guest();
  assert.equal((await c.req('POST', '/api/profile/name', { name: '' })).status, 400);
  assert.equal((await c.req('POST', '/api/profile/name', { name: 'x'.repeat(17) })).status, 400);
  assert.equal((await c.req('POST', '/api/profile/name', { name: ' けいすけ\n' })).json.displayName, 'けいすけ');
  server.close();
});

test('回数の制限：認証APIを短時間に打ちすぎると 429', async () => {
  const { server, base } = await setup();
  let last;
  for (let i = 0; i < 40; i++) last = await fetch(`${base}/api/auth/oauth/callback/google`);
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get('retry-after')) >= 1);
  server.close();
});

test('永続：サーバーを再起動してもデータが残る。バックアップ・復元できる', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cf-db-'));
  try {
    const file = join(dir, 'a.db');
    let { server, base } = await setup({ dbPath: file });
    const c = client(base); await c.guest(); await c.req('PUT', '/api/decks', slots(deck(6)));
    const id = (await c.me()).user.id;
    const backup = server.account.accounts.db.backupTo(join(dir, 'backup.db'));
    server.close();
    ({ server, base } = await setup({ dbPath: file }));
    const c2 = client(base); c2.cookie = c.cookie; c2.csrf = c.csrf; // 再起動後も同じ Cookie
    const me = await c2.me(); // 同じ Cookie でそのまま続けられる
    assert.equal(me.user.id, id);
    assert.equal((await c2.req('GET', '/api/decks')).json.slots[0].list.infantry, 6);
    await c2.req('POST', '/api/account/delete', { confirm: 'delete' });
    server.close();
    const restored = new Db(backup); // 削除前のバックアップには残っている
    assert.equal(restored.get('SELECT COUNT(*) AS n FROM users WHERE id = ?', id).n, 1);
    restored.close();
    const again = new Db(file); // 移行は何度開いても同じ
    assert.equal(again.get('SELECT COUNT(*) AS n FROM schema_migrations').n, 1);
    again.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('アカウント機能を使わない起動（今までどおり）：/api/me は存在しない', async () => {
  const server = createGameServer({ data: loadData(), cpuDelayMs: 0 });
  await new Promise((r) => server.listen(0, r));
  assert.equal((await fetch(`http://localhost:${server.address().port}/api/me`)).status, 404);
  server.close();
});
