// ホームのレスポンシブ配置と、ナビ・図鑑・編集・設定への実操作を確認。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.UI_TEST_URL ?? 'http://127.0.0.1:8000/';
const dir = new URL('./artifacts/interface/', import.meta.url);
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ ...(process.env.UI_TEST_CHROMIUM ? { executablePath: process.env.UI_TEST_CHROMIUM } : {}) });
const errors = [], report = [];
try {
  for (const [width, height] of [[320,568],[360,640],[390,844],[768,1024],[844,390],[1440,1000]]) {
    const context = await browser.newContext({ viewport: { width,height }, reducedMotion:'reduce', serviceWorkers:'block' });
    await context.route('**/api/me', route => route.fulfill({ json:{ok:false} }));
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await page.locator('#home:not([hidden])').waitFor();
    await page.locator('.home-tabbar[aria-orientation]').waitFor();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(i => i.decode().catch(() => {})));
      for (const src of ['assets/bg/home-courtyard.png','assets/bg/home-courtyard-wide.png']) {
        const image = new Image(); image.src = src; await image.decode();
      }
    });
    const layout = await page.evaluate(() => {
      const home = document.querySelector('#home'), start = home.querySelector('.home-start').getBoundingClientRect();
      const nav = home.querySelector('.home-tabbar').getBoundingClientRect();
      return { overflow: home.scrollWidth > home.clientWidth + 1, start:{top:start.top,bottom:start.bottom}, nav:{top:nav.top,bottom:nav.bottom}, orientation:home.querySelector('.home-tabbar').getAttribute('aria-orientation') };
    });
    await page.screenshot({path:new URL(`home-${width}.png`,dir).pathname});
    console.log(JSON.stringify({width,height,...layout}));
    assert.equal(layout.overflow,false,`${width}: 横にはみ出さない`);
    assert.ok(layout.start.top >= 0 && layout.start.bottom <= height, `${width}: 開始ボタンが初期画面に入る ${JSON.stringify(layout)}`);
    if(width < 1000) assert.ok(layout.start.bottom <= layout.nav.top,`${width}: ナビが開始を隠さない ${JSON.stringify(layout)}`);
    assert.ok(layout.nav.top>=0 && layout.nav.bottom<=height,`${width}: ナビが画面内`);
    const vertical = width>=1000 && height>=650;
    assert.equal(layout.orientation,vertical?'vertical':'horizontal');
    const battle = page.locator('.home-tab[data-tab=battle]');
    await battle.focus(); await page.keyboard.press(vertical?'ArrowDown':'ArrowRight');
    assert.equal(await page.locator('.home-tab:focus').getAttribute('data-tab'),'shop');
    await page.keyboard.press(vertical?'ArrowUp':'ArrowLeft');
    assert.equal(await page.locator('.home-tab:focus').getAttribute('data-tab'),'battle');
    for (const tab of ['account','deck','shop','settings','battle']) {
      await page.locator(`.home-tab[data-tab=${tab}]`).click();
      assert.equal(await page.locator('#home .home-page:visible').count(),1);
      const panel = page.locator(`#home-page-${tab}`);
      assert.ok(await panel.isVisible());
      assert.equal(await panel.getAttribute('aria-labelledby'),`home-tab-${tab}`);
    }
    await page.locator('.home-catalog-link').click();
    await page.locator('#card-guide:not([hidden])').waitFor();
    await page.locator('.guide-query input').fill('歩兵');
    assert.ok(await page.locator('.guide-card:visible').count()>0);
    await page.getByRole('button',{name:'一覧を閉じる'}).click();
    await page.locator('.home-tab[data-tab=deck]').click();
    await page.locator('.home-deck-editbtn').click();
    await page.locator('#deck-editor[open]').waitFor();
    await page.screenshot({path:new URL(`editor-${width}.png`,dir).pathname});
    await page.locator('.deck-close').click();
    await page.locator('.home-tab[data-tab=settings]').click();
    await page.locator('.home-tile[data-id=settings]').click();
    await page.locator('#settings:not([hidden])').waitFor();
    await page.screenshot({path:new URL(`settings-${width}.png`,dir).pathname});
    await page.locator('.settings-close').click();
    await page.locator('.home-help').click();
    await page.locator('#help:not([hidden])').waitFor();
    await page.locator('#help-close').click();
    report.push({width,height,...layout,navigation:true,panels:true,catalog:true,editor:true,settings:true,help:true});
    await context.close();
  }
  assert.deepEqual(errors,[]);
  writeFileSync(new URL('report.json',dir),JSON.stringify({report,errors},null,2)+'\n');
  console.log(JSON.stringify({viewports:report.length,errors}));
} finally { await browser.close(); }
