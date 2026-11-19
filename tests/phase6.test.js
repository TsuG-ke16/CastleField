// Phase 6：ミッション・シーズン報酬・モード（世界）・運用（ログ・メトリクス・バックアップ）・データの書き出し
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Db, MIGRATIONS } from '../server/accounts/db.js';
import { Accounts } from '../server/accounts/accounts.js';
import { Progress } from '../server/accounts/progress.js';
import { Economy } from '../server/accounts/economy.js';
import { Ranking } from '../server/accounts/ranking.js';
import { Missions } from '../server/accounts/missions.js';
import { Logger, routeClass, startMaintenance } from '../server/ops.js';
import { createGameServer, loadData } from '../server/server.js';

const JST_MIDNIGHT = Date.parse('2026-11-10T15:00:00Z'); // 2026-11-11 00:00 JST（水曜）
function setup(t0 = JST_MIDNIGHT + 3600_000) {
  const now = { t: t0 };
  const db = new Db(':memory:');
  const data = loadData();
  const accounts = new Accounts(db, { now: () => now.t });
  const progress = new Progress(db, accounts, { progression: data.progression, profile: data.profile, now: () => now.t });
  const economy = new Economy({ db, catalog: data.shop, gacha: data.gacha, now: () => now.t, matchCoins: data.progression.matchCoins });
  progress.economy = economy;
  const ranking = new Ranking(db, { ranks: data.ranks, seasons: data.seasons, now: () => now.t });
  progress.ranking = ranking;
  const missions = new Missions({ db, config: data.missions, economy, ranking, seasons: data.seasons, now: () => now.t });
  const user = (member = false) => { const id = accounts.startGuest().userId; if (member) db.run("UPDATE users SET kind = 'member' WHERE id = ?", id); return id; };
  let n = 0;
  const play = (a, b, winner, stats = {}, extra = {}) => {
    const m = { matchId: `pm${++n}`, turns: 10, reason: 'castleDestroyed', endedAt: now.t, seats: [
      { seat: 0, userId: a, name: 'a', cpu: null, left: false, won: winner === a, stats: stats[a] ?? { fuses: 0, monsters: 0 } },
      { seat: 1, userId: b, name: 'b', cpu: null, left: false, won: winner === b, stats: stats[b] ?? { fuses: 0, monsters: 0 } }], ...extra };
    return db.tx(() => { const r = progress.recordMatch(m); if (r && m.ranked) ranking.applyMatch(m); if (r) missions.applyMatch(m, r); return r; });
  };
  return { now, db, data, accounts, progress, economy, ranking, missions, user, play };
}
const fails = (fn, re) => assert.throws(fn, (e) => (re ? re.test(e.reason ?? e.message) : true));
const prog = (missions, u, kind, id) => missions.view(u)[kind].missions.find((m) => m.id === id);

test('期間：日・週・シーズンの区切りは日本時間。デイリーは日付で決まり全員同じ・日が変わると変わる', () => {
  const { missions, now } = setup();
  const p = missions.periods();
  assert.equal(p.daily.key, '2026-11-11'); assert.equal(p.daily.resetsAt, Date.parse('2026-11-11T15:00:00Z'));
  assert.equal(p.weekly.key, 'w2026-11-09'); // 月曜（11/9）の週
  assert.equal(p.weekly.resetsAt, Date.parse('2026-11-15T15:00:00Z')); // 次の月曜 0:00 JST
  now.t = Date.parse('2026-11-11T14:59:00Z'); assert.equal(missions.dayKey(), '2026-11-11'); // JST 23:59
  now.t = Date.parse('2026-11-11T15:00:00Z'); assert.equal(missions.dayKey(), '2026-11-12'); // JST 0:00
  const a = missions.dailyList('2026-11-11').map((m) => m.id);
  assert.equal(a.length, 3); assert.deepEqual(a, missions.dailyList('2026-11-11').map((m) => m.id));
  const sets = new Set(Array.from({ length: 8 }, (_, i) => missions.dailyList(`2026-11-${10 + i}`).map((m) => m.id).join()));
  assert.ok(sets.size > 1, '日によって変わる');
  assert.equal(p.season.key, 's1');
});

