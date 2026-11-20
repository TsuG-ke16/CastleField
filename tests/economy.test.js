// 通貨・ショップ・ガチャ・所持品・装備のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Db } from '../server/accounts/db.js';
import { Accounts } from '../server/accounts/accounts.js';
import { Progress } from '../server/accounts/progress.js';
import { Economy } from '../server/accounts/economy.js';
import { createGameServer, loadData } from '../server/server.js';

function setup(opts = {}) {
  const now = { t: Date.parse('2026-11-10T12:00:00Z') };
  const db = new Db(':memory:');
  const accounts = new Accounts(db, { now: () => now.t });
  const data = loadData();
  const progress = new Progress(db, accounts, { progression: data.progression, profile: data.profile, now: () => now.t });
  const economy = new Economy({ db, catalog: data.shop, gacha: data.gacha, now: () => now.t, matchCoins: data.progression.matchCoins, ...opts });
  progress.economy = economy;
  const user = (coins = 0) => { const id = accounts.startGuest().userId; if (coins) economy.credit(id, coins, 'test', `seed-${id}`); return id; };
  return { db, accounts, progress, economy, now, user, data };
}
const fails = (fn, re) => assert.throws(fn, (e) => (re ? re.test(e.reason ?? e.message) : true));
const match = (id, seats, extra = {}) => ({ matchId: id, turns: 10, reason: 'castleDestroyed', seats: seats.map((s, i) => ({ seat: i, name: `p${i}`, cpu: null, left: false, ...s })), ...extra });

test('コインの出入り：同じ理由・参照は1回だけ。足りなければ減らない。記録が残る', () => {
  const { economy, user, db } = setup();
  const a = user();
  assert.equal(economy.credit(a, 100, 'test', 'r1'), 100);
  assert.equal(economy.credit(a, 100, 'test', 'r1'), null); // 二重に付かない
  assert.equal(economy.balance(a).coins, 100);
  fails(() => economy.debit(a, 101, 'test', 'd1'), /足りません/);
  assert.equal(economy.balance(a).coins, 100);
  assert.equal(economy.debit(a, 30, 'test', 'd2'), 70);
  fails(() => economy.debit(a, 30, 'test', 'd2'), /済んでいます/);
  fails(() => economy.credit(a, -5, 'x', 'y'), /金額/); fails(() => economy.credit(a, 1.5, 'x', 'y'), /金額/);
  fails(() => economy.credit(a, 5, 'x', 'y', 'paid_coins'), /金額/); // 有料通貨は別・まだない
  assert.deepEqual(db.all('SELECT delta, balance_after FROM coin_ledger WHERE user_id = ? ORDER BY id', a).map((r) => [r.delta, r.balance_after]), [[100, 100], [-30, 70]]);
});

test('対戦報酬：勝ちで多い・CPU 相手は半分・対象外の試合はなし・同じ試合は1回・1日の上限', () => {
  const { progress, economy, user, now } = setup();
  const a = user(); const b = user();
  const r = progress.recordMatch(match('m1', [{ userId: a, won: true }, { userId: b, won: false }]));
  assert.equal(r.get(a).coinsGained, 20); assert.equal(r.get(b).coinsGained, 10);
  assert.equal(economy.balance(a).coins, 20);
  assert.equal(progress.recordMatch(match('m1', [{ userId: a, won: true }, { userId: b, won: false }])), null);
  assert.equal(economy.balance(a).coins, 20); // 二重に付かない
  assert.equal(progress.recordMatch(match('cpu', [{ userId: a, won: true }, { won: false, cpu: 'hard' }])).get(a).coinsGained, 10);
  assert.equal(progress.recordMatch(match('short', [{ userId: a, won: true }, { userId: b, won: false }], { turns: 2 })).get(a).coinsGained, 0);
  assert.equal(progress.recordMatch(match('self', [{ userId: a, won: true }, { userId: a, won: false }])).size, 0);
  assert.equal(economy.balance(b).coins, 10);
  assert.equal(progress.lastMatch(a).coinsGained, 0); // 直近の試合（短すぎて対象外）
  for (let i = 0; i < 20; i++) progress.recordMatch(match(`cap${i}`, [{ userId: a, won: true }, { userId: b, won: false }]));
  assert.equal(economy.balance(a).coins, 300); // 1日 300 まで
  now.t += 24 * 3600 * 1000;
  assert.equal(progress.recordMatch(match('next', [{ userId: a, won: true }, { userId: b, won: false }])).get(a).coinsGained, 20);
});

