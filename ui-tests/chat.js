import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const base = new URL(process.env.UI_TEST_URL ?? 'http://127.0.0.1:8787/');
const output = new URL('./artifacts/', import.meta.url);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.UI_TEST_CHROMIUM ? { executablePath: process.env.UI_TEST_CHROMIUM } : {}),
});
const errors = [];
const join = (passphrase, name) => post('join', { passphrase, name });
async function post(route, body) {
  const response = await fetch(new URL(`api/${route}`, base), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json();
  assert.ok(result.ok, result.reason);
  return result;
}
function act(seat, method, args = []) { return post('action', { token: seat.token, method, args }); }
async function makePage(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return page;
}
const snapshot = (page, name) => page.screenshot({ path: new URL(`chat-${name}.png`, output).pathname });

async function local() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await makePage(context);
  await page.goto(new URL('?local=1&cpu=hard', base).href);
  const open = page.locator('#chat-open');
  await open.click();
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll('.chat-stamps img')];
    return images.length === 12 && images.every(image => !image.hidden && image.naturalWidth === 128);
  });
  assert.equal(await page.locator('.chat-input').isVisible(), false);
  await page.evaluate(() => { Math.random = () => .1; });
  await page.locator('.chat-stamp[data-stamp="hello"]').click();
  assert.match(await page.locator('.chat-line.mine').innerText(), /よろしく！/);
  await page.keyboard.press('Escape');
  assert.equal(await open.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'chat-open');
  await page.locator('.chat-bubble.stamp img:not([hidden])').waitFor();
  assert.equal(await open.getAttribute('data-unread'), '1');
  await snapshot(page, 'bubble-390x844');
  await open.click();
  assert.equal(await open.getAttribute('data-unread'), '');
  await snapshot(page, 'stamps-390x844');
  await context.close();
}

async function online() {
  const passphrase = `ui-chat-${Date.now()}`;
  const host = await join(passphrase, '青騎士');
  const guest = await join(passphrase, '橙騎士');
  const context = await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });
  const guestContext = await browser.newContext();
  for (const [ctx, seat] of [[context, host], [guestContext, guest]]) {
    await ctx.addInitScript(({ token, playerId }) => sessionStorage.setItem('cf-online', JSON.stringify({ token, playerId })), seat);
  }
  const page = await makePage(context);
  const guestPage = await makePage(guestContext);
  await Promise.all([page, guestPage].map(async browserPage => {
    await browserPage.goto(base.href);
    await browserPage.locator('#room-screen').waitFor();
  }));
  await act(host, 'start');
  await page.locator('#room-screen').waitFor({ state: 'hidden' });
  const open = page.locator('#chat-open');
  const input = page.locator('.chat-input');
  const send = page.locator('.chat-send');
  const history = page.locator('.chat-log .chat-line');
  const message = '<b>対戦よろしく！</b>';
  await guestPage.locator('#chat-open').click();
  await guestPage.locator('.chat-input').fill(message);
  await guestPage.locator('.chat-send').click();
  await page.waitForFunction(() => document.querySelector('#chat-open').dataset.unread === '1');
  await open.click();
  assert.match(await history.first().innerText(), /<b>対戦よろしく！<\/b>/);
  assert.equal(await history.locator('.chat-body b').count(), 0);
  await input.focus();
  // OSキーボードで layout viewport が維持され、visual viewport だけが縮む場合。
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, 'height', { configurable: true, value: 310 });
    visualViewport.dispatchEvent(new Event('resize'));
  });
  const composer = await send.boundingBox();
  assert.ok(composer.y + composer.height <= 310, '送信ボタンがソフトキーボードの上に残る');
  await snapshot(page, 'keyboard-360x640');
  await input.fill('よろしくお願いします');
  await send.click();
  await page.waitForFunction(() => document.querySelector('.chat-input').value === '');
  assert.equal(await history.count(), 2);
  assert.match(await history.last().innerText(), /よろしくお願いします/);
  await page.reload();
  await open.click();
  await page.waitForFunction(() => document.querySelectorAll('.chat-log .chat-line').length === 2);
  assert.equal(await open.getAttribute('data-unread'), '');
  assert.equal(await page.locator('.chat-bubble').count(), 0);
  await snapshot(page, 'online-360x640');
  assert.equal(await guestPage.locator('.chat-log .chat-line').last().locator('.chat-body').textContent(), 'よろしくお願いします');
  await context.close();
  await guestContext.close();
  await act(guest, 'leave');
  await act(host, 'leave');
}

try {
  await local();
  await online();
  assert.deepEqual(errors, []);
  console.log('CPU・オンラインのスタンプ、通知、再接続、入力欄を確認');
} finally {
  await browser.close();
}
