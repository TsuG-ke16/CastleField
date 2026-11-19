// データベースのバックアップと復元。
//   node server/backup.js backup [出力先.db]   … 動いているサーバーがあっても使える（整合した1ファイルを作る）
//   node server/backup.js restore <バックアップ.db> … サーバーを止めてから実行。いまのデータは .before-restore に退避する
import { copyFileSync, existsSync, renameSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Db } from './accounts/db.js';
import { loadEnv } from './env.js';

loadEnv();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = process.env.CF_DB_PATH || join(ROOT, 'data-store', 'castlefield.db');
const [cmd, arg] = process.argv.slice(2);

if (cmd === 'backup') {
  const out = arg ?? join(dirname(dbPath), 'backups', `castlefield-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  const db = new Db(dbPath);
  db.backupTo(out);
  db.close();
  console.log(`バックアップを作りました：${out}`);
} else if (cmd === 'restore' && arg && existsSync(arg)) {
  const check = new Db(arg); // 開けて、移行が通ることを確かめる
  check.close();
  if (existsSync(dbPath)) renameSync(dbPath, `${dbPath}.before-restore`);
  for (const ext of ['-wal', '-shm']) rmSync(`${dbPath}${ext}`, { force: true });
  copyFileSync(arg, dbPath);
  console.log(`復元しました：${dbPath}（元のデータは ${dbPath}.before-restore）`);
} else {
  console.log('使い方：node server/backup.js backup [出力先] ／ node server/backup.js restore <バックアップ.db>');
  process.exitCode = 1;
}
