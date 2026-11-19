// フレンド・ブロック・招待・パーティー・オンライン状態のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Db } from '../server/accounts/db.js';
import { Accounts } from '../server/accounts/accounts.js';
import { Progress } from '../server/accounts/progress.js';
import { Social, SOCIAL_LIMITS } from '../server/accounts/social.js';
import { createGameServer, loadData } from '../server/server.js';

function setup(limits = {}) {
  const now = { t: 1_000_000 };
  const db = new Db(':memory:');
  const accounts = new Accounts(db, { now: () => now.t });
  const { progression, profile } = loadData();
  const progress = new Progress(db, accounts, { progression, profile, now: () => now.t });
  const busy = new Set();
  const social = new Social({ db, accounts, progress, now: () => now.t, isBusy: (u) => busy.has(u), limits: { ...SOCIAL_LIMITS, ...limits } });
  let n = 0;
  const member = (name) => {
    const id = accounts.startGuest().userId;
    db.run("UPDATE users SET kind = 'member', display_name = ? WHERE id = ?", name ?? `user${++n}`, id);
    return id;
  };
  const befriend = (a, b) => { social.request(a, b); social.respond(b, a, true); };
  return { now, db, accounts, progress, social, member, befriend, busy };
}
const fails = (fn, re) => assert.throws(fn, (e) => (re ? re.test(e.reason ?? e.message) : true));

test('フレンド機能は会員だけ（ゲストは使えない）', () => {
  const { social, accounts, member } = setup();
  const guest = accounts.startGuest().userId; const m = member();
  fails(() => social.state(guest), /アカウントを作成/);
  fails(() => social.request(guest, m), /アカウントを作成/);
  fails(() => social.request(m, guest), /送れません/); // ゲストには送れない
});

test('検索：名前の前方一致・フレンドコード。自分・ブロック関係・検索されない設定の人は出ない。短すぎる検索は断る', () => {
  const { social, member } = setup();
  const me = member('たろう'); const a = member('たけし'); const b = member('たかこ'); const hidden = member('たいち'); const blocker = member('たまお');
  social.updateSettings(hidden, { searchable: false });
  social.block(blocker, me);
  fails(() => social.search(me, 'た'), /2〜16/);
  const r = social.search(me, 'たけ');
  assert.deepEqual(r.map((x) => x.name), ['たけし']); assert.equal(r[0].relation, 'none');
  assert.deepEqual(social.search(me, 'たか').map((x) => x.name), ['たかこ']);
  assert.equal(social.search(me, 'たろ').length, 0); // 自分は出ない
  assert.equal(social.search(me, 'たいち').length, 0); // 検索されない設定
  assert.equal(social.search(me, 'たまお').length, 0); // 自分をブロックした人
  assert.equal(social.search(me, social.code(hidden))[0].name, 'たいち'); // コードなら見つかる
  assert.equal(social.search(me, '%%').length, 0); // ワイルドカードは文字として扱う
  assert.equal(b && a && social.search(me, '_ち').length, 0);
});

test('検索の回数制限', () => {
  const { social, member, now } = setup({ searchPerMinute: 3 });
  const me = member('あああ');
  for (let i = 0; i < 3; i++) social.search(me, 'いい');
  fails(() => social.search(me, 'いい'), /多すぎます/);
  now.t += 61_000;
  social.search(me, 'いい');
});

test('申請：承認でフレンドに。同時に申請し合ったら自動で成立。重複・自分・相手の拒否設定は断る', () => {
  const { social, member } = setup();
  const a = member('A'); const b = member('B'); const c = member('C'); const d = member('D');
  assert.equal(social.request(a, b).state, 'pending');
  fails(() => social.request(a, b), /すでに申請/);
  assert.equal(social.state(b).incoming[0].userId, a);
  assert.equal(social.state(a).outgoing[0].userId, b);
  assert.equal(social.respond(b, a, true).state, 'accepted');
  assert.deepEqual(social.state(a).friends.map((f) => f.userId), [b]);
  assert.deepEqual(social.state(b).friends.map((f) => f.userId), [a]);
  fails(() => social.request(a, b), /すでにフレンド/);
  fails(() => social.request(a, a), /送れません/);
  social.request(c, d);
  assert.equal(social.request(d, c).state, 'accepted'); // 相手からも来ていた
  assert.equal(social.relation(c, d), 'friend');
  const e = member('E'); social.updateSettings(e, { acceptRequests: false });
  fails(() => social.request(a, e), /送れません/);
  fails(() => social.respond(a, b, true), /もうありません/); // 申請がないものには返事できない
  fails(() => social.respond(b, a, false), /もうありません/);
});

