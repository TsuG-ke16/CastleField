// 開発者用のチート：アカウントのデータ（レベル・コイン・所持品）を、サーバーの DB に直接書く。
//   node server/dev-cheat.js list                                  … アカウント一覧（id・名前・レベル・コイン）
//   node server/dev-cheat.js give <名前かID> [オプション]
//        --rp 1500       ランクポイントをその値にする（今のシーズン。認定戦も終わらせる。MMRも合わせる）
//        --level 50      レベルをその値にする（経験値をそのレベルの開始値にする。下げることもできる）
//        --coins 99999   コインを足す          --points 500   交換ポイントを足す
//        --items all     ショップ・ガチャの景品を全部持たせる（カンマ区切りで id を指定してもよい）
// HTTP からは呼べない（サーバーの中の人だけが使える）。DB は CF_DB_PATH（.env）のものを使う。
// 動いているサーバーがあっても使える。ただし本番では、先に node server/backup.js backup を取ってから。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Db } from './accounts/db.js';
import { Ranking } from './accounts/ranking.js';
import { loadEnv } from './env.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (f) => JSON.parse(readFileSync(join(ROOT, 'data', f), 'utf8'));

/** レベルに必要な累計の経験値（server/accounts/progress.js と同じ式） */
export function xpForLevel(level, cfg) {
  const lv = Math.max(1, Math.min(cfg.maxLevel, level));
  let xp = 0;
  for (let l = 1; l < lv; l++) xp += cfg.xpToNext.base + cfg.xpToNext.growth * (l - 1);
  return xp;
}

export function findUser(db, who) {
  return db.get('SELECT id, display_name FROM users WHERE id = ?', who)
    ?? db.get('SELECT id, display_name FROM users WHERE display_name = ? ORDER BY created_at LIMIT 1', who) ?? null;
}

/** 付ける。返り値は何をしたかの文の配列 */
export function give(db, userId, { level, coins, points, items, rp }, { progression, shop, ranks, seasons }, now = Date.now()) {
  const done = [];
  db.tx(() => {
    if (level != null) {
      db.run('INSERT INTO user_progress (user_id, xp) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET xp = excluded.xp', userId, xpForLevel(level, progression));
      done.push(`レベル ${Math.max(1, Math.min(progression.maxLevel, level))}`);
    }
    if (rp != null) {
      if (rp < 0) throw new Error('--rp は0以上で指定してください');
      const ranking = new Ranking(db, { ranks, seasons, now: () => now });
      const row = ranking.entry(userId);
      const c = ranks.rpFromMmr;
      const mmr = rp > 0 ? Math.max(row.mmr, Math.round(c.base + rp / c.perMmr)) : row.mmr; // RP とMMRが大きくずれると、次の試合で急に動くので合わせる
      db.run('UPDATE season_stats SET rp = ?, mmr = ?, peak_rp = MAX(peak_rp, ?), placement_left = 0 WHERE user_id = ? AND season = ? AND mode_id = ?', rp, mmr, rp, userId, row.season, row.mode_id);
      const shown = ranking.displayRank(rp, null);
      done.push(`ランクポイント ${rp} RP（${shown.divisionLabel}。認定戦は終了）`);
    }
    for (const [col, n, label] of [['free_coins', coins, 'コイン'], ['exchange_points', points, '交換ポイント']]) {
      if (!n) continue;
      const before = db.get(`SELECT ${col} AS v FROM wallets WHERE user_id = ?`, userId)?.v ?? 0;
      db.run('INSERT INTO coin_ledger (user_id, currency, delta, reason, ref, balance_after, at) VALUES (?, ?, ?, ?, ?, ?, ?)', userId, col, n, 'dev-cheat', String(now) + col, before + n, now);
      db.run(`INSERT INTO wallets (user_id, ${col}) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET ${col} = ${col} + excluded.${col}`, userId, n);
      done.push(`${label} +${n}`);
    }
    if (items?.length) {
      const ids = items.includes('all') ? Object.keys(shop.items) : items;
      const bad = ids.filter((id) => !Object.hasOwn(shop.items, id));
      if (bad.length) throw new Error(`知らない景品：${bad.join(', ')}`);
      let added = 0;
      for (const id of ids) added += db.run("INSERT OR IGNORE INTO inventory (user_id, item_id, source, acquired_at) VALUES (?, ?, 'dev-cheat', ?)", userId, id, now).changes;
      done.push(`景品 ${added}個（持っていたものを除く）`);
    }
  });
  return done;
}

function parse(argv) {
  const opts = {}; const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) opts[argv[i].slice(2)] = argv[++i]; else rest.push(argv[i]);
  }
  return { opts, rest };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  loadEnv();
  const dbPath = process.env.CF_DB_PATH || join(ROOT, 'data-store', 'castlefield.db');
  const [cmd, ...args] = process.argv.slice(2);
  const { opts, rest } = parse(args);
  const db = new Db(dbPath);
  const cfg = { progression: readJson('progression.json'), shop: readJson('shop.json'), ranks: readJson('ranks.json'), seasons: readJson('seasons.json') };
  try {
    if (cmd === 'list') {
      for (const u of db.all('SELECT u.id, u.display_name, u.kind, COALESCE(p.xp, 0) AS xp, COALESCE(w.free_coins, 0) AS coins FROM users u LEFT JOIN user_progress p ON p.user_id = u.id LEFT JOIN wallets w ON w.user_id = u.id ORDER BY u.created_at')) {
        let lv = 1; while (lv < cfg.progression.maxLevel && u.xp >= xpForLevel(lv + 1, cfg.progression)) lv++;
        console.log(`${u.id}\t${u.display_name}\t${u.kind}\tLv.${lv}\t${u.coins}コイン`);
      }
    } else if (cmd === 'give' && rest[0]) {
      const user = findUser(db, rest[0]);
      if (!user) throw new Error(`アカウントが見つかりません：${rest[0]}（node server/dev-cheat.js list で確認）`);
      const num = (k) => (opts[k] == null ? null : Number(opts[k]));
      for (const k of ['level', 'coins', 'points', 'rp']) if (num(k) != null && !Number.isInteger(num(k))) throw new Error(`--${k} は整数で指定してください`);
      const done = give(db, user.id, { level: num('level'), coins: num('coins'), points: num('points'), rp: num('rp'), items: opts.items?.split(',') }, cfg);
      if (!done.length) throw new Error('何も指定されていません（--level / --rp / --coins / --points / --items）');
      console.log(`${user.display_name}（${user.id}）：${done.join('、')}`);
    } else {
      console.log('使い方：node server/dev-cheat.js list | give <名前かID> [--level N] [--rp N] [--coins N] [--points N] [--items all]');
      process.exitCode = 1;
    }
  } catch (e) { console.error(e.message); process.exitCode = 1; } finally { db.raw.close(); }
}
