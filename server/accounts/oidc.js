// Google / Apple の OAuth 2.0 認可コードフロー（OpenID Connect）。独自の認証方式は作らない。
// - state・nonce・PKCE（Google）を使い、ID トークンの署名・発行元・宛先・期限・nonce をサーバーで検証する
// - 設定は環境変数（秘密鍵はリポジトリに入れない）。足りない会社は「未設定」として、使えないと伝える
import { createHash, createPublicKey, createPrivateKey, randomBytes, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';
import { readFileSync } from 'node:fs';

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const rand = (n = 24) => randomBytes(n).toString('base64url');

export const PROVIDER_DEFAULTS = {
  google: {
    authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
    scope: 'openid',
    pkce: true,
  },
  apple: {
    authEndpoint: 'https://appleid.apple.com/auth/authorize',
    tokenEndpoint: 'https://appleid.apple.com/auth/token',
    jwksUri: 'https://appleid.apple.com/auth/keys',
    issuers: ['https://appleid.apple.com'],
    scope: 'openid', // メールや名前は要求しない（個人情報を預からない）
    pkce: false,
  },
};

/** 環境変数から読む。足りないものは入れない */
export function providersFromEnv(env = process.env) {
  const out = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    out.google = { ...PROVIDER_DEFAULTS.google, clientId: env.GOOGLE_CLIENT_ID, clientSecret: () => env.GOOGLE_CLIENT_SECRET };
  }
  if (env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && (env.APPLE_PRIVATE_KEY || env.APPLE_PRIVATE_KEY_PATH)) {
    const pem = env.APPLE_PRIVATE_KEY ? env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n') : readFileSync(env.APPLE_PRIVATE_KEY_PATH, 'utf8');
    out.apple = {
      ...PROVIDER_DEFAULTS.apple,
      clientId: env.APPLE_CLIENT_ID,
      clientSecret: () => appleClientSecret({ teamId: env.APPLE_TEAM_ID, keyId: env.APPLE_KEY_ID, clientId: env.APPLE_CLIENT_ID, pem }),
    };
  }
  return out;
}

/** Apple は client_secret を ES256 の JWT で作る（短い有効期限で毎回作る） */
export function appleClientSecret({ teamId, keyId, clientId, pem, now = Date.now() }) {
  const iat = Math.floor(now / 1000);
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss: teamId, iat, exp: iat + 300, aud: 'https://appleid.apple.com', sub: clientId }));
  const sig = cryptoSign('sha256', Buffer.from(`${head}.${body}`), { key: createPrivateKey(pem), dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64url(sig)}`;
}

export class Oidc {
  /**
   * @param {object} providers { google?: {...}, apple?: {...} }
   * @param {object} o
   * @param {string} o.redirectBase 例 https://game.example.com（末尾の / なし）
   */
  constructor(providers, { redirectBase = '', fetchImpl = fetch, now = () => Date.now() } = {}) {
    this.providers = providers;
    this.redirectBase = redirectBase;
    this.fetch = fetchImpl;
    this.now = now;
    this.jwks = new Map(); // provider → { keys, at }
  }

  available() { return { google: !!this.providers.google, apple: !!this.providers.apple }; }
  redirectUri(provider) { return `${this.redirectBase}/api/auth/oauth/callback/${provider}`; }

  /** 認証画面の URL と、サーバーに残す値を作る */
  begin(provider) {
    const p = this.providers[provider];
    if (!p) return null;
    if (!this.redirectBase) return null;
    const state = rand(24);
    const nonce = rand(18);
    const verifier = rand(32);
    const q = new URLSearchParams({
      response_type: 'code', client_id: p.clientId, redirect_uri: this.redirectUri(provider),
      scope: p.scope, state, nonce,
    });
    if (p.pkce) { q.set('code_challenge', b64url(createHash('sha256').update(verifier).digest())); q.set('code_challenge_method', 'S256'); }
    return { url: `${p.authEndpoint}?${q}`, state, nonce, verifier };
  }

  /** コードを ID トークンに換えて検証し、{ subject } を返す。失敗したら例外 */
  async finish(provider, { code, nonce, verifier }) {
    const p = this.providers[provider];
    if (!p) throw new Error('provider');
    const form = new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: this.redirectUri(provider),
      client_id: p.clientId, client_secret: p.clientSecret(),
    });
    if (p.pkce) form.set('code_verifier', verifier);
    const res = await this.fetch(p.tokenEndpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: form, signal: AbortSignal.timeout(10_000),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.id_token) throw new Error('token');
    const claims = await this.verifyIdToken(provider, json.id_token, nonce);
    return { subject: claims.sub };
  }

  async keysFor(provider, force = false) {
    const cached = this.jwks.get(provider);
    if (cached && !force && this.now() - cached.at < 60 * 60 * 1000) return cached.keys;
    const res = await this.fetch(this.providers[provider].jwksUri, { signal: AbortSignal.timeout(10_000) });
    const json = await res.json();
    if (!res.ok || !Array.isArray(json?.keys)) throw new Error('jwks');
    this.jwks.set(provider, { keys: json.keys, at: this.now() });
    return json.keys;
  }

  async verifyIdToken(provider, token, nonce) {
    const p = this.providers[provider];
    const parts = typeof token === 'string' ? token.split('.') : [];
    if (parts.length !== 3) throw new Error('jwt');
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (header.alg !== 'RS256') throw new Error('alg'); // none や HS256 は受け付けない
    let key = (await this.keysFor(provider)).find((k) => k.kid === header.kid);
    if (!key) key = (await this.keysFor(provider, true)).find((k) => k.kid === header.kid);
    if (!key) throw new Error('kid');
    const ok = cryptoVerify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`),
      createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
    if (!ok) throw new Error('signature');
    const nowSec = Math.floor(this.now() / 1000);
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!p.issuers.includes(claims.iss)) throw new Error('iss');
    if (!aud.includes(p.clientId)) throw new Error('aud');
    if (!Number.isFinite(claims.exp) || claims.exp < nowSec - 60) throw new Error('exp');
    if (Number.isFinite(claims.iat) && claims.iat > nowSec + 300) throw new Error('iat');
    if (claims.nonce !== nonce) throw new Error('nonce');
    if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) throw new Error('sub');
    return claims;
  }
}
