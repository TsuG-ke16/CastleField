// ランク・MMR・マッチメイキング・シーズン・不正対策のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Db } from '../server/accounts/db.js';
import { Accounts } from '../server/accounts/accounts.js';
import { Ranking } from '../server/accounts/ranking.js';
import { Matchmaker } from '../server/accounts/matchmaking.js';
import { createGameServer, loadData } from '../server/server.js';

const DAY = 86400000;
function setup(now = { t: Date.parse('2026-11-10T00:00:00Z') }) {
  const db = new Db(':memory:');
  const accounts = new Accounts(db, { now: () => now.t });
  const { ranks, seasons } = loadData();
  const ranking = new Ranking(db, { ranks, seasons, now: () => now.t });
  const member = () => { const id = accounts.startGuest().userId; db.run("UPDATE users SET kind = 'member' WHERE id = ?", id); return id; };
  let n = 0;
  const match = (a, b, winner, extra = {}) => {
    const id = `m${++n}`;
    db.run('INSERT INTO matches (id, started_at, ended_at, turns, reason, player_count) VALUES (?, 0, 0, 10, ?, 2)', id, 'surrender');
    return ranking.applyMatch({ matchId: id, ranked: true, seats: [{ seat: 0, userId: a, won: winner === a }, { seat: 1, userId: b, won: winner === b }], ...extra });
  };
  return { db, accounts, ranking, member, match, now, ranks };
}

test('シーズン：起点から一定日数ごとに番号が進む。新しいシーズンは、MMRを初期値に近づけて短い認定戦から', () => {
  const { ranking, member, match, now, db } = setup();
  assert.equal(ranking.seasonAt(Date.parse('2026-11-01T00:00:00Z')).id, 1);
  assert.equal(ranking.seasonAt(Date.parse('2026-11-01T00:00:00Z') + 56 * DAY).id, 2);
  assert.equal(ranking.seasonAt(Date.parse('2026-01-01T00:00:00Z')).id, 1); // 起点より前でも 1
  const a = member(); const b = member();
  for (let i = 0; i < 5; i++) match(a, b, a); // a が5連勝して認定戦が終わる
  const s1 = ranking.entry(a);
  assert.equal(s1.placement_left, 0); assert.ok(s1.mmr > 1000);
  now.t += 56 * DAY; // 次のシーズン
  const s2 = ranking.entry(a);
  assert.equal(s2.season, 2);
  assert.equal(s2.mmr, Math.round(1000 + (s1.mmr - 1000) * 0.5));
  assert.equal(s2.placement_left, 2);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM season_stats WHERE user_id = ?', a).n, 2); // 前のシーズンの記録は残る
  assert.equal(ranking.history(a).length, 2);
  assert.equal(ranking.history(a)[1].season, 1);
});

test('MMR：同じ強さなら勝者 +32・敗者 −32（認定戦）。強い相手に勝つほど増える。認定戦が終わるとMMRからランクが決まる', () => {
  const { ranking, member, match, db } = setup();
  const a = member(); const b = member();
  match(a, b, a);
  assert.equal(ranking.entry(a).mmr, 1032); assert.equal(ranking.entry(b).mmr, 968);
  assert.equal(ranking.entry(a).placement_left, 4);
  assert.equal(ranking.summary(a).placed, false); assert.equal(ranking.summary(a).rank, null); // 認定中は表示ランクなし
  for (let i = 0; i < 4; i++) match(a, b, a);
  const sum = ranking.summary(a);
  assert.equal(sum.placed, true);
  assert.equal(ranking.entry(a).rp, ranking.rpFromMmr(ranking.entry(a).mmr));
  assert.ok(sum.rank.tierIndex >= 1);
  const strong = member(); const weak = member();
  db.run('UPDATE season_stats SET placement_left = 0, mmr = 1400 WHERE user_id = ?', strong); // ※テストの準備
  ranking.entry(strong); ranking.entry(weak);
  db.run('UPDATE season_stats SET placement_left = 0, mmr = 1400, rp = 1000 WHERE user_id = ?', strong);
  db.run('UPDATE season_stats SET placement_left = 0, mmr = 1000, rp = 400 WHERE user_id = ?', weak);
  const rpWeakBefore = ranking.entry(weak).rp;
  match(weak, strong, weak); // 格下が勝つと、多く増える
  assert.ok(ranking.entry(weak).rp - rpWeakBefore > 22);
  assert.ok(ranking.entry(strong).rp < 1000 - 18);
});