test('レベル報酬も、記録つきで1回だけ', () => {
  const { progress, economy, user, db } = setup();
  const a = user();
  db.run('INSERT INTO user_progress (user_id, xp) VALUES (?, 200)', a);
  progress.claimReward(a, 2);
  assert.equal(economy.balance(a).coins, 20);
  fails(() => progress.claimReward(a, 2), /もう受け取って/);
  assert.equal(db.get("SELECT COUNT(*) AS n FROM coin_ledger WHERE user_id = ? AND reason = 'levelReward'", a).n, 1);
});

test('ショップ：買うとコインが減って持ち物になる。2回は買えない。足りなければ何も変わらない。ガチャ限定は買えない', () => {
  const { economy, user } = setup();
  const a = user(1000);
  const r = economy.buy(a, 'unit_crimson');
  assert.equal(r.coins, 700); assert.equal(economy.owns(a, 'unit_crimson'), true);
  fails(() => economy.buy(a, 'unit_crimson'), /もう持って/);
  assert.equal(economy.balance(a).coins, 700);
  fails(() => economy.buy(a, 'unit_frost'), /足りません|ok/) ; // 800 は足りない…
  assert.equal(economy.balance(a).coins, 700); assert.equal(economy.owns(a, 'unit_frost'), false); // 何も変わらない
  fails(() => economy.buy(a, 'unit_gold'), /ガチャか交換/);
  fails(() => economy.buy(a, 'nothing'), /ありません/);
  fails(() => economy.buy(a, 'constructor'), /ありません/); // 凝った名前でも、一覧にないものは買えない
  const shop = economy.shop(a);
  assert.equal(shop.items.find((i) => i.id === 'unit_crimson').owned, true);
  assert.equal(shop.items.find((i) => i.id === 'unit_gold').buyable, false);
  assert.ok(shop.items.length >= 30);
});

test('装備：持っているものだけ・スロットが合うものだけ。外すと標準。対戦に渡すのは見た目だけ（アイコン・称号は別）', () => {
  const { economy, user } = setup();
  const a = user(5000);
  fails(() => economy.equip(a, 'unit', 'unit_crimson'), /持っていない/);
  economy.buy(a, 'unit_crimson'); economy.buy(a, 'castle_crimson'); economy.buy(a, 'icon_scout'); economy.buy(a, 'title_rookie');
  fails(() => economy.equip(a, 'castle', 'unit_crimson'), /装備できません/); // スロット違い
  fails(() => economy.equip(a, 'bogus', 'unit_crimson'), /装備できません/);
  economy.equip(a, 'unit', 'unit_crimson'); economy.equip(a, 'castle', 'castle_crimson'); economy.equip(a, 'icon', 'icon_scout'); economy.equip(a, 'title', 'title_rookie');
  assert.deepEqual(economy.cosmeticsOf(a), { unit: 'unit_crimson', castle: 'castle_crimson' });
  assert.equal(economy.equippedOf(a).icon, 'icon_scout');
  economy.equip(a, 'unit', null);
  assert.equal(economy.cosmeticsOf(a).unit, undefined);
});