test('ミッションの進み具合：試合の結果（勝ち・合成・魔物）から数える。目標で止まる。数えない試合・人は数えない', () => {
  const { missions, user, play, data } = setup();
  const a = user(); const b = user();
  const names = data.missions.weekly.map((m) => m.name);
  assert.ok(names.includes('対戦を5回完了する') && names.includes('カードを5回合成する') && names.includes('魔物を3体倒す') && names.includes('対戦に3回勝利する'));
  play(a, b, a, { [a]: { fuses: 3, monsters: 2 } });
  assert.equal(prog(missions, a, 'weekly', 'w_play').progress, 1);
  assert.equal(prog(missions, a, 'weekly', 'w_win').progress, 1); assert.equal(prog(missions, b, 'weekly', 'w_win').progress, 0);
  assert.equal(prog(missions, a, 'weekly', 'w_fuse').progress, 3); assert.equal(prog(missions, a, 'weekly', 'w_monster').progress, 2);
  play(a, b, a, { [a]: { fuses: 4, monsters: 5 } });
  assert.equal(prog(missions, a, 'weekly', 'w_fuse').progress, 5); // 目標（5）で止まる
  assert.equal(prog(missions, a, 'weekly', 'w_fuse').completed, true);
  assert.equal(prog(missions, a, 'weekly', 'w_monster').progress, 3);
  // 同じアカウントが2席の試合・CPU 相手だけの試合の人は数えない
  const before = prog(missions, a, 'weekly', 'w_play').progress;
  play(a, a, a);
  assert.equal(prog(missions, a, 'weekly', 'w_play').progress, before);
  assert.equal(prog(missions, a, 'season', 's_play').progress, 2);
});

test('ランクのミッション：ランク戦だけが数える', () => {
  const { missions, user, play, db } = setup();
  const a = user(true); const b = user(true);
  play(a, b, a);
  assert.equal(prog(missions, a, 'season', 's_ranked').progress, 0);
  play(a, b, a, {}, { ranked: true });
  assert.equal(prog(missions, a, 'season', 's_ranked').progress, 1);
  const daily = missions.view(a).daily.missions.find((m) => m.id === 'd_ranked');
  if (daily) assert.equal(daily.progress, 1);
  void db;
});

test('報酬：達成したものだけ・1回だけ・期間が変わると受け取れない。コインは台帳に残る', () => {
  const { missions, economy, user, play, now, db } = setup();
  const a = user(); const b = user();
  fails(() => missions.claim(a, 'w_play'), /まだ達成/);
  fails(() => missions.claim(a, 'nothing'), /ありません/);
  fails(() => missions.claim(a, 'constructor'), /ありません/);
  for (let i = 0; i < 5; i++) play(a, b, a);
  const r = missions.claim(a, 'w_play');
  assert.equal(r.coins, 120);
  assert.ok(economy.balance(a).coins >= 120);
  fails(() => missions.claim(a, 'w_play'), /もう受け取って/);
  assert.equal(db.get("SELECT COUNT(*) AS n FROM coin_ledger WHERE user_id = ? AND reason = 'mission'", a).n, 1);
  // 達成したけど受け取らないまま、翌週になる → もう受け取れない（新しい週は 0 から）
  for (let i = 0; i < 3; i++) play(a, b, a);
  assert.equal(prog(missions, a, 'weekly', 'w_win').completed, true);
  now.t += 8 * 86400_000;
  fails(() => missions.claim(a, 'w_win'), /まだ達成/);
  assert.equal(prog(missions, a, 'weekly', 'w_win').progress, 0);
  missions.purge();
  assert.equal(db.get("SELECT COUNT(*) AS n FROM mission_progress WHERE user_id = ? AND period_key LIKE 'w%' AND period_key != ?", a, missions.periods().weekly.key).n, 0);
});