test('断られたあとは、24時間は同じ人に申請できない。取り消し・削除ができる', () => {
  const { social, member, now } = setup();
  const a = member('A'); const b = member('B');
  social.request(a, b);
  assert.equal(social.respond(b, a, false).state, 'declined');
  assert.equal(social.state(b).incoming.length, 0);
  fails(() => social.request(a, b), /送れません/);
  now.t += 25 * 3600 * 1000;
  assert.equal(social.request(a, b).state, 'pending');
  social.cancel(a, b);
  assert.equal(social.relation(a, b), 'none');
  social.request(a, b); social.respond(b, a, true);
  social.remove(b, a);
  assert.equal(social.relation(a, b), 'none');
});

test('スパム対策：1時間の申請数・返事待ちの数・フレンドの上限', () => {
  const { social, member, now } = setup({ requestsPerHour: 3, maxOutgoing: 5, maxFriends: 2 });
  const a = member('A'); const others = Array.from({ length: 6 }, (_, i) => member(`O${i}`));
  for (let i = 0; i < 3; i++) social.request(a, others[i]);
  fails(() => social.request(a, others[3]), /多すぎます/);
  now.t += 3601_000;
  social.request(a, others[3]); social.request(a, others[4]);
  fails(() => social.request(a, others[5]), /返事待ち|多すぎます/);
  social.respond(others[0], a, true); social.respond(others[1], a, true);
  fails(() => social.respond(others[2], a, true), /上限/);
});

test('ブロック：フレンド・申請・招待・パーティーが消え、お互いに申請・招待・検索ができない。解除できる', () => {
  const { social, member, befriend } = setup();
  const a = member('Alice'); const b = member('Bob'); const c = member('Carol');
  befriend(a, b); befriend(a, c);
  social.createParty(a); social.inviteToParty(a, b); social.respondInvite(b, social.state(b).invites[0].id, true);
  social.inviteToRoom(a, c);
  social.block(a, b);
  assert.equal(social.relation(a, b), 'none');
  assert.equal(social.state(a).party, null); // 2人だったので解散
  assert.deepEqual(social.state(a).blocked.map((x) => x.userId), [b]);
  fails(() => social.request(b, a), /送れません/); fails(() => social.request(a, b), /送れません/);
  fails(() => social.inviteToRoom(b, a), /送れません/);
  assert.equal(social.search(b, 'Al').length, 0);
  social.block(a, c); assert.equal(social.state(c).invites.length, 0); // 届いていた招待も消える
  social.unblock(a, b);
  assert.equal(social.request(a, b).state, 'pending');
  fails(() => social.block(a, a), /ブロックできません/);
});

test('オンライン状態：一定時間以内は online、過ぎたら offline、試合中は in_match、非表示の設定なら hidden', () => {
  const { social, member, befriend, now, busy } = setup();
  const a = member('A'); const b = member('B'); befriend(a, b);
  assert.equal(social.state(a).friends[0].status, 'offline');
  social.state(b); // b が画面を開いた
  assert.equal(social.state(a).friends[0].status, 'online');
  now.t += 80_000;
  assert.equal(social.state(a).friends[0].status, 'offline');
  social.state(b); busy.add(b);
  assert.equal(social.state(a).friends[0].status, 'in_match');
  social.updateSettings(b, { showOnline: false });
  assert.equal(social.state(a).friends[0].status, 'hidden');
  assert.equal(social.state(b).friends[0].status, 'online'); // 自分の状態は自分には見える
});

