import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = process.env.UI_TEST_URL ?? 'http://127.0.0.1:8787/';
const output = new URL('./artifacts/', import.meta.url);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.UI_TEST_CHROMIUM ? { executablePath: process.env.UI_TEST_CHROMIUM } : {}),
});
const fixtures = await fetch(new URL('data/weather.json', root)).then(response => response.json());
const errors = [];

async function verify(width, height, reducedMotion) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const url = new URL(root);
  url.search = new URLSearchParams({
    local: '1', cpu: 'hard', debug: '1', seed: '8',
    rules: JSON.stringify({ weatherFirstRound: 99, monsterFirstRound: 99 }),
  });
  await page.goto(url.href);
  await page.waitForFunction(() => Boolean(window.castlefield?.game())
    && !document.querySelector('#app').classList.contains('busy'));
  await page.addStyleTag({ content: '#debug-toggle { display: none }' });
  if (await page.locator('#tutorial button').isVisible()) await page.locator('#tutorial button').click();
  await page.evaluate(async () => { (await import('./js/ui/config.js')).UI_CONFIG.speed = .8; });

  const chip = page.locator('#weather-chip');
  const panel = page.locator('#weather-detail');
  const snapshot = name => page.screenshot({ path: fileURLToPath(new URL(`weather-${name}-${width}x${height}.png`, output)) });
  for (const [type, weather] of Object.entries(fixtures)) {
    await page.evaluate(w => castlefield.renderer().setWeather(w), { ...weather, type, roundsLeft: 2 });
    assert.equal(await page.locator('#app').getAttribute('data-weather'), type);
    await page.waitForFunction(() => document.querySelector('#weather-chip img')?.naturalWidth === 128);
    assert.match(await chip.getAttribute('aria-label'), new RegExp(`${weather.name}、あと2周`));
    const layout = await page.evaluate(() => {
      const turn = document.querySelector('#turn-status span');
      const menu = document.querySelector('#menu-open').getBoundingClientRect();
      const hud = document.querySelector('#hud').getBoundingClientRect();
      const weather = document.querySelector('#weather-chip').getBoundingClientRect();
      return turn.scrollWidth <= turn.clientWidth && menu.right <= hud.right && weather.bottom <= hud.bottom;
    });
    assert.ok(layout, `上部のバッジと操作ボタンが収まる: ${type}`);
    for (const pseudo of ['::before', '::after']) {
      const animation = await page.locator('#weather-fx').evaluate((node, part) => getComputedStyle(node, part).animationName, pseudo);
      if (reducedMotion === 'reduce') assert.equal(animation, 'none');
      if (reducedMotion === 'no-preference' && pseudo === '::before') assert.notEqual(animation, 'none');
    }
    await snapshot(type);
    await chip.press('Enter');
    await panel.waitFor();
    assert.equal(await chip.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#weather-detail-description').innerText(), weather.description);
    assert.match(await page.locator('#weather-detail-remaining').innerText(), /残り 2周/);
    await page.evaluate(w => castlefield.renderer().setWeather(w), { ...weather, type, roundsLeft: 1 });
    assert.match(await page.locator('#weather-detail-remaining').innerText(), /残り 1周/);
    if (type === 'heavyRain') await snapshot('detail');
    await page.keyboard.press('Escape');
    assert.equal(await chip.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'weather-chip');
  }

  await chip.click();
  await page.evaluate(() => castlefield.renderer().setWeather(null));
  assert.equal(await chip.isVisible(), false);
  assert.equal(await panel.isVisible(), false);

  // 表示層のイベントで青・金・赤の通知を再現し、消えることを確認する。
  for (const [type, tone] of [['rain', 'calm'], ['sunny', 'good'], ['storm', 'alert']]) {
    await page.evaluate(({ weather, type }) => {
      void castlefield.anim().weatherChanged({ ...weather, weather: type, rounds: 2 }, {});
    }, { weather: fixtures[type], type });
    const notice = page.locator(`.weather-notice[data-tone="${tone}"]`);
    await notice.waitFor();
    assert.match(await notice.innerText(), new RegExp(fixtures[type].name));
    assert.equal(await page.locator('.weather-alarm').getAttribute('data-tone'), tone);
    if (reducedMotion === 'reduce') assert.equal(await notice.evaluate(el => el.getAnimations().length), 0);
    if (type === 'storm') {
      await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.weather-notice')).opacity) > .96);
      await snapshot('alert');
    }
    await notice.waitFor({ state: 'detached' });
  }
  await page.evaluate(weather => {
    castlefield.renderer().setWeather({ ...weather, type: 'heavyRain', roundsLeft: 1 });
    const viewer = document.querySelector('#app').dataset.viewer;
    void castlefield.anim().weatherLightning({ playerId: viewer });
  }, fixtures.heavyRain);
  await page.locator('.weather-notice[data-tone="alert"]').filter({ hasText: '落雷' }).waitFor();
  if (reducedMotion === 'no-preference') {
    assert.ok(await page.locator('.fx-bolt').count() > 0);
    await snapshot('lightning');
  } else assert.equal(await page.locator('.fx-bolt').count(), 0);
  await page.locator('.weather-notice').waitFor({ state: 'detached' });

  // 本物のカード操作でも、ゲームが選んだ天候を出してタップで飛ばせる。
  await page.evaluate(async () => {
    const viewer = document.querySelector('#app').dataset.viewer;
    castlefield.game().debugSetHand(viewer, ['weatherCall', 'infantry']);
    await castlefield.refresh();
  });
  const card = page.locator('#hand .card').filter({ has: page.locator('img[src$="/card-weather-call.png"]') });
  await card.waitFor();
  await page.waitForFunction(() => document.querySelector('#hand img[src$="/card-weather-call.png"]')?.naturalWidth > 0);
  await snapshot('spell');
  await card.press('Enter');
  await page.locator('.detail-use').press('Enter');
  const changed = page.locator('.weather-notice').filter({ hasText: '天候の呪文' });
  await changed.waitFor();
  const stateType = await page.evaluate(() => castlefield.game().getState(null).weather.type);
  assert.equal(await page.locator('#app').getAttribute('data-weather'), stateType);
  await page.locator('#board').click({ position: { x: 15, y: 20 } });
  await changed.waitFor({ state: 'detached', timeout: 600 });
  assert.equal(await page.locator('#app').getAttribute('data-weather'), stateType);
  assert.deepEqual(errors, []);
  await context.close();
  console.log(`${width}×${height} 天候7種・残り周回・警報・落雷・呪文のスキップ OK`);
}

try {
  await verify(390, 844, 'no-preference');
  await verify(360, 640, 'reduce');
} finally {
  await browser.close();
}