test('シーズン報酬：終わったシーズンの最高ランクに応じて1回だけ。条件を満たさなければ受け取れない。今のシーズンは対象外', () => {
  const { missions, ranking, economy, user, now, db } = setup();
  const a = user(true); const b = user(true);
  ranking.entry(a); ranking.entry(b);
  db.run('UPDATE season_stats SET placement_left = 0, matches = 12, rp = 950, peak_rp = 1000 WHERE user_id = ?', a); // Gold I
  db.run('UPDATE season_stats SET placement_left = 0, matches = 2, rp = 950, peak_rp = 1000 WHERE user_id = ?', b); // 試合が足りない
  assert.deepEqual(missions.seasonRewards(a), []); // 今のシーズンは対象外
  fails(() => missions.claimSeason(a, 1), /ありません/);
  now.t += 57 * 86400_000; // 次のシーズン
  const list = missions.seasonRewards(a);
  assert.equal(list[0].season, 1); assert.equal(list[0].peak.tierId, 'gold'); assert.deepEqual(list[0].items.map((i) => i.id), ['frame_gold', 'back_rank_gold']); assert.equal(list[0].claimed, false);
  fails(() => missions.claimSeason(b, 1), /5試合以上/);
  const r = missions.claimSeason(a, 1);
  assert.deepEqual(r.items, ['frame_gold', 'back_rank_gold']); assert.equal(economy.owns(a, 'frame_gold'), true); assert.equal(economy.owns(a, 'back_rank_gold'), true); assert.equal(economy.balance(a).coins, 0); assert.match(r.tier, /Gold/);
  assert.equal(economy.equip(a, 'iconFrame', 'frame_gold').iconFrame, 'frame_gold');
  fails(() => missions.claimSeason(a, 1), /もう受け取って/);
  assert.equal(missions.seasonRewards(a)[0].claimed, true);
});

test('モード（世界）：デッキは世界ごとに別。使えない世界は断る。戦績もモードごと。既存のデッキは王国に移る（移行）', () => {
  const { accounts, progress, user, play, db } = setup();
  const a = user(); const b = user();
  accounts.modeIds = ['kingdom', 'japan'];
  accounts.putDecks(a, { active: 0, slots: [{ name: '王国のデッキ', list: { infantry: 5 } }] });
  accounts.putDecks(a, { active: 0, slots: [{ name: '戦国のデッキ', list: { infantry: 7 } }] }, null, 'japan');
  assert.equal(accounts.getDecks(a).slots[0].name, '王国のデッキ');
  assert.equal(accounts.getDecks(a, 'japan').slots[0].name, '戦国のデッキ');
  fails(() => accounts.putDecks(a, { active: 0, slots: [] }, null, 'mars'), /モード/);
  play(a, b, a); play(a, b, b, {}, { modeId: 'japan' });
  assert.equal(progress.stats(a, 'kingdom').matches, 1); assert.equal(progress.stats(a, 'japan').matches, 1); assert.equal(progress.stats(a).matches, 2);
  assert.deepEqual(Object.keys(progress.statsByMode(a)).sort(), ['japan', 'kingdom']);
  assert.equal(progress.history(a, 10, 'japan').length, 1);
  void db;
});

