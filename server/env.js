// .env の読み込み（外部パッケージなし。Node の process.loadEnvFile を使う）。
// すでに設定されている環境変数は上書きしない（pm2・systemd・コマンドで渡した値が優先）。
// 探す場所（最初に見つかった1つ）：
//   1. 環境変数 CF_ENV_FILE で指定したファイル
//   2. ゲームのフォルダの1つ上の .env（ゲームのフォルダを丸ごと上書きしても消えない）
//   3. ゲームのフォルダの .env
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @returns {string|null} 読み込んだファイルのパス（なければ null） */
export function loadEnv(candidates = [process.env.CF_ENV_FILE, join(ROOT, '..', '.env'), join(ROOT, '.env')]) {
  for (const file of candidates.filter(Boolean).map((f) => resolve(f))) {
    if (!existsSync(file)) continue;
    process.loadEnvFile(file);
    return file;
  }
  return null;
}