test('ランクの表示：階級・ディビジョンの境目。Master・Champion は順位で決まる', () => {
  const { ranking } = setup();
  const label = (rp, pos) => ranking.displayRank(rp, pos).divisionLabel;
  assert.equal(label(0), 'Iron I'); assert.equal(label(99), 'Iron I'); assert.equal(label(100), 'Iron II'); assert.equal(label(300), 'Bronze I');
  assert.equal(label(899), 'Silver III'); assert.equal(label(900), 'Gold I'); assert.equal(label(1799), 'Diamond III');
  assert.equal(label(1800, 800), 'Diamond III'); // 順位が足りない
  assert.equal(label(2500, 300), 'Master'); assert.equal(label(2500, 50), 'Champion');
  const r = ranking.displayRank(150);
  assert.deepEqual([r.rpIntoDivision, r.rpForNext], [50, 100]);
  assert.equal(ranking.cfg.tiers.length, 8);
});

test('昇格・降格：RP がまたぐと rank が変わり、RP は 0 より下がらない', () => {
  const { ranking, member, match, db } = setup();
  const a = member(); const b = member();
  ranking.entry(a); ranking.entry(b);
  db.run('UPDATE season_stats SET placement_left = 0, rp = 290, mmr = 1000 WHERE user_id = ?', a);
  db.run('UPDATE season_stats SET placement_left = 0, rp = 5, mmr = 1000 WHERE user_id = ?', b);
  match(a, b, a);
  const up = ranking.lastChange(a);
  assert.equal(up.promoted, true); assert.equal(up.rankBefore.tierId, 'iron'); assert.equal(up.rankAfter.tierId, 'bronze');
  const down = ranking.lastChange(b);
  assert.equal(down.rankAfter.rp, 0); assert.equal(down.demoted, false); // もう最低なので、下がらない
  match(b, a, a);
  assert.equal(ranking.lastChange(a).demoted, false);
  match(a, b, b); // a が敗北 → Bronze I から Iron III へ降格しうる
  assert.equal(ranking.lastChange(a).demoted, ranking.lastChange(a).rankAfter.tierId === 'iron');
});

test('不正対策：ゲスト・同じアカウント・CPU・ランク戦でない試合では、レートが動かない', () => {
  const { ranking, member, match, accounts } = setup();
  const a = member(); const b = member(); const g = accounts.startGuest().userId;
  assert.equal(match(a, g, a), null);
  assert.equal(match(a, a, a), null);
  assert.equal(match(a, b, a, { ranked: false }), null);
  assert.equal(ranking.applyMatch({ matchId: 'x', ranked: true, seats: [{ seat: 0, userId: a, won: true }, { seat: 1, userId: null, cpu: 'hard', won: false }] }), null);
  assert.equal(ranking.entry(a).matches, 0);
  assert.equal(ranking.entry(a).mmr, 1000);
});

test('不正対策：同じ相手との勝ち星の水増し（勝ち星の交換）は、RP が減り、やがて 0 になる', () => {
  const { ranking, member, match, db } = setup();
  const a = member(); const b = member();
  for (const u of [a, b]) { ranking.entry(u); db.run('UPDATE season_stats SET placement_left = 0, rp = 500, mmr = 1000 WHERE user_id = ?', u); }
  const gains = [];
  for (let i = 0; i < 7; i++) {
    const before = ranking.entry(a).rp;
    db.run('UPDATE season_stats SET mmr = 1000 WHERE user_id IN (?, ?)', a, b);
    match(a, b, a);
    gains.push(ranking.entry(a).rp - before);
  }
  assert.ok(gains[0] >= 20 && gains[2] === gains[0]); // 3回目まで満額
  assert.ok(gains[3] > 0 && gains[3] < gains[0]); // 4回目から半分
  assert.equal(gains[6], 0); // 7回目は 0
});

test('ランキング：認定戦が終わった人だけ、RP 順。非公開にした人は匿名', () => {
  const { ranking, member, db } = setup();
  const us = [member(), member(), member(), member()];
  us.forEach((u, i) => { ranking.entry(u); db.run('UPDATE season_stats SET placement_left = ?, rp = ? WHERE user_id = ?', i === 3 ? 2 : 0, [300, 900, 100, 5000][i], u); });
  db.run("INSERT INTO user_profiles (user_id, privacy_json) VALUES (?, '{\"ranking\":\"private\"}')", us[1]);
  const b = ranking.leaderboard();
  assert.deepEqual(b.map((x) => x.rp), [900, 300, 100]); // 認定中の人は載らない
  assert.equal(b[0].name, '匿名プレイヤー'); assert.equal(b[0].userId, null);
  assert.equal(b[1].userId, us[0]);
});

