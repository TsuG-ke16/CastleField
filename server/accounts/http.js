// アカウント関係の HTTP の口。サーバー（server.js）から createAccountRoutes() の handle を呼ぶ。
// 守ること：
// - ログイン状態は HttpOnly の Cookie（SameSite=Lax。HTTPS なら Secure と __Host- 付き）。JS からは読めない
// - 書き込みは CSRF 対策：セッションごとの値を X-CF-CSRF ヘッダーで送り、Origin も確かめる。CORS は許さない
// - 回数の制限（IP ごと）、本文の大きさ制限
import { Accounts, AccountError, safeEqual, emailKey, normalizeEmail } from './accounts.js';
import { Oidc, providersFromEnv } from './oidc.js';
import { RateLimiter } from './ratelimit.js';
import { Progress } from './progress.js';
import { Ranking } from './ranking.js';
import { Matchmaker } from './matchmaking.js';
import { Social } from './social.js';
import { Economy } from './economy.js';
import { Missions } from './missions.js';
import { exportUserData } from './dataexport.js';
import { checkCostDeck } from '../../js/game/Setup.js';
import { randomInt } from 'node:crypto';

export const ACCOUNT_PREFIXES = ['/api/me', '/api/auth/', '/api/account/', '/api/decks', '/api/profile/', '/api/home', '/api/history', '/api/ranked/', '/api/ranking', '/api/social/', '/api/friends/', '/api/block', '/api/unblock', '/api/invites/', '/api/party/', '/api/shop', '/api/collection', '/api/gacha/', '/api/wallet', '/api/missions', '/api/season/', '/api/modes', '/api/level-rewards'];
const isAccountPath = (p) => ACCOUNT_PREFIXES.some((x) => p === x || (x.endsWith('/') && p.startsWith(x)) || p.startsWith(`${x}/`));

const AUTH_ERRORS = {
  denied: '認証がキャンセルされました',
  state: '認証の有効期限が切れました。もう一度試してください',
  failed: '認証に失敗しました。もう一度試してください',
  linked: 'このGoogleアカウントは、別のキャッスルフィールドのアカウントで使われています',
};

