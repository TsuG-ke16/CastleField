import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Db } from '../server/accounts/db.js';
import { Progress } from '../server/accounts/progress.js';
import { give, xpForLevel, findUser } from '../server/dev-cheat.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const cfg = { progression: read('progression.json'), shop: read('shop.json') };

test('チート：レベル・コイン・景品を付けられる（本物の Progress と同じレベル計算）', () => {
  const db = new Db(':memory:');
  db.run("INSERT INTO users (id, kind, display_name, created_at, last_seen_at) VALUES ('u1', 'member', 'テスト', 1, 1)");
  assert.equal(findUser(db, 'テスト').id, 'u1');
  assert.equal(findUser(db, 'u1').id, 'u1');
  const done = give(db, 'u1', { level: 30, coins: 5000, points: 10, items: ['all'] }, cfg);
  assert.equal(done.length, 4);
  const progress = new Progress(db, null, { progression: cfg.progression });
  assert.equal(progress.levelInfo(db.get('SELECT xp FROM user_progress WHERE user_id = ?', 'u1').xp).level, 30);
  assert.equal(xpForLevel(1, cfg.progression), 0);
  give(db, 'u1', { coins: 1 }, cfg, 2);
  assert.equal(db.get('SELECT free_coins, exchange_points FROM wallets').free_coins, 5001);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM inventory').n, Object.keys(cfg.shop.items).length);
  assert.throws(() => give(db, 'u1', { items: ['nope'] }, cfg), /知らない景品/);
});