test('データベースの移行（v5 → v6）：古い形のデッキと「使っている枠」が、王国として残る', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cf-mig-'));
  try {
    const file = join(dir, 'old.db');
    const raw = new DatabaseSync(file);
    raw.exec('PRAGMA foreign_keys = ON; CREATE TABLE schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)');
    for (const m of MIGRATIONS.filter((x) => x.id <= 5)) { raw.exec(m.sql); raw.prepare('INSERT INTO schema_migrations VALUES (?, ?, 0)').run(m.id, m.name); }
    raw.prepare("INSERT INTO users (id, kind, display_name, created_at, last_seen_at) VALUES ('u_old', 'guest', 'x', 0, 0)").run();
    raw.prepare("INSERT INTO user_settings (user_id, active_deck, deck_revision) VALUES ('u_old', 2, 7)").run();
    raw.prepare("INSERT INTO user_decks (user_id, slot, name, list_json, updated_at) VALUES ('u_old', 2, '古いデッキ', '{\"infantry\":3}', 1)").run();
    raw.close();
    const db = new Db(file); // v6 を適用
    const acc = new Accounts(db);
    const d = acc.getDecks('u_old');
    assert.equal(d.slots[2].name, '古いデッキ'); assert.equal(d.active, 2); assert.equal(d.revision, 7);
    assert.equal(db.get('SELECT COUNT(*) AS n FROM schema_migrations').n, MIGRATIONS.length);
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('ログ：URL の問い合わせ部分（token など）・IDは残さない。パスの数え方にIDが入らない。エラーは構造化される', () => {
  assert.equal(routeClass('GET', '/api/profile/user/u_0123456789abcdef01234567'), 'GET /api/profile/user/:user');
  assert.equal(routeClass('GET', '/api/stream'), 'GET /api/stream');
  assert.equal(routeClass('GET', '/css/style.css'), 'static');
  const lines = []; const log = new Logger({ level: 'debug', out: (l) => lines.push(l), now: () => 0 });
  log.error('x', { err: new Error('boom'), route: 'r' });
  const o = JSON.parse(lines[0]);
  assert.equal(o.level, 'error'); assert.equal(o.err.message, 'boom'); assert.equal(o.t, '1970-01-01T00:00:00.000Z');
  const quiet = []; new Logger({ level: 'warn', out: (l) => quiet.push(l) }).info('hidden'); assert.equal(quiet.length, 0);
});

test('定期の掃除とバックアップ：世代を数だけ残す。古い監査ログ・期限切れのセッションを消す', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cf-bk-'));
  try {
    const now = { t: Date.parse('2026-11-10T00:00:00Z') };
    const db = new Db(':memory:'); const accounts = new Accounts(db, { now: () => now.t });
    accounts.startGuest();
    db.run("INSERT INTO audit_log (at, event) VALUES (?, 'old')", now.t - 100 * 86400_000);
    const lines = []; const log = new Logger({ out: (l) => lines.push(l) });
    const m = startMaintenance({ db, accounts, log, env: { CF_BACKUP_DIR: dir, CF_BACKUP_KEEP: '2', CF_BACKUP_INTERVAL_HOURS: '24' }, now: () => now.t, tickMs: 1e9 });
    for (let i = 0; i < 4; i++) { now.t += 25 * 3600_000; m.run(); }
    m.stop();
    assert.equal(readdirSync(dir).length, 2);
    assert.equal(db.get("SELECT COUNT(*) AS n FROM audit_log WHERE event = 'old'").n, 0);
    const restored = new Db(join(dir, readdirSync(dir).sort().at(-1)));
    assert.equal(restored.get('SELECT COUNT(*) AS n FROM users').n, 1); restored.close();
    assert.ok(lines.some((l) => JSON.parse(l).msg === 'backup'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- 実際のサーバー ----
const call = (base, jar) => async (method, path, body, headers = {}) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-CF-Client': '1', ...(jar.csrf ? { 'X-CF-CSRF': jar.csrf } : {}), ...(jar.cookie ? { Cookie: jar.cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  for (const c of res.headers.getSetCookie()) jar.cookie = c.split(';')[0];
  const ct = res.headers.get('content-type') ?? '';
  return { status: res.status, json: ct.includes('json') ? await res.json() : null, text: ct.includes('json') ? null : await res.text(), headers: res.headers };
};
async function boot(env = {}, extra = {}) {
  const lines = [];
  const server = createGameServer({ data: loadData(), cpuDelayMs: 0, logger: new Logger({ level: 'debug', out: (l) => lines.push(l) }), accounts: { dbPath: ':memory:', env }, ...extra });
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const player = async () => { const jar = { cookie: '', csrf: null }; const c = call(base, jar); jar.csrf = (await c('POST', '/api/auth/guest', {})).json.csrf; return { c, id: (await c('GET', '/api/me')).json.user.id }; };
  return { server, base, lines, player };
}

test('実際の部屋の対戦がミッションに反映される（サーバー確定）。クライアントは進み具合を送れない。報酬は同時に押しても1回', async () => {
  const { server, base, player } = await boot();
  const A = await player(); const B = await player();
  const act = (token, method, args = []) => fetch(`${base}/api/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, method, args }) }).then((r) => r.json());
  const ja = (await A.c('POST', '/api/join', { passphrase: 'm1', name: 'a' })).json; const jb = (await B.c('POST', '/api/join', { passphrase: 'm1', name: 'b' })).json;
  await act(ja.token, 'start');
  // ゲームのイベントを数える（合成・魔物のとどめ）：サーバーが見たイベントから
  const room = server.lobby.rooms.get('m1');
  room.game.emit?.('cardsFused', { playerId: 'p1', cardIds: [], cardId: 'x', from: 'a', to: 'b' });
  await act(jb.token, 'surrender');
  const m = (await A.c('GET', '/api/missions')).json.periods;
  assert.equal(m.weekly.missions.find((x) => x.id === 'w_play').progress, 1);
  assert.equal(m.weekly.missions.find((x) => x.id === 'w_win').progress, 1);
  assert.equal(m.weekly.missions.find((x) => x.id === 'w_fuse').progress, room.game.emit ? 1 : 0);
  for (const p of ['/api/missions/progress', '/api/missions/complete']) assert.equal((await A.c('POST', p, { missionId: 'w_win', progress: 99 })).status, 404);
  assert.equal((await A.c('POST', '/api/missions/claim', { missionId: 'w_win' })).status, 409); // 3勝していない
  // 達成を作って、同時に6回受け取り → 1回だけ
  const db = server.account.accounts.db;
  db.run("UPDATE mission_progress SET progress = 5, completed_at = 1 WHERE user_id = ? AND mission_id = 'w_play'", A.id);
  const rs = await Promise.all(Array.from({ length: 6 }, () => A.c('POST', '/api/missions/claim', { missionId: 'w_play' })));
  assert.equal(rs.filter((r) => r.json.ok).length, 1);
  assert.equal(db.get("SELECT COUNT(*) AS n FROM coin_ledger WHERE user_id = ? AND reason = 'mission'", A.id).n, 1);
  server.close();
});

test('運用：/healthz・/readyz・/metrics（localhost か token）。ログに token・問い合わせ部分を残さない。モード一覧と書き出し', async () => {
  const { server, base, lines, player } = await boot({ CF_METRICS_TOKEN: 'sekret' });
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.equal((await fetch(`${base}/readyz`)).status, 200);
  assert.equal((await fetch(`${base}/metrics`)).status, 403);
  const ok = await fetch(`${base}/metrics`, { headers: { Authorization: 'Bearer sekret' } });
  assert.equal(ok.status, 200);
  const A = await player();
  await fetch(`${base}/api/stream?token=SUPERSECRETTOKEN123456`);
  await A.c('GET', '/api/me?x=queryvalue');
  await A.c('GET', `/api/profile/user/${A.id}`);
  await new Promise((r) => setTimeout(r, 50));
  const text = await (await fetch(`${base}/metrics`, { headers: { Authorization: 'Bearer sekret' } })).text();
  assert.match(text, /cf_http_requests_total\{route="GET \/api\/me",status="200"\}/);
  assert.match(text, /cf_users_total 1/); assert.match(text, /cf_uptime_seconds/);
  const all = lines.join('\n') + text;
  for (const secret of ['SUPERSECRETTOKEN', 'queryvalue', A.id]) assert.equal(all.includes(secret), false, `${secret} が残っている`);
  assert.ok(lines.some((l) => JSON.parse(l).route === 'GET /api/profile/user/:user'));
  // モード
  const modes = (await A.c('GET', '/api/modes')).json;
  assert.equal(modes.modes.find((m) => m.id === 'japan').available, false);
  assert.equal(modes.modes.find((m) => m.id === 'kingdom').available, true);
  assert.equal((await A.c('GET', '/api/decks?mode=japan')).status, 400); // まだ使えない世界
  server.close();
});

test('データの書き出し：自分のデータだけ・内部値（MMR）や他人のIDは含まない。回数制限。ログアウト中は使えない', async () => {
  const { server, base, player } = await boot();
  const A = await player(); const B = await player();
  const eco = server.account.economy;
  eco.credit(A.id, 500, 'test', 'x');
  const exp = await A.c('GET', '/api/account/export');
  assert.equal(exp.status, 200);
  assert.match(exp.headers.get('content-disposition'), /attachment/);
  assert.equal(exp.json.account.kind, 'guest'); assert.equal(exp.json.wallet.coins, 500);
  const raw = JSON.stringify(exp.json);
  assert.equal(raw.includes('mmr'), false); assert.equal(raw.includes(B.id), false);
  assert.ok(exp.json.decks.kingdom); assert.ok(exp.json.missions.daily);
  await A.c('GET', '/api/account/export'); await A.c('GET', '/api/account/export');
  assert.equal((await A.c('GET', '/api/account/export')).status, 429);
  assert.equal((await fetch(`${base}/api/account/export`)).status, 401);
  // 削除でミッションの進み具合も消える
  const db = server.account.accounts.db;
  db.run("INSERT INTO mission_progress (user_id, mission_id, period_key, progress) VALUES (?, 'w_play', 'w1', 1)", B.id);
  await B.c('POST', '/api/account/delete', { confirm: 'delete' });
  assert.equal(db.get('SELECT COUNT(*) AS n FROM mission_progress WHERE user_id = ?', B.id).n, 0);
  server.close();
});
