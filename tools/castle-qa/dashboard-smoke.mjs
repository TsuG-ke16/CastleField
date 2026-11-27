// Optional verification tool; Playwright is supplied by the development environment.
// Run after generating classic/matrix/factions reports (see VALIDATION.md).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = resolve(process.argv[2] ?? 'qa-results');
const artifacts = join(root, 'dashboard');
mkdirSync(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true,
 ...(process.env.UI_TEST_CHROMIUM ? { executablePath: process.env.UI_TEST_CHROMIUM } : {}) });
try {
 for (const width of [1280, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const name of ['classic', 'matrix', 'factions']) {
   const dir = join(root, name), data = JSON.parse(readFileSync(join(dir, 'summary.json')));
   const rows = data.rows ?? [data];
   // setContent exercises the self-contained HTML without file:// access,
   // which managed Chromium policies may block.
   if (process.env.QA_DASHBOARD_URL) await page.goto(`${process.env.QA_DASHBOARD_URL.replace(/\/$/, '')}/${name}/report.html`);
   else { await page.goto('about:blank'); await page.setContent(readFileSync(join(dir, 'report.html'), 'utf8')); }
   assert.equal(await page.locator('script[src],link[href],img[src]').count(), 0);
   await page.waitForSelector('#body tr');
   assert.equal(await page.locator('#body tr').count(), rows.length);
   assert.equal(await page.locator('#tiles .tile').first().locator('b').textContent(), String(data.attempted));
   await page.locator('#q').fill('__no_such_match__');
   assert.equal(await page.locator('#body tr').count(), 0);
   await page.locator('#q').fill(rows[0].label);
   assert.ok(await page.locator('#body tr').count() >= 1);
   await page.locator('#q').fill('');
   await page.locator('#filter').selectOption('warn');
   assert.equal(await page.locator('#body tr').count(), rows.filter(r => r.anomalies).length);
   await page.locator('#filter').selectOption('all');
   const heading = page.locator('#head th').first();
   await heading.click();
   const descending = await page.locator('#body tr td:first-child').allTextContents();
   await heading.click();
   assert.deepEqual(await page.locator('#body tr td:first-child').allTextContents(), descending.reverse());
   await page.locator('#detail').selectOption(String(rows.length - 1));
   assert.deepEqual(JSON.parse(await page.locator('#metrics').textContent()).events, rows.at(-1).events);
   assert.ok(await page.locator('#hist .bar').count() > 0);
   if (data.matrix) assert.equal(await page.locator('#matrix td').count(), data.matrix.labels.length ** 2);
   await page.screenshot({ path: join(artifacts, `${name}-${width}.png`), fullPage: true });
   assert.deepEqual(errors, []);
   console.log(`PASS ${name}: offline, search/filter/sort/detail/histogram/matrix (${width}px)`);
  }
  await page.close();
 }
} finally { await browser.close(); }
