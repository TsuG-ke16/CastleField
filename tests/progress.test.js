// プレイヤーレベル・戦績・プロフィール・レベル報酬のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Db } from '../server/accounts/db.js';
import { Accounts } from '../server/accounts/accounts.js';
import { Progress } from '../server/accounts/progress.js';
import { createGameServer, loadData } from '../server/server.js';

function setup() {
  const db = new Db(':memory:');
  const accounts = new Accounts(db);
  const progress = new Progress(db, accounts, loadData().progression ? { progression: loadData().progression, profile: loadData().profile } : {});
  const user = () => accounts.startGuest().userId;
  return { db, accounts, progress, user };
}
const match = (id, seats, extra = {}) => ({ matchId: id, turns: 10, reason: 'castleDestroyed', seats: seats.map((s, i) => ({ seat: i, name: `p${i}`, cpu: null, left: false, ...s })), ...extra });

test('レベル：必要な経験値が段々増え、上限で止まる', () => {
  const { progress } = setup();
  assert.equal(progress.levelInfo(0).level, 1);
  assert.equal(progress.levelInfo(59).level, 1);
  assert.equal(progress.levelInfo(60).level, 2);
  assert.equal(progress.xpToNext(2) > progress.xpToNext(1), true);
  const huge = progress.levelInfo(10 ** 9);
  assert.equal(huge.level, 100); assert.equal(huge.maxed, true);
});

test('試合の記録：勝つと経験値が多い。同じ試合 ID は1回だけ', () => {
  const { progress, user } = setup();
  const a = user(); const b = user();
  const m = match('m1', [{ userId: a, won: true }, { userId: b, won: false }]);
  const r = progress.recordMatch(m);
  assert.equal(r.get(a).xpGained, 35); assert.equal(r.get(b).xpGained, 20);
  assert.equal(progress.recordMatch(m), null); // 二重に付与しない
  assert.equal(progress.getXp(a), 35);
  assert.deepEqual(progress.stats(a), { matches: 1, wins: 1, losses: 0, winRate: 100 });
  assert.equal(progress.stats(b).losses, 1);
});

test('試合の記録：CPU 相手は半分・すぐ終わった/抜けた試合は 0・自分どうしは数えない', () => {
  const { progress, user } = setup();
  const a = user();
  assert.equal(progress.recordMatch(match('cpu', [{ userId: a, won: true }, { won: false, cpu: 'hard' }])).get(a).xpGained, 18); // 35×0.5 を四捨五入
  assert.equal(progress.recordMatch(match('short', [{ userId: a, won: true }, { won: false, cpu: 'easy' }], { turns: 2 })).get(a).xpGained, 0);
  const b = user();
  assert.equal(progress.recordMatch(match('left', [{ userId: a, won: true }, { userId: b, won: false, left: true }])).get(b).xpGained, 0);
  const before = progress.getXp(a);
  const self = progress.recordMatch(match('self', [{ userId: a, won: true }, { userId: a, won: false }]));
  assert.equal(self.size, 0);
  assert.equal(progress.getXp(a), before);
  assert.equal(progress.stats(a).matches, 3); // self は戦績にも入らない
});

test('レベルアップ：結果に leveledUp が出て、報酬は1レベルにつき1回だけ受け取れる', () => {
  const { progress, user, db } = setup();
  const a = user();
  progress.recordMatch(match('x1', [{ userId: a, won: true }, { userId: user(), won: false }]));
  const r2 = progress.recordMatch(match('x2', [{ userId: a, won: true }, { userId: user(), won: false }]));
  assert.equal(r2.get(a).levelAfter, 2); assert.equal(r2.get(a).leveledUp, true);
  assert.deepEqual(progress.availableRewards(a), [{ level: 2, coins: 20 }]);
  assert.throws(() => progress.claimReward(a, 3), /まだ受け取れません/);
  assert.equal(progress.claimReward(a, 2).balance, 20);
  assert.throws(() => progress.claimReward(a, 2), /もう受け取っています/);
  assert.equal(progress.getCoins(a), 20);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM level_rewards WHERE user_id = ?', a).n, 1);
  assert.deepEqual(progress.availableRewards(a), []);
});

