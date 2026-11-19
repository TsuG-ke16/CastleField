// ミッション・シーズン報酬・データの書き出し・世界の切り替えの画面のテスト：node ui-tests/missions.js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = resolve(root, 'ui-tests/artifacts'); mkdirSync(artifacts, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'cf-ms-'));
const dbFile = join(dir, 'm.db');
const port = 9100 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${port}/`;
const server = spawn('node', ['server/server.js'], { cwd: root, env: { ...process.env, PORT: String(port), CF_DB_PATH: dbFile, CF_LOG: 'off' }, stdio: 'ignore' });
let browser;
try {
  for (let n = 0; n < 50; n++) { try { if ((await fetch(`${base}healthz`)).ok) break; } catch { /* 起動待ち */ } await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 797 }, deviceScaleFactor: 2, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(base);
  await page.locator('#home:not([hidden]):not(.home-local)').waitFor({ timeout: 8000 });
  // 世界：王国が選ばれていて、戦国は準備中で押せない
  await page.waitForFunction(() => document.querySelectorAll('#home .home-world').length >= 2);
  assert.equal(await page.locator('#home .home-world[aria-selected=true]').textContent(), '王国');
  assert.ok(await page.locator('#home .home-world:disabled').count() >= 1);
  const info = await page.evaluate(async () => {
    const me = (await (await fetch('/api/me', { credentials: 'same-origin' })).json());
    const ms = (await (await fetch('/api/missions', { credentials: 'same-origin' })).json()).periods;
    return { id: me.user.id, weekly: ms.weekly.key };
  });
  // 達成を作る（本物は、サーバーが確かめた対戦で進む。テストではデータベースに直接）
  const db = new DatabaseSync(dbFile);
  db.prepare("INSERT INTO mission_progress (user_id, mission_id, period_key, progress, completed_at) VALUES (?, 'w_play', ?, 5, 1)").run(info.id, info.weekly);
  db.close();
  await page.reload();
  await page.locator('#home .home-tile[data-id=mission] .home-badge').waitFor({ timeout: 8000 });
  await page.click('#home .home-tile[data-id=mission]');
  await page.locator('#missions:not([hidden]) .mission-row').first().waitFor();
  assert.equal(await page.locator('#missions .mission-row').count(), 3); // デイリーは3つ
  await page.screenshot({ path: resolve(artifacts, 'missions-daily.png') });
  await page.click('#missions .social-tab[data-tab=weekly]');
  assert.equal(await page.locator('#missions .mission-row').count(), 4);
  await page.locator('#missions .mission-row.done .mission-claim:not([disabled])').click();
  await page.locator('#missions .mission-row.done .mission-claim', { hasText: '受け取り済み' }).waitFor();
  await page.screenshot({ path: resolve(artifacts, 'missions-weekly.png') });
  await page.click('#missions .social-tab[data-tab=rewards]');
  await page.locator('#missions .collection-empty').waitFor();
  await page.click('#missions .collection-close');
  assert.match(await page.locator('#home [data-part=coins] b').textContent(), /120/); // 週のミッション 120 コイン
  // データの書き出し
  await page.click('#home [data-act=start]'); await page.click('#levels-back');
  await page.click('#home [data-act=settings]'); await page.click('.set-account-btn');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#account [data-act=export]')]);
  assert.equal(download.suggestedFilename(), 'castlefield-my-data.json');
  assert.deepEqual(errors, []);
  console.log('ミッション画面のテスト：OK');
} finally {
  await browser?.close(); server.kill(); rmSync(dir, { recursive: true, force: true });
}