test('マッチメイキング：近い MMR を選ぶ。待つほど範囲が広がる。タイムアウトで案内。二重に並べない', () => {
  const now = { t: 1000 };
  const mm = { u1: 1000, u2: 1500, u3: 1040, u4: 1000 };
  const made = [];
  const m = new Matchmaker({
    cfg: loadData().ranks.matchmaking, now: () => now.t, mmrOf: (u) => mm[u],
    createMatch: (a, b) => { made.push([a.userId, b.userId]); return { roomId: 'r1', matchId: `m${made.length}`, seats: { [a.userId]: { token: `t-${a.userId}`, playerId: 'p1' }, [b.userId]: { token: `t-${b.userId}`, playerId: 'p2' } } }; },
  });
  assert.equal(m.join('u1').state, 'queued');
  assert.equal(m.join('u1').state, 'queued'); // 二重に並ばない
  assert.equal(m.queue.size, 1);
  m.join('u2'); // 差 500：すぐには成立しない
  assert.equal(made.length, 0);
  now.t += 41_000; // 範囲 100 + 4×50 = 300 → まだ
  m.tick(); assert.equal(made.length, 0);
  m.join('u3'); // u1 と差 40：すぐ成立（u2 ではなく近い方）
  assert.deepEqual(made[0].sort(), ['u1', 'u3']);
  assert.equal(m.status('u1').state, 'matched'); assert.equal(m.status('u1').token, 't-u1');
  assert.equal(m.join('u1').ok, false); // 試合中は、また並べない
  assert.equal(m.status('u2').state, 'queued');
  now.t += 50_000; // u2 が 90 秒をこえる
  assert.equal(m.status('u2').state, 'timeout');
  assert.equal(m.status('u2').state, 'idle'); // 1回だけ伝える
  m.finished('m1');
  assert.equal(m.status('u1').state, 'idle');
  m.join('u4'); assert.equal(m.leave('u4').state, 'idle'); assert.equal(m.queue.size, 0);
  m.close();
});

