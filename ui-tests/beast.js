import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = process.env.UI_TEST_URL ?? 'http://127.0.0.1:8787/';
const browser = await chromium.launch({
  ...(process.env.UI_TEST_CHROMIUM ? { executablePath: process.env.UI_TEST_CHROMIUM } : {}),
});
const output = new URL('./artifacts/', import.meta.url);
mkdirSync(output, { recursive: true });
const errors = [];

async function verify(width, height, reducedMotion, skip) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || message.text().startsWith('[sync]')) errors.push(message.text());
  });
  const url = new URL(root);
  url.search = new URLSearchParams({
    local: '1', cpu: 'hard', debug: '1', seed: '8',
    rules: JSON.stringify({ weatherFirstRound: 99, monsterFirstRound: 1, monsterSpawnChance: 1, initialMp: 10, maxMp: 10, defenseReaction: false }),
  });
  await page.goto(url.href);
  await page.waitForFunction(() => Boolean(window.castlefield?.game()) && !document.querySelector('#app').classList.contains('busy'));
  await page.addStyleTag({ content: '#debug-toggle { display: none }' });
  if (await page.locator('#tutorial button').isVisible()) await page.locator('#tutorial button').click();
  const state = await page.evaluate(async () => {
    const game = castlefield.game();
    const viewer = document.querySelector('#app').dataset.viewer;
    game.debugSetHand(viewer, ['meteor', 'infantry', 'knight']);
    await castlefield.refresh();
    return { deck: game.getState(viewer).deckCount, hand: game.getState(viewer).players[viewer].handCount };
  });
  const picture = name => page.screenshot({ path: fileURLToPath(new URL(`beast-${name}-${width}x${height}.png`, output)) });
  await page.locator('#hand .card').filter({ hasText: '隕石' }).click();
  await page.locator('.detail-use').click();
  const monster = page.locator('.monster.targetable').first();
  await monster.waitFor();
  const monsterId = await monster.getAttribute('data-id');
  await monster.click();
  const stage = page.locator('.recruit-stage');
  await stage.waitFor({ state: 'attached' });
  assert.equal(await stage.locator('.recruit-heading').textContent(), '魔物の駒を獲得');
  assert.equal(await stage.locator('.recruit-count').textContent(), '手札に＋1枚');
  assert.equal(await page.locator('.fx-reward-stage').count(), 0);
  await page.waitForFunction(() => document.querySelector('.recruit-stage .asset-image')?.naturalWidth === 256);
  if (reducedMotion === 'reduce') {
    assert.equal(await stage.evaluate(el => el.getAnimations().length), 0);
  } else {
    await page.waitForFunction(() => {
      const animation = document.querySelector('.recruit-stage')?.getAnimations()[0];
      return animation?.effect?.getComputedTiming().progress > .46;
    });
    await picture('reveal');
  }
  if (skip) await page.mouse.click(width / 2, height / 2);
  await stage.waitFor({ state: 'detached' });
  if (!skip) {
    await page.locator('.fx-reward-stage').waitFor({ state: 'attached' });
    await page.locator('.fx-reward-stage').waitFor({ state: 'detached' });
  }
  await page.waitForFunction(() => !document.querySelector('#app').classList.contains('busy'));
  const piece = page.locator('#hand .card[data-beast]');
  await piece.waitFor();
  assert.equal(await piece.count(), 1);
  assert.match(await piece.locator('.card-frame').getAttribute('src'), /frame-beast\.png$/);
  assert.equal(await page.locator(`.monster[data-id="${monsterId}"]`).count(), 0);
  const received = await page.evaluate(() => {
    const viewer = document.querySelector('#app').dataset.viewer;
    const next = castlefield.game().getState(viewer);
    return { deck: next.deckCount, hand: next.players[viewer].handCount };
  });
  assert.equal(received.deck, state.deck, '駒とごほうびは山札から引かない');
  assert.equal(received.hand, state.hand + 1, '攻撃カードを1枚使い、駒とごほうびの2枚を得る');
  await piece.click();
  await picture('hand');
  await page.locator('.detail-use').click();
  await page.locator('.targetable').first().click();
  await page.locator('.soldier[data-beast] .beast-insignia').waitFor();
  await page.waitForFunction(() => !document.querySelector('#app').classList.contains('busy'));
  await picture('board');
  await context.close();
}

try {
  await verify(390, 844, 'no-preference', false);
  await verify(360, 640, 'reduce', true);
  assert.deepEqual(errors, []);
  console.log('魔物の駒の獲得・ごほうび・配備・省モーションとスキップを確認');
} finally {
  await browser.close();
}