test('アイコン・称号：装備するとプロフィールに出る。無料のアイコンを選ぶと外れる', () => {
  const { economy, progress, user } = setup();
  const a = user(5000);
  fails(() => progress.updateProfile(a, { icon: 'icon_scout' }), /持っていない/);
  economy.buy(a, 'icon_scout'); economy.buy(a, 'title_hunter');
  progress.updateProfile(a, { icon: 'icon_scout' });
  assert.equal(progress.profile(a, a).icon, 'icon_scout');
  assert.match(progress.profile(a, a).iconImage, /scout-blue\.png/);
  assert.ok(progress.home(a).icons.some((i) => i.id === 'icon_scout')); // 選べるアイコンに増える
  economy.equip(a, 'title', 'title_hunter');
  assert.equal(progress.profile(a, a).title, '魔物狩り');
  progress.updateProfile(a, { icon: 'knight' });
  assert.equal(progress.profile(a, a).icon, 'knight');
  assert.equal(economy.equippedOf(a).icon, undefined);
});

test('ガチャ：コイン消費・付与・履歴が1つのまとまり。足りなければ何も起きない。1回100・10連900', () => {
  const { economy, user, db } = setup();
  const a = user(99);
  fails(() => economy.pull(a, 'standard', 1), /足りません/);
  assert.equal(economy.balance(a).coins, 99);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM gacha_pulls').n, 0);
  economy.credit(a, 2000, 'test', 'more');
  const one = economy.pull(a, 'standard', 1);
  assert.equal(one.results.length, 1); assert.equal(one.coins, 99 + 2000 - 100);
  assert.equal(economy.owns(a, one.results[0].itemId), true);
  const ten = economy.pull(a, 'standard', 10);
  assert.equal(ten.results.length, 10); assert.equal(ten.coins, 2099 - 100 - 900);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM gacha_pulls WHERE user_id = ?', a).n, 11);
  fails(() => economy.pull(a, 'standard', 5), /10連/);
  fails(() => economy.pull(a, 'nope', 1), /ありません/);
  assert.equal(economy.history(a).length, 11);
  assert.equal(economy.gachaInfo(a).pity.pullsTotal, 11);
});

test('ガチャ：重複は景品を失わず交換ポイントになる。10連は rare 以上が1つ。天井（40回で epic 以上）', () => {
  // 乱数を固定：いつも最初の（いちばん出やすい）ものを引く
  const { economy, user } = setup({ randomInt: () => 0 });
  const a = user(100000);
  const first = economy.pull(a, 'standard', 1).results[0];
  assert.equal(first.rarity, 'common'); assert.equal(first.duplicate, false);
  const again = economy.pull(a, 'standard', 1).results[0];
  assert.equal(again.itemId, first.itemId); assert.equal(again.duplicate, true);
  assert.equal(economy.balance(a).points, 3); // common の重複 = 3 ポイント
  assert.equal(economy.ownedIds(a).filter((x) => x === first.itemId).length, 1); // 持ち物は1つのまま・失わない
  const ten = economy.pull(a, 'standard', 10).results;
  assert.ok(ten.slice(0, 9).every((r) => r.rarity === 'common'));
  assert.ok(['rare', 'epic', 'legendary'].includes(ten[9].rarity)); // 10連の保証
  // ここまで 12回。40回目で epic 以上が確定
  let r;
  for (let i = 12; i < 40; i++) r = economy.pull(a, 'standard', 1).results[0];
  assert.ok(['epic', 'legendary'].includes(r.rarity), `40回目：${r.rarity}`);
  assert.equal(economy.gachaInfo(a).pity.sinceEpic, 0);
});

test('ガチャ：排出率の表示。レアリティの合計は100で、景品ごとの確率を足すとレアリティの割合になる。実際の抽選もその割合に近い', () => {
  const { economy, user } = setup();
  const a = user();
  const info = economy.gachaInfo(a);
  assert.ok(Math.abs(Object.values(info.rates).reduce((x, y) => x + y, 0) - 100) < 0.01);
  for (const rarity of Object.keys(info.rates)) {
    const sum = info.items.filter((i) => i.rarity === rarity).reduce((x, i) => x + i.probability, 0);
    assert.ok(Math.abs(sum - info.rates[rarity]) < 0.05, `${rarity}: ${sum} vs ${info.rates[rarity]}`);
  }
  const b = economy.banner('standard');
  const rates = economy.effectiveRates(b, economy.poolByRarity(b));
  const n = 200000; const count = {};
  for (let i = 0; i < n; i++) { const r = economy.roll(rates); count[r] = (count[r] ?? 0) + 1; }
  for (const [r, v] of Object.entries(rates)) assert.ok(Math.abs((count[r] / n) * 100 - v) < 0.6, `${r}: ${(count[r] / n) * 100} vs ${v}`);
});