test('レベル報酬をまとめて受け取る：受け取っていないレベルを全部・1回だけ', () => {
  const { progress, user, db } = setup();
  const a = user();
  assert.throws(() => progress.claimAllRewards(a), /受け取れる報酬がありません/);
  db.run('INSERT INTO user_progress (user_id, xp) VALUES (?, ?)', a, 100000);
  const lv = progress.levelInfo(progress.getXp(a)).level;
  assert.ok(lv >= 4);
  progress.claimReward(a, 3); // 1つだけ先に受け取っておく
  const expected = progress.availableRewards(a);
  const sum = expected.reduce((n, r) => n + r.coins, 0);
  const r = progress.claimAllRewards(a);
  assert.deepEqual(r.levels, expected.map((x) => x.level));
  assert.equal(r.levels.includes(3), false);
  assert.equal(r.coins, sum);
  assert.equal(r.balance, progress.getCoins(a));
  assert.deepEqual(progress.availableRewards(a), []);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM level_rewards WHERE user_id = ?', a).n, lv - 1);
  assert.throws(() => progress.claimAllRewards(a), /受け取れる報酬がありません/);
});

test('プロフィール：公開設定の範囲だけ他人に見える。friends は Phase 4 まで本人だけ', () => {
  const { progress, user, accounts } = setup();
  const a = user(); const b = user();
  accounts.putDecks(a, { active: 0, slots: [{ name: '見せるデッキ', list: { infantry: 5 } }] });
  progress.recordMatch(match('p1', [{ userId: a, won: true, deckName: 'x' }, { userId: b, won: false }]));
  let v = progress.profile(a, b);
  assert.equal(v.stats.matches, 1); assert.equal(v.history, null); assert.equal(v.deck, null); assert.equal(v.privacy, undefined);
  progress.updateProfile(a, { privacy: { history: 'public', decks: 'public', stats: 'friends' } });
  v = progress.profile(a, b);
  assert.equal(v.stats, null); assert.equal(v.history.length, 1); assert.equal(v.deck.name, '見せるデッキ');
  const me = progress.profile(a, a);
  assert.equal(me.stats.matches, 1); assert.equal(me.privacy.stats, 'friends');
  assert.equal(progress.profile(a, b, { isFriend: () => true }).stats.matches, 1);
  assert.throws(() => progress.updateProfile(a, { icon: 'nope' }), /アイコン/);
  assert.throws(() => progress.updateProfile(a, { privacy: { stats: 'everyone' } }), /公開設定/);
  assert.throws(() => progress.updateProfile(a, { privacy: { bogus: 'public' } }), /公開設定/);
  assert.equal(progress.profile('u_none', a), null);
});

test('削除：自分の戦績・経験値・通貨が消え、相手の戦績には名前だけ消えて残る', () => {
  const { progress, user, accounts, db } = setup();
  const a = user(); const b = user();
  progress.recordMatch(match('d1', [{ userId: a, name: 'あの人', won: true }, { userId: b, won: false }]));
  progress.recordMatch(match('d2', [{ userId: a, won: true }, { userId: b, won: false }]));
  accounts.deleteAccount(a);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM user_progress WHERE user_id = ?', a).n, 0);
  assert.equal(progress.history(b)[0].opponents[0].name, '（削除済み）');
  assert.equal(progress.stats(b).matches, 2);
});