test('招待：フレンドだけ。受けない設定は断る。合言葉は受けた人にだけ。1回だけ・期限あり・回数制限', () => {
  const { social, member, befriend, now } = setup({ invitesPerMinute: 3 });
  const a = member('A'); const b = member('B'); const stranger = member('S');
  befriend(a, b);
  fails(() => social.inviteToRoom(a, stranger), /送れません/);
  const sent = social.inviteToRoom(a, b);
  assert.match(sent.passphrase, /^f-/);
  assert.equal(social.state(b).invites[0].from.userId, a);
  assert.equal(JSON.stringify(social.state(b).invites).includes(sent.passphrase), false); // 返事をするまで合言葉は見えない
  fails(() => social.respondInvite(stranger, sent.id, true), /もうありません/); // 他人は受けられない
  assert.equal(social.respondInvite(b, sent.id, true).passphrase, sent.passphrase);
  fails(() => social.respondInvite(b, sent.id, true), /もうありません/); // 1回だけ
  const again = social.inviteToRoom(a, b);
  now.t += 3 * 60_000;
  fails(() => social.respondInvite(b, again.id, true), /もうありません/); // 期限切れ
  social.updateSettings(b, { acceptInvites: false });
  fails(() => social.inviteToRoom(a, b), /送れません/);
  social.updateSettings(b, { acceptInvites: true });
  social.inviteToRoom(a, b);
  fails(() => { for (let i = 0; i < 5; i++) social.inviteToRoom(a, b); }, /多すぎます/);
  fails(() => social.updateSettings(a, { bogus: true }), /設定/);
  fails(() => social.updateSettings(a, { showOnline: 'yes' }), /設定/);
});

test('パーティー：作る・招待・参加・リーダーだけが開始・メンバーにだけ合言葉・退出でリーダー交代・1人になったら解散・追い出し', () => {
  const { social, member, befriend } = setup();
  const a = member('A'); const b = member('B'); const c = member('C'); const out = member('Z');
  befriend(a, b); befriend(a, c); befriend(b, c);
  fails(() => social.inviteToParty(a, b), /作ってから/);
  social.createParty(a);
  fails(() => social.createParty(a), /すでに/);
  social.inviteToParty(a, b); social.inviteToParty(a, c);
  social.respondInvite(b, social.state(b).invites[0].id, true);
  social.respondInvite(c, social.state(c).invites[0].id, true);
  const st = social.state(a).party;
  assert.deepEqual(st.members.map((m) => m.userId), [a, b, c]); assert.equal(st.isLeader, true);
  assert.equal(social.state(b).party.isLeader, false);
  fails(() => social.startParty(b), /リーダー/);
  const { passphrase } = social.startParty(a);
  assert.equal(social.state(b).party.room.passphrase, passphrase); // メンバーには見える
  assert.equal(social.state(out).party, null);
  fails(() => social.kick(b, c), /追い出せません/);
  social.kick(a, c);
  assert.deepEqual(social.state(a).party.members.map((m) => m.userId), [a, b]);
  social.leaveParty(a); // リーダーが抜けたら、残った人が1人なので解散
  assert.equal(social.state(b).party, null);
  // 3人でリーダーが抜けると、次の人がリーダー
  social.createParty(a); social.inviteToParty(a, b); social.respondInvite(b, social.state(b).invites.at(-1).id, true);
  social.inviteToParty(a, c); social.respondInvite(c, social.state(c).invites.at(-1).id, true);
  social.leaveParty(a);
  assert.equal(social.state(b).party.leader, b);
  fails(() => social.inviteToParty(b, out), /送れません/);
});

test('プロフィールの「フレンドだけ」は、フレンドにだけ見える（Phase 2 の約束の続き）', () => {
  const { social, progress, member, befriend } = setup();
  const a = member('A'); const b = member('B'); const s = member('S'); befriend(a, b);
  progress.updateProfile(a, { privacy: { history: 'friends' } });
  const isFriend = (x, y) => social.isFriend(x, y);
  assert.deepEqual(progress.profile(a, b, { isFriend }).history, []);
  assert.equal(progress.profile(a, s, { isFriend }).history, null);
});