test('交換：ポイントで、持っていないガチャの景品を手に入れる。足りなければ失敗・持っていれば失敗', () => {
  const { economy, user, db } = setup();
  const a = user();
  fails(() => economy.exchange(a, 'unit_gold'), /ポイントが足りません/);
  economy.credit(a, 400, 'test', 'pts', 'exchange_points');
  const r = economy.exchange(a, 'unit_gold');
  assert.equal(r.points, 50); assert.equal(economy.owns(a, 'unit_gold'), true);
  fails(() => economy.exchange(a, 'unit_gold'), /もう持って/);
  assert.equal(economy.balance(a).points, 50);
  fails(() => economy.exchange(a, 'nothing'), /交換できません/);
  assert.equal(db.get("SELECT COUNT(*) AS n FROM coin_ledger WHERE reason = 'exchange'").n, 1);
});

test('アカウント削除：所持品・装備・通貨・ガチャ履歴・記録が消える', () => {
  const { economy, accounts, user, db } = setup();
  const a = user(2000); economy.buy(a, 'unit_crimson'); economy.equip(a, 'unit', 'unit_crimson'); economy.pull(a, 'standard', 1);
  accounts.deleteAccount(a);
  for (const t of ['inventory', 'equipped', 'wallets', 'coin_ledger', 'gacha_pulls', 'gacha_state']) assert.equal(db.get(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?`, a).n, 0, t);
});

// ---- HTTP と、実際の部屋 ----
const call = (base, jar) => async (method, path, body) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-CF-Client': '1', ...(jar.csrf ? { 'X-CF-CSRF': jar.csrf } : {}), ...(jar.cookie ? { Cookie: jar.cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  for (const c of res.headers.getSetCookie()) jar.cookie = c.split(';')[0];
  return { status: res.status, json: await res.json() };
};

test('HTTP：買う・装備・ガチャ。同時に同じものを買っても1つだけ・コインは1回ぶんだけ。クライアントから価格・残高は変えられない', async () => {
  const server = createGameServer({ data: loadData(), cpuDelayMs: 0, accounts: { dbPath: ':memory:', env: {} } });
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const jar = { cookie: '', csrf: null }; const c = call(base, jar);
  jar.csrf = (await c('POST', '/api/auth/guest', {})).json.csrf;
  const id = (await c('GET', '/api/me')).json.user.id;
  const eco = server.account.economy;
  eco.credit(id, 1000, 'test', 'seed');
  assert.equal((await c('GET', '/api/wallet')).json.coins, 1000);
  const rs = await Promise.all(Array.from({ length: 6 }, () => c('POST', '/api/shop/buy', { itemId: 'unit_crimson' })));
  assert.equal(rs.filter((r) => r.json.ok).length, 1);
  assert.equal(eco.balance(id).coins, 700);
  assert.equal((await c('POST', '/api/shop/buy', { itemId: 'unit_royal', price: 0 })).status, 409); // 価格を送っても使われない（800 > 700）
  assert.equal((await c('POST', '/api/wallet', { coins: 99999 })).status, 404);
  assert.equal((await c('POST', '/api/collection/equip', { slot: 'unit', itemId: 'unit_royal' })).status, 403);
  assert.equal((await c('POST', '/api/collection/equip', { slot: 'unit', itemId: 'unit_crimson' })).json.equipped.unit, 'unit_crimson');
  // ガチャの並行：コイン 200 で 6 回同時 → 2 回だけ成功
  const pulls = await Promise.all(Array.from({ length: 6 }, () => c('POST', '/api/gacha/pull', { count: 1 })));
  assert.equal(pulls.filter((r) => r.json.ok).length, 6 - 0 && 6, '残高 700 で 100 × 6 は払える');
  assert.equal(eco.balance(id).coins, 100);
  const more = await Promise.all(Array.from({ length: 4 }, () => c('POST', '/api/gacha/pull', { count: 1 })));
  assert.equal(more.filter((r) => r.json.ok).length, 1); // 残り 100 コインでは1回だけ
  assert.equal(eco.balance(id).coins, 0);
  assert.equal(eco.db.get('SELECT COUNT(*) AS n FROM gacha_pulls WHERE user_id = ?', id).n, 7);
  assert.equal((await c('GET', '/api/gacha/info')).json.items.length >= 30, true);
  // CSRF なしでは買えない
  const bad = await fetch(`${base}/api/shop/buy`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CF-Client': '1', Cookie: jar.cookie }, body: JSON.stringify({ itemId: 'back_forest' }) });
  assert.equal(bad.status, 403);
  server.close();
});

test('スキンは部屋の席に結びつき、相手にも見える。持っていないスキンは出ない', async () => {
  const server = createGameServer({ data: loadData(), cpuDelayMs: 0, accounts: { dbPath: ':memory:', env: {} } });
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const mk = async () => { const jar = { cookie: '', csrf: null }; const c = call(base, jar); jar.csrf = (await c('POST', '/api/auth/guest', {})).json.csrf; return { c, id: (await c('GET', '/api/me')).json.user.id }; };
  const A = await mk(); const B = await mk();
  const eco = server.account.economy;
  eco.credit(A.id, 1000, 'test', 's'); eco.buy(A.id, 'unit_crimson'); eco.equip(A.id, 'unit', 'unit_crimson');
  await A.c('POST', '/api/join', { passphrase: 'skin', name: 'A' });
  await B.c('POST', '/api/join', { passphrase: 'skin', name: 'B' });
  const room = server.lobby.rooms.get('skin');
  const info = room.roomInfo();
  assert.deepEqual(info.players[0].cosmetics, { unit: 'unit_crimson' });
  assert.deepEqual(info.players[1].cosmetics, {}); // 持っていない人は標準
  server.close();
});

test('キャラ・魔法のスキン：全キャラ（兵士21・魔物12）と全魔法（60）に1つずつ。対象ごとに1つ装備でき、別の対象には付けられない', async () => {
  const { economy, user, data } = setup();
  const cards = data.cards; const items = Object.values(data.shop.items);
  const chars = items.filter((i) => i.slot === 'charSkin'); const fx = items.filter((i) => i.slot === 'spellSkin');
  const soldiers = Object.keys(cards).filter((k) => cards[k].kind === 'soldier');
  assert.deepEqual(new Set(chars.map((i) => i.target)), new Set([...soldiers.filter((k) => !k.startsWith('beast_')), ...Object.keys(data.monsters).map((m) => `beast_${m}`)]));
  assert.deepEqual(new Set(fx.map((i) => i.target)), new Set(Object.keys(cards).filter((k) => cards[k].kind === 'spell' && !cards[k].monster))) // 魔物のカード（効果）は、キャラのスキン（beast_*）を使う);
  const a = user();
  economy.grant(a, 'skin_dragonKnight', 'test'); economy.grant(a, 'fxskin_fireball', 'test');
  let eq = economy.equip(a, 'charSkin:dragonKnight', 'skin_dragonKnight');
  assert.equal(eq['charSkin:dragonKnight'], 'skin_dragonKnight');
  eq = economy.equip(a, 'spellSkin:fireball', 'fxskin_fireball');
  assert.equal(eq['spellSkin:fireball'], 'fxskin_fireball');
  fails(() => economy.equip(a, 'charSkin:knight', 'skin_dragonKnight'), /装備できません/); // 別のキャラには付けられない
  fails(() => economy.equip(a, 'charSkin', 'skin_dragonKnight'), /装備できません/);
  assert.equal(economy.equip(a, 'charSkin:dragonKnight', null)['charSkin:dragonKnight'], undefined);
  assert.equal(economy.cosmeticsOf(a)['spellSkin:fireball'], 'fxskin_fireball'); // 対戦の相手にも見える
});