// ---- HTTP と、実際の部屋の対戦 ----
const call = (base, jar) => async (method, path, body) => {
  const res = await fetch(base + path, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', 'X-CF-Client': '1', ...(jar.csrf ? { 'X-CF-CSRF': jar.csrf } : {}), ...(jar.cookie ? { Cookie: jar.cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  for (const c of res.headers.getSetCookie()) jar.cookie = c.split(';')[0];
  return { status: res.status, json: await res.json() };
};

test('部屋の対戦：ログイン中の2人が遊ぶと、サーバーが決めた勝敗が戦績に入る（クライアントは申告できない）', async () => {
  const server = createGameServer({ data: loadData(), cpuDelayMs: 0, accounts: { dbPath: ':memory:', env: { CF_PUBLIC_URL: 'http://localhost' } } });
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const A = { cookie: '', csrf: null }; const B = { cookie: '', csrf: null }; const guest = { cookie: '', csrf: null };
  const [a, b, g] = [call(base, A), call(base, B), call(base, guest)];
  for (const [c, j, n] of [[a, A, 'あ'], [b, B, 'い']]) { j.csrf = (await c('POST', '/api/auth/guest', {})).json.csrf; await c('POST', '/api/profile/name', { name: n }); }
  // 名前は表示名の1つだけ：部屋に入るときに送った名前ではなく、アカウントの表示名で入る
  const joinA = await a('POST', '/api/join', { passphrase: 'room1', name: '別の名前' });
  const joinB = await b('POST', '/api/join', { passphrase: 'room1', name: '別の名前' });
  assert.equal(joinA.json.ok, true);
  const act = (token, method, args = []) => fetch(`${base}/api/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, method, args }) }).then((r) => r.json());
  assert.equal((await act(joinA.json.token, 'start')).ok, true);
  assert.equal((await act(joinB.json.token, 'surrender')).ok, true); // い が降参 → あ の勝ち
  const hist = (await a('GET', '/api/history')).json;
  assert.equal(hist.matches.length, 1);
  assert.equal(hist.matches[0].result, 'win');
  assert.equal(hist.matches[0].reason, 'surrender');
  assert.equal(hist.matches[0].opponents[0].name, 'い');
  assert.equal((await b('GET', '/api/history')).json.matches[0].result, 'loss');
  assert.equal((await a('GET', '/api/home')).json.stats.wins, 1);
  // 経験値・勝敗を送りつける口はない
  for (const path of ['/api/progress', '/api/xp', '/api/matches']) assert.equal((await a('POST', path, { xp: 99999, win: true })).status, 404);
  assert.equal((await a('GET', '/api/home')).json.level.xp, 0); // 1ターンで終わったので経験値なし
  // ログインしていない人の席は、戦績に入らない（記録先がない）
  const home = (await a('GET', '/api/home')).json;
  const other = (await b('GET', `/api/profile/user/${home.user.id}`)).json.profile; // 他人から見たプロフィール
  assert.equal(other.stats.matches, 1); assert.equal(other.history, null);
  assert.equal(other.userId, home.user.id);
  void g;
  server.close();
});

test('ホーム・レベル報酬・プロフィール設定の HTTP', async () => {
  const server = createGameServer({ data: loadData(), accounts: { dbPath: ':memory:', env: {} } });
  await new Promise((r) => server.listen(0, r));
  const jar = { cookie: '', csrf: null };
  const c = call(`http://localhost:${server.address().port}`, jar);
  assert.equal((await c('GET', '/api/home')).status, 401);
  jar.csrf = (await c('POST', '/api/auth/guest', {})).json.csrf;
  const home = (await c('GET', '/api/home')).json;
  assert.equal(home.level.level, 1); assert.equal(home.coins, 0); assert.equal(home.rank, null);
  assert.equal(home.icons.length >= 1, true);
  assert.equal((await c('POST', '/api/level-rewards/claim', { level: 2 })).status, 400);
  assert.equal((await c('POST', '/api/level-rewards/claim-all', {})).status, 400);
  assert.equal((await c('POST', '/api/profile/settings', { icon: 'knight', privacy: { history: 'public' } })).json.profile.icon, 'knight');
  assert.equal((await c('POST', '/api/profile/settings', { icon: 'evil' })).status, 400);
  assert.equal((await c('GET', '/api/profile/user/u_ffffffffffffffffffffffff')).status, 404);
  assert.equal((await c('GET', '/api/profile/user/..%2f..')).status, 404);
  server.close();
});