// ---- 実際のサーバー ----
const call = (base, jar) => async (method, path, body) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-CF-Client': '1', ...(jar.csrf ? { 'X-CF-CSRF': jar.csrf } : {}), ...(jar.cookie ? { Cookie: jar.cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  for (const c of res.headers.getSetCookie()) jar.cookie = c.split(';')[0];
  return { status: res.status, json: await res.json() };
};
async function rankedServer(ranked = {}) {
  const data = loadData();
  data.ranks = { ...data.ranks, ranked: { ...data.ranks.ranked, ...ranked } };
  const server = createGameServer({ data, cpuDelayMs: 0, accounts: { dbPath: ':memory:', env: { CF_RANKED_CHECK_MS: '20' } } });
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const player = async (member = true) => {
    const jar = { cookie: '', csrf: null }; const c = call(base, jar);
    jar.csrf = (await c('POST', '/api/auth/guest', {})).json.csrf;
    const id = (await c('GET', '/api/me')).json.user.id;
    if (member) server.account.accounts.db.run("UPDATE users SET kind = 'member' WHERE id = ?", id);
    return { c, id };
  };
  const act = (token, method, args = []) => fetch(`${base}/api/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, method, args }) }).then((r) => r.json());
  return { server, base, player, act, db: server.account.accounts.db };
}

test('ランクマッチ：ゲストは並べない。会員2人が並ぶと成立し、降参の結果がレートと戦績に反映される。クライアントから指定する口はない', async () => {
  const { server, player, act, db } = await rankedServer();
  const guest = await player(false);
  const g = await guest.c('POST', '/api/ranked/queue', {});
  assert.equal(g.status, 403); assert.equal(g.json.code, 'needsMember');
  const A = await player(); const B = await player();
  assert.equal((await A.c('POST', '/api/ranked/queue', {})).json.state, 'queued');
  assert.equal((await A.c('GET', '/api/ranked/status')).json.state, 'queued');
  await B.c('POST', '/api/ranked/queue', {});
  const sa = (await A.c('GET', '/api/ranked/status')).json; const sb = (await B.c('GET', '/api/ranked/status')).json;
  assert.equal(sa.state, 'matched'); assert.equal(sb.state, 'matched');
  assert.notEqual(sa.token, sb.token); assert.equal(sa.matchId, sb.matchId);
  assert.equal((await A.c('POST', '/api/ranked/queue', {})).status, 409); // 試合中は並べない
  // ランク戦の部屋では、設定変更・もう1回はできない
  assert.equal((await act(sa.token, 'rematch')).reason, 'ランク戦では使えません');
  assert.equal((await act(sa.token, 'addCpu')).reason, 'ランク戦では使えません');
  assert.equal((await act(sa.token, 'start')).ok, false);
  // B が降参 → A の勝ち
  assert.equal((await act(sb.token, 'surrender')).ok, true);
  const last = (await A.c('GET', '/api/ranked/last')).json.last;
  assert.equal(last.result, 'win'); assert.equal(last.placement, true);
  assert.equal((await B.c('GET', '/api/ranked/last')).json.last.result, 'loss');
  assert.equal(db.get('SELECT COUNT(*) AS n FROM rating_changes').n, 2);
  assert.equal(db.get('SELECT ranked FROM matches LIMIT 1').ranked, 1);
  const sum = (await A.c('GET', '/api/ranked/summary')).json;
  assert.equal(sum.summary.placementLeft, 4); assert.equal(sum.summary.mmr, undefined); // 内部MMRは返さない
  assert.equal((await A.c('GET', '/api/ranked/status')).json.state, 'idle'); // 終わったので、また並べる
  for (const path of ['/api/ranked/result', '/api/ranked/rp', '/api/rank']) assert.equal((await A.c('POST', path, { rp: 99999, win: true })).status, 404);
  // 同じ試合 ID の二重記録でレートは動かない
  const m = db.get('SELECT id FROM matches').id;
  const before = db.get('SELECT mmr FROM season_stats WHERE user_id = ?', A.id).mmr;
  server.account.onMatchEnd({ matchId: m, ranked: true, turns: 9, reason: 'surrender', seats: [{ seat: 0, userId: A.id, won: true }, { seat: 1, userId: B.id, won: false }] });
  assert.equal(db.get('SELECT mmr FROM season_stats WHERE user_id = ?', A.id).mmr, before);
  server.close();
});

test('ランク戦の切断：戻らない人は負け（勝ち逃げ・負け逃れなし）。最初から誰もつながなければ無効', async () => {
  const { server, player, db } = await rankedServer({ connectGraceMs: 150, disconnectGraceMs: 150, idleTurnMs: 60000 });
  const A = await player(); const B = await player();
  await A.c('POST', '/api/ranked/queue', {}); await B.c('POST', '/api/ranked/queue', {});
  const sa = (await A.c('GET', '/api/ranked/status')).json; const sb = (await B.c('GET', '/api/ranked/status')).json;
  // A だけがつなぐ
  const found = server.lobby.findSeat(sa.token);
  found.room.connect(found.seat, () => {});
  await new Promise((r) => setTimeout(r, 600));
  assert.equal((await A.c('GET', '/api/ranked/last')).json.last.result, 'win');
  assert.equal((await B.c('GET', '/api/ranked/last')).json.last.result, 'loss');
  void sb;
  // 誰もつながない試合
  const C = await player(); const D = await player();
  await C.c('POST', '/api/ranked/queue', {}); await D.c('POST', '/api/ranked/queue', {});
  assert.equal((await C.c('GET', '/api/ranked/status')).json.state, 'matched');
  await new Promise((r) => setTimeout(r, 600));
  assert.equal((await C.c('GET', '/api/ranked/status')).json.state, 'idle'); // 無効で終わった
  assert.equal(db.get('SELECT COUNT(*) AS n FROM rating_changes WHERE user_id = ?', C.id).n, 0);
  server.close();
});

test('ランク戦の放置：つながっているのに手を打たない人は降参になる', async () => {
  const { server, player } = await rankedServer({ connectGraceMs: 60000, disconnectGraceMs: 60000, idleTurnMs: 200 });
  const A = await player(); const B = await player();
  await A.c('POST', '/api/ranked/queue', {}); await B.c('POST', '/api/ranked/queue', {});
  const sa = (await A.c('GET', '/api/ranked/status')).json; const sb = (await B.c('GET', '/api/ranked/status')).json;
  for (const s of [sa, sb]) { const f = server.lobby.findSeat(s.token); f.room.connect(f.seat, () => {}); }
  await new Promise((r) => setTimeout(r, 600));
  const last = [(await A.c('GET', '/api/ranked/last')).json.last, (await B.c('GET', '/api/ranked/last')).json.last];
  assert.deepEqual(last.map((l) => l.result).sort(), ['loss', 'win']);
  server.close();
});

test('合言葉の部屋とランク戦の部屋は別。合言葉でランク戦の部屋には入れない', async () => {
  const { server, base } = await rankedServer();
  const r = await fetch(`${base}/api/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passphrase: '\u0000ranked:r1', name: 'x' }) }).then((x) => x.json());
  assert.equal(r.ok, false);
  const ok = await fetch(`${base}/api/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passphrase: 'ふつうの合言葉', name: 'x' }) }).then((x) => x.json());
  assert.equal(ok.ok, true);
  server.close();
});

test('ランキングの API：会員でなくても見られる。ゲストの自分の欄は null', async () => {
  const { server, player } = await rankedServer();
  const guest = await player(false);
  const r = (await guest.c('GET', '/api/ranking')).json;
  assert.equal(r.ok, true); assert.equal(r.me, null); assert.deepEqual(r.board, []);
  assert.equal((await guest.c('GET', '/api/ranked/summary')).json.member, false);
  server.close();
});
