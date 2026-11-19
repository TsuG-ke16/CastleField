// 図鑑のカードのストーリー：全カードにあるか、図鑑で開いたときに出るか。
// 起動済みのサーバーに接続する（PORT=8787 node server/server.js）。なければポート8000 の python3 -m http.server でもよい
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { CARD_STORIES } from '../js/ui/stories.js';

const cards = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const missing = Object.keys(cards).filter((type) => !CARD_STORIES[type]);
const extra = Object.keys(CARD_STORIES).filter((type) => !cards[type]);
assert.deepEqual(missing, [], 'ストーリーがないカード');
assert.deepEqual(extra, [], 'cards.json にないカードのストーリー');

const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.UI_TEST_URL ?? 'http://127.0.0.1:8787/';
const output = new URL('./artifacts/', import.meta.url);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ ...(process.env.UI_TEST_CHROMIUM ? { executablePath: process.env.UI_TEST_CHROMIUM } : {}) });
const errors = [];
try {
  for (const [width, height] of [[390, 797], [320, 568]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    // タイトル画面を確かめるので、アカウント機能を切る（アカウントがあるとホーム画面が入口になる。ホームは account.js で確かめる）
    await page.route('**/api/me', route => route.fulfill({ json: { ok: false } }));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page.locator('#title-catalog').click();
    await page.locator('#guide-content [data-type="hero"]').click();
    const story = page.locator('.guide-story');
    await story.waitFor();
    assert.equal(await story.getAttribute('open'), '');
    assert.equal(await story.locator('p').innerText(), CARD_STORIES.hero);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '横にはみ出さない');
    await story.scrollIntoViewIfNeeded();
    await page.screenshot({ path: new URL(`stories-${width}x${height}.png`, output).pathname });
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(`ストーリー：${Object.keys(CARD_STORIES).length}枚すべてにあり、図鑑で表示できる OK`);
} finally {
  await browser.close();
}