test('アカウント削除：フレンド・ブロック・申請が消え、招待・パーティーも消える', () => {
  const { social, accounts, db, member, befriend } = setup();
  const a = member('A'); const b = member('B'); const c = member('C');
  befriend(a, b); social.block(a, c); social.createParty(a); social.inviteToParty(a, b);
  social.forget(a); accounts.deleteAccount(a);
  assert.equal(social.state(b).friends.length, 0); assert.equal(social.state(b).invites.length, 0);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM blocks').n, 0);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM friendships').n, 0);
  assert.equal(social.parties.size, 0);
});

// ---- HTTP と、実際の部屋 ----
const call = (base, jar) => async (method, path, body) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-CF-Client': '1', ...(jar.csrf ? { 'X-CF-CSRF': jar.csrf } : {}), ...(jar.cookie ? { Cookie: jar.cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  for (const c of res.headers.getSetCookie()) jar.cookie = c.split(';')[0];
  return { status: res.status, json: await res.json() };
};

test('HTTP：検索→申請→承認→招待→同じ合言葉で部屋に入る。ブロックした人にはプロフィールも見えない', async () => {
  const server = createGameServer({ data: loadData(), cpuDelayMs: 0, accounts: { dbPath: ':memory:', env: {} } });
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const mk = async (name) => {
    const jar = { cookie: '', csrf: null }; const c = call(base, jar);
    jar.csrf = (await c('POST', '/api/auth/guest', {})).json.csrf;
    const id = (await c('GET', '/api/me')).json.user.id;
    server.account.accounts.db.run("UPDATE users SET kind = 'member', display_name = ? WHERE id = ?", name, id);
    return { c, id, jar };
  };
  const A = await mk('アリス'); const B = await mk('ボブ'); const G = { c: call(base, { cookie: '', csrf: null }) };
  assert.equal((await G.c('GET', '/api/social/state')).status, 401);
  const search = (await A.c('POST', '/api/friends/search', { q: 'ボ' + 'ブ' })).json.results;
  assert.equal(search[0].userId, B.id);
  assert.equal((await A.c('POST', '/api/friends/request', { userId: B.id })).json.state, 'pending');
  assert.equal((await B.c('GET', '/api/social/state')).json.incoming[0].userId, A.id);
  assert.equal((await B.c('POST', '/api/friends/respond', { userId: A.id, accept: true })).json.state, 'accepted');
  // 招待 → 合言葉で、既存の部屋に入る
  const inv = (await A.c('POST', '/api/invites/send', { userId: B.id })).json;
  const invite = (await B.c('GET', '/api/social/state')).json.invites[0];
  const acc = (await B.c('POST', '/api/invites/respond', { id: invite.id, accept: true })).json;
  assert.equal(acc.passphrase, inv.passphrase);
  const j1 = (await A.c('POST', '/api/join', { passphrase: inv.passphrase, name: 'アリス' })).json;
  const j2 = (await B.c('POST', '/api/join', { passphrase: acc.passphrase, name: 'ボブ' })).json;
  assert.equal(j1.ok && j2.ok, true); assert.equal(j1.roomId, j2.roomId);
  // 試合中は in_match
  await fetch(`${base}/api/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: j1.token, method: 'start', args: [] }) });
  assert.equal((await A.c('GET', '/api/social/state')).json.friends[0].status, 'in_match');
  // ブロック
  await A.c('POST', '/api/block', { userId: B.id });
  assert.equal((await B.c('GET', `/api/profile/user/${A.id}`)).status, 404);
  assert.equal((await B.c('POST', '/api/friends/request', { userId: A.id })).status, 403);
  // 他人の userId を指定した操作で、他人のフレンドは動かせない
  const C = await mk('カレン');
  assert.equal((await C.c('POST', '/api/friends/respond', { userId: A.id, accept: true })).status, 404);
  assert.equal((await C.c('POST', '/api/party/start', {})).status, 403);
  server.close();
});