export function createAccountRoutes({ db, cards = null, env = process.env, oidc = null, accounts = null, progression, profile, ranks, seasons, shop = null, gacha = null, missions: missionsCfg = null, modes: modesCfg = null, data = null, metrics = null, limiter = new RateLimiter(), now = () => Date.now(), log = console, readJson }) {
  const modes = modesCfg ?? { default: 'kingdom', modes: { kingdom: { name: '王国', available: true } } };
  const modeIds = Object.entries(modes.modes).filter(([, m]) => m.available).map(([id]) => id);
  const acc = accounts ?? new Accounts(db, { cards, modeIds, now });
  const publicUrl = (env.CF_PUBLIC_URL ?? '').replace(/\/+$/, '');
  const trustProxy = env.CF_TRUST_PROXY === '1';
  const forceSecure = env.CF_SECURE_COOKIES === '1' || publicUrl.startsWith('https://');
  const progress = new Progress(db, acc, { progression, profile, now });
  const ranking = new Ranking(db, { ranks, seasons, now });
  const economy = shop && gacha ? new Economy({ db, catalog: shop, gacha, now, matchCoins: progression?.matchCoins }) : null;
  progress.ranking = ranking;
  progress.economy = economy;
  const missions = economy && missionsCfg ? new Missions({ db, config: missionsCfg, economy, ranking, seasons: ranking.seasons, now }) : null;
  /** @type {import('../rooms.js').Lobby|null} */
  let lobby = null;
  const social = new Social({ db, accounts: acc, progress, now, isBusy: (u) => !!lobby?.activeSeatOfUser(u) });
  let matchmaker = null;
  /** 部屋の管理（Lobby）とつなぐ：ランクマッチが成立したとき、サーバーが部屋を作る */
  function attachLobby(l) {
    lobby = l;
    matchmaker = new Matchmaker({
      cfg: ranking.cfg.matchmaking, now,
      mmrOf: (u, mode) => ranking.internalMmr(u, mode),
      createMatch: (a, b) => {
        const order = randomInt(2) === 0 ? [a, b] : [b, a]; // 先攻・後攻はランダム
        const users = order.map((x) => ({ userId: x.userId, name: db.get('SELECT display_name AS n FROM users WHERE id = ?', x.userId)?.n ?? '？', deckList: activeDeckList(x.userId) }));
        const made = lobby.createRankedRoom(users, { cfg: ranking.cfg.ranked, modeId: a.modeId, checkMs: env.CF_RANKED_CHECK_MS ? Number(env.CF_RANKED_CHECK_MS) : undefined });
        made.room.onRankedVoid = (room) => matchmaker.finished(room.matchMeta.matchId);
        return made;
      },
    });
  }
  /** 自分のクラウドのデッキ（使っている枠）が、コスト制の決まりに合っていれば使う。合わなければ null（見本のデッキになる） */
  function activeDeckList(userId) {
    if (!data?.rarities) return null;
    const d = acc.getDecks(userId);
    const slot = d.slots[d.active];
    if (!slot) return null;
    return checkCostDeck(slot.list, data.cards, data.rarities, data.rules).ok ? slot.list : null;
  }
  const idp = oidc ?? new Oidc(providersFromEnv(env), { redirectBase: publicUrl });
  const purger = setInterval(() => { try { acc.purge(); } catch (e) { log.error('purge', { err: e }); } }, 10 * 60 * 1000);
  purger.unref();

  const emailKeyOrNull = (email) => { try { return emailKey(normalizeEmail(email)); } catch { return null; } };
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
      if (req.method === 'OPTIONS') { fail(req, res, 405, 'このAPIは同じサイトからだけ使えます'); return true; }
      const rl = limiter.check(`${ipOf(req)}:${path.startsWith('/api/auth/') ? 'auth' : 'api'}`, path.startsWith('/api/auth/') ? 30 : 240, 60_000);
      if (!rl.ok) { fail(req, res, 429, '操作が多すぎます。少し待ってください', {}, { 'Retry-After': String(rl.retryAfterSec) }); return true; }

      const token = readCookie(req);
      const session = token ? acc.getSession(token) : null;
      const mutating = req.method !== 'GET' && req.method !== 'HEAD';

      // OAuth の戻り先（外部サイトから来るので CSRF の値は使えない。state で守る）
      const cb = /^\/api\/auth\/oauth\/callback\/(google)$/.exec(path);
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
        if (provider !== 'google') { fail(req, res, 400, 'ログイン方法が正しくありません'); return true; }
        const b = idp.begin(provider);
        if (!b) { fail(req, res, 501, publicUrl ? 'Googleログインはこのサーバーでは設定されていません' : 'サーバーの公開URL（CF_PUBLIC_URL）が設定されていません', { code: 'notConfigured' }); return true; }
        acc.saveOAuthState({ state: b.state, provider, nonce: b.nonce, verifier: b.verifier, userId: session.userId });
        send(req, res, 200, { ok: true, url: b.url });
        return true;
      }
      // メールアドレスとパスワード（確認メールなし）。1つのアドレスへの試行は15分に10回まで（総当たり対策）
      if (req.method === 'POST' && /^\/api\/auth\/email\/(register|login|password)$/.test(path)) {
        const action = path.slice('/api/auth/email/'.length);
        if (action !== 'password') {
          const k = emailKeyOrNull(body.email);
          if (k && !limiter.check(`email:${k}`, 10, 15 * 60_000).ok) { fail(req, res, 429, 'このメールアドレスでの操作が多すぎます。15分ほど待ってください'); return true; }
        }
        const out = action === 'register' ? await acc.registerEmail(session.userId, body.email, body.password)
          : action === 'login' ? await acc.loginEmail(session.userId, body.email, body.password)
            : await acc.changePassword(session.userId, body.current, body.next);
        if (out.result === 'conflict') { send(req, res, 200, { ok: true, result: 'conflict', conflictId: out.conflictId }); return true; }
        send(req, res, 200, { ok: true, result: out.result ?? 'changed' }, { 'Set-Cookie': cookieHeader(req, out.session.token, out.session.maxAgeSec) });
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
        social.forget(session.userId);
        acc.deleteAccount(session.userId);
        send(req, res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(req, '', 0) });
        return true;
      }
      if (req.method === 'POST' && path === '/api/profile/name') {
        const name = acc.rename(session.userId, body.name);
        send(req, res, 200, { ok: true, displayName: name });
        return true;
      }
      if (req.method === 'GET' && path === '/api/home') { const claimable = missions ? Object.values(missions.view(session.userId)).reduce((n, p) => n + p.missions.filter((m) => m.completed && !m.claimed).length, 0) + missions.seasonRewards(session.userId).filter((r) => r.eligible && !r.claimed && r.coins > 0).length : 0;
        send(req, res, 200, { ok: true, ...progress.home(session.userId), claimable, modes: Object.entries(modes.modes).map(([id, m]) => ({ id, name: m.name, available: !!m.available })), defaultMode: modes.default }); return true; }
      if (req.method === 'GET' && path === '/api/profile/me') { send(req, res, 200, { ok: true, profile: progress.profile(session.userId, session.userId) }); return true; }
      const other = /^\/api\/profile\/user\/(u_[0-9a-f]{24})$/.exec(path);
      if (req.method === 'GET' && other) {
        const p = social.blockedEither(session.userId, other[1]) ? null : progress.profile(other[1], session.userId, { isFriend: (a, b) => social.isFriend(a, b) });
        if (!p) fail(req, res, 404, 'プレイヤーが見つかりません'); else send(req, res, 200, { ok: true, profile: p });
        return true;
      }
      if (req.method === 'POST' && path === '/api/profile/settings') {
        progress.updateProfile(session.userId, { icon: body.icon, privacy: body.privacy });
        send(req, res, 200, { ok: true, profile: progress.profile(session.userId, session.userId) });
        return true;
      }
      if (req.method === 'GET' && path === '/api/history') {
        send(req, res, 200, { ok: true, matches: progress.history(session.userId, Number(url.searchParams.get('limit')) || 20, url.searchParams.get('mode')), last: progress.lastMatch(session.userId) });
        return true;
      }
      if (req.method === 'GET' && path === '/api/level-rewards') { send(req, res, 200, { ok: true, rewards: progress.availableRewards(session.userId), coins: progress.getCoins(session.userId) }); return true; }
      if (req.method === 'POST' && path === '/api/level-rewards/claim') { send(req, res, 200, { ok: true, ...progress.claimReward(session.userId, body.level) }); return true; }
      if (path.startsWith('/api/ranked/') || path === '/api/ranking') {
        const out = await rankedRoutes(req, res, url, path, session, body);
        if (out) return true;
      }
      if (/^\/api\/(missions|season|modes)(\/|$)/.test(path) || path === '/api/account/export') {
        const out = metaRoutes(req, res, url, path, session.userId, body);
        if (out) return true;
      }
      if (/^\/api\/(shop|collection|gacha|wallet)(\/|$)/.test(path)) {
        const out = economyRoutes(req, res, url, path, session.userId, body);
        if (out) return true;
      }
      if (/^\/api\/(social|friends|invites|party)\//.test(path) || path === '/api/block' || path === '/api/unblock') {
        const out = socialRoutes(req, res, path, session.userId, body);
        if (out) return true;
      }
      const modeOf = () => acc.checkMode(body.mode ?? url.searchParams.get('mode') ?? modes.default);
      if (req.method === 'GET' && path === '/api/decks') { send(req, res, 200, { ok: true, ...acc.getDecks(session.userId, modeOf()) }); return true; }
      if (req.method === 'PUT' && path === '/api/decks') {
        const base = Number.isInteger(body.baseRevision) ? body.baseRevision : null;
        send(req, res, 200, { ok: true, ...acc.putDecks(session.userId, body, base, modeOf()) });
        return true;
      }
      if (req.method === 'POST' && path === '/api/decks/import') {
        send(req, res, 200, { ok: true, ...acc.importDecks(session.userId, body, modeOf()) });
        return true;
      }
      fail(req, res, 404, 'ありません');
      return true;
    } catch (err) {
      if (err instanceof AccountError) { fail(req, res, err.status, err.reason, err.extra); return true; }
      log.error('accounts', { err });
      if (!res.headersSent) fail(req, res, 500, 'サーバーでエラーが起きました');
      return true;
    }
  }

  /** ミッション・シーズン報酬・モード・データの書き出し */
  function metaRoutes(req, res, url, path, uid, body) {
    const ok = (data = {}) => { send(req, res, 200, { ok: true, ...data }); return true; };
    if (req.method === 'GET' && path === '/api/modes') {
      const mine = {};
      for (const id of modeIds) mine[id] = { stats: progress.stats(uid, id), rank: acc.publicUser(uid).kind === 'member' ? ranking.summary(uid, id) : null };
      return ok({ default: modes.default, modes: Object.entries(modes.modes).map(([id, m]) => ({ id, name: m.name, available: !!m.available, world: m.world, rank: m.rank })), mine });
    }
    if (req.method === 'GET' && path === '/api/account/export') {
      social.rate(uid, 'export', 3, 3600_000, '書き出しは1時間に3回までです');
      const data = exportUserData({ db, accounts: acc, progress, economy, ranking, social, missions, modes: modeIds }, uid);
      send(req, res, 200, data, { 'Content-Disposition': 'attachment; filename="castlefield-my-data.json"' });
      return true;
    }
    if (!missions) { fail(req, res, 503, 'ミッションはこのサーバーでは使えません'); return true; }
    if (req.method === 'GET' && path === '/api/missions') return ok({ periods: missions.view(uid) });
    if (req.method === 'POST' && path === '/api/missions/claim') return ok(missions.claim(uid, body.missionId));
    if (req.method === 'GET' && path === '/api/season/rewards') return ok({ current: ranking.seasonAt(), rewards: missions.seasonRewards(uid, url.searchParams.get('mode') ?? modes.default), tiers: ranking.seasons.rewards ?? {} });
    if (req.method === 'POST' && path === '/api/season/claim') return ok(missions.claimSeason(uid, body.season, body.mode ?? modes.default));
    return false;
  }

  /** ショップ・ガチャ・所持品・装備・通貨（ゲストも使える。連携するとデータは引き継がれる） */
  function economyRoutes(req, res, url, path, uid, body) {
    const ok = (data = {}) => { send(req, res, 200, { ok: true, ...data }); return true; };
    if (!economy) { fail(req, res, 503, 'ショップはこのサーバーでは使えません'); return true; }
    if (req.method === 'GET') {
      if (path === '/api/shop') return ok(economy.shop(uid));
      if (path === '/api/wallet') return ok({ ...economy.balance(uid), ledger: economy.ledger(uid) });
      if (path === '/api/collection') return ok({ owned: economy.ownedIds(uid), equipped: economy.equippedOf(uid), slots: economy.catalog.slots });
      if (path === '/api/gacha/info') return ok(economy.gachaInfo(uid, url.searchParams.get('banner') ?? 'standard'));
      if (path === '/api/gacha/history') return ok({ history: economy.history(uid, Number(url.searchParams.get('limit')) || 30) });
      return false;
    }
    if (req.method !== 'POST') return false;
    switch (path) {
      case '/api/shop/buy': return ok(economy.buy(uid, body.itemId));
      case '/api/collection/equip': return ok({ equipped: economy.equip(uid, body.slot, body.itemId ?? null) });
      case '/api/gacha/pull': return ok(economy.pull(uid, body.banner ?? 'standard', body.count));
      case '/api/gacha/exchange': return ok(economy.exchange(uid, body.itemId, body.banner ?? 'standard'));
      default: return false;
    }
  }

  /** フレンド・ブロック・招待・パーティー（正会員だけ。中でも requireMember で確かめる） */
  function socialRoutes(req, res, path, uid, body) {
    const ok = (data = {}) => { send(req, res, 200, { ok: true, ...data }); return true; };
    if (req.method === 'GET' && path === '/api/social/state') return ok(social.state(uid));
    if (req.method !== 'POST') return false;
    const to = body.userId;
    switch (path) {
      case '/api/social/settings': social.requireMember(uid); return ok({ settings: social.updateSettings(uid, body.settings) });
      case '/api/friends/search': return ok({ results: social.search(uid, body.q) });
      case '/api/friends/request': {
        let target = to;
        if (!target && typeof body.code === 'string') target = db.get('SELECT user_id AS u FROM user_codes WHERE code = ?', body.code.trim().toUpperCase())?.u;
        return ok(social.request(uid, target));
      }
      case '/api/friends/respond': return ok(social.respond(uid, to, body.accept === true));
      case '/api/friends/cancel': return ok(social.cancel(uid, to));
      case '/api/friends/remove': return ok(social.remove(uid, to));
      case '/api/block': return ok(social.block(uid, to));
      case '/api/unblock': return ok(social.unblock(uid, to));
      case '/api/invites/send': return ok(social.inviteToRoom(uid, to));
      case '/api/invites/respond': return ok(social.respondInvite(uid, body.id, body.accept === true));
      case '/api/party/create': return ok({ party: social.createParty(uid) });
      case '/api/party/invite': return ok(social.inviteToParty(uid, to));
      case '/api/party/leave': return ok(social.leaveParty(uid));
      case '/api/party/kick': return ok(social.kick(uid, to));
      case '/api/party/start': return ok(social.startParty(uid));
      default: return false;
    }
  }

  /** ランクマッチ・ランキングの API（正会員だけ。ゲストはランクに参加できない） */
  async function rankedRoutes(req, res, url, path, session, body) {
    const uid = session.userId;
    const user = acc.publicUser(uid);
    if (req.method === 'GET' && path === '/api/ranking') {
      const limit = Number(url.searchParams.get('limit')) || 50;
      const mine = user.kind === 'member' ? ranking.summary(uid) : null;
      send(req, res, 200, { ok: true, season: ranking.seasonAt(), board: ranking.leaderboard({ limit }), me: mine });
      return true;
    }
    if (req.method === 'GET' && path === '/api/ranked/summary') {
      send(req, res, 200, { ok: true, member: user.kind === 'member', season: ranking.seasonAt(), summary: user.kind === 'member' ? ranking.summary(uid) : null, history: ranking.history(uid), best: ranking.bestRank(uid) });
      return true;
    }
    if (req.method === 'GET' && path === '/api/ranked/last') { send(req, res, 200, { ok: true, last: ranking.lastChange(uid) }); return true; }
    if (!matchmaker) { fail(req, res, 503, 'ランクマッチはこのサーバーでは使えません'); return true; }
    if (req.method === 'GET' && path === '/api/ranked/status') { send(req, res, 200, { ok: true, ...matchmaker.status(uid) }); return true; }
    if (req.method === 'POST' && path === '/api/ranked/queue') {
      if (user.kind !== 'member') { fail(req, res, 403, 'ランクマッチは、アカウントを作成すると遊べます（ゲストでは遊べません）', { code: 'needsMember' }); return true; }
      if (lobby.activeSeatOfUser(uid)) { fail(req, res, 409, 'ほかの試合の途中です。終わってから探してください', { code: 'busy' }); return true; }
      const mode = body.mode ?? modes.default;
      if (!modeIds.includes(mode)) { fail(req, res, 400, 'そのモードは、まだ遊べません（準備中です）', { code: 'modeUnavailable' }); return true; }
      const r = matchmaker.join(uid, mode);
      send(req, res, r.ok ? 200 : 409, r.ok ? { ok: true, ...r } : { ok: false, reason: r.reason, ...r });
      return true;
    }
    if (req.method === 'POST' && path === '/api/ranked/leave') { send(req, res, 200, matchmaker.leave(uid)); return true; }
    return false;
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
      log.error('oauth', { provider, err });
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
      log.error('oauth', { err });
      return back({ auth: 'error', why: 'failed' });
    }
  }

  /** 部屋に入るとき：ログイン中なら、そのアカウントの ID（なければ null） */
  const userIdOf = (req) => { const t = readCookie(req); return (t && acc.getSession(t)?.userId) || null; };
  /** 試合が決着したとき（Room から呼ばれる）。結果をアカウントごとに記録する */
  const onMatchEnd = (m) => db.tx(() => {
    const r = progress.recordMatch(m);
    if (r && m.ranked) ranking.applyMatch(m); // レーティングは、同じ試合 ID につき1回だけ・経験値と同じトランザクションで
    if (r) missions?.applyMatch(m, r); // ミッションの進み具合（数える対象になった人だけ）
    if (m.ranked) matchmaker?.finished(m.matchId);
    return r;
  });

  return { handle, userIdOf, onMatchEnd, attachLobby, social, economy, missions, modes, modeIds, cosmeticsOf: (u) => economy?.cosmeticsOf(u) ?? {},
    /** チャットに添える、その人のアイコンとランク（相手にも見える公開の情報だけ）。ゲストはランクなし */
    profileOf: (u) => {
      try {
        const user = acc.publicUser(u);
        if (!user) return null;
        const prow = progress.profileRow(u);
        const rank = progress.rankSummary(u, user)?.rank ?? null;
        return {
          icon: prow.icon, iconImage: progress.iconImage(prow.icon),
          rank: rank ? { tierIndex: rank.tierIndex, division: rank.division, color: rank.color, name: rank.name, divisionLabel: rank.divisionLabel } : null,
        };
      } catch { return null; }
    },
    ranking, get matchmaker() { return matchmaker; }, progress, accounts: acc, authErrors: AUTH_ERRORS, close: () => { clearInterval(purger); matchmaker?.close(); } };
}
