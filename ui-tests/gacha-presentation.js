// node ui-tests/gacha-presentation.js — isolated fixture UI; never modifies account balances.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(import.meta.dirname, '..');
const artifacts = resolve(root, 'ui-tests/artifacts/gacha'); mkdirSync(artifacts, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'cf-gacha-'));
const port = 9137;
const base = `http://127.0.0.1:${port}`;
const server = spawn('node', ['server/server.js'], { cwd: root, env: { ...process.env, PORT: String(port), CF_DB_PATH: join(dir, 'test.db') }, stdio: 'ignore' });
let browser;
try {
  for (let n=0;n<60;n++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise(r=>setTimeout(r,100)); }
  browser = await chromium.launch({ executablePath: process.env.UI_TEST_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', e=>errors.push(e.message));
  // Load the actual CSS and modules without starting the battle or home diorama.
  await page.route('**/qa-gacha', route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ja"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/css/tokens.css"><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/home.css"><link rel="stylesheet" href="/css/kingdom.css"><link rel="stylesheet" href="/css/gacha.css"></head><body><div id="app"></div></body></html>'}));
  await page.goto(`${base}/qa-gacha`);
  await page.evaluate(async()=>{
    const { CollectionView } = await import('/js/ui/CollectionView.js');
    const { GachaPresentation } = await import('/js/ui/GachaPresentation.js');
    const catalog = await (await fetch('/data/shop.json')).json();
    const config = await (await fetch('/data/gacha.json')).json();
    const items = Object.entries(catalog.items).map(([id,it])=>({id,...it,probability:0,owned:false}));
    window.qa = new CollectionView(); qa.tab='gacha'; qa.box.hidden=false;
    qa.shop={coins:2500,points:60,items,slots:catalog.slots};
    qa.gacha={banner:config.banners.standard,pity:{...config.banners.standard.pity,sinceEpic:3},rates:config.banners.standard.rates,items,duplicatePoints:config.duplicatePoints,exchangeCost:config.exchangeCost}; qa.render();
    window.present = (rarities, reduced=false)=>{
      window.fx?.close();
      window.fx = new GachaPresentation({host:qa.box.querySelector('.collection-box'), reducedMotion:reduced, results:rarities.map((rarity,i)=>({rarity,item:items.find(it=>it.rarity===rarity) || items[0],duplicate:i%2===1,pointsGained:i%2===1?20:0}))});
      clearTimeout(window.fx.timer);
    };
  });
  for (const [device,width,height] of [['pc',1280,900],['mobile',390,844]]) {
    await page.setViewportSize({width,height});
    await page.screenshot({path:join(artifacts,`${device}-top.png`)});
    await page.evaluate(()=>present(['legendary']));
    await page.screenshot({path:join(artifacts,`${device}-chest.png`)});
    await page.evaluate(()=>{ fx.next(); fx.next(); clearTimeout(fx.timer); });
    assert.equal(await page.locator('.royal-reveal').getAttribute('data-phase'),'card');
    await page.locator('.royal-skip').click();
    await page.locator('.royal-result').click();
    await page.screenshot({path:join(artifacts,`${device}-inspect.png`)});
    await page.getByRole('button',{name:'裏返す',exact:true}).click();
    assert.equal(await page.locator('.royal-card-back').getAttribute('aria-hidden'),'false');
    await page.screenshot({path:join(artifacts,`${device}-back.png`)});
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'結果を閉じる',exact:true}).click();
    await page.evaluate(()=>present(['common','uncommon','rare','epic','legendary','common','rare','epic','common','uncommon']));
    await page.locator('.royal-skip').click();
    assert.equal(await page.locator('.royal-result').count(),10);
    assert.equal(await page.locator('.royal-duplicate').count(),5);
    await page.screenshot({path:join(artifacts,`${device}-ten-results.png`)});
    const overflow = await page.locator('.royal-reveal').evaluate(e=>e.scrollWidth>e.clientWidth+1); assert.equal(overflow,false);
    await page.keyboard.press('Escape');
  }
  // Timers must never resurrect removed UI; every tier supports skip.
  for (const rarity of ['common','uncommon','rare','epic','legendary','special']) {
    await page.evaluate(r=>present([r]),rarity);
    await page.locator('.royal-skip').click();
    assert.equal(await page.locator('.royal-result').count(),1);
    await page.keyboard.press('Escape');
  }
  await page.evaluate(()=>present(['legendary'],true));
  assert.equal(await page.locator('.royal-reveal').getAttribute('data-phase'),'results');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1800); assert.equal(await page.locator('.royal-reveal').count(),0);
  // Delayed success + repeated input: only one request, modal survives refresh.
  await page.evaluate(async()=>{
    const { account } = await import('/js/ui/Account.js');
    window.apiCalls=0;
    account.api=async(method,path)=>{
      if(path==='/api/gacha/pull') {
        apiCalls++; await new Promise(r=>setTimeout(r,300));
        qa.shop.coins-=100;
        return {json:{ok:true,results:[{rarity:'rare',item:qa.shop.items.find(i=>i.rarity==='rare'),duplicate:false,pointsGained:0}]}};
      }
      return {json:{ok:true,...(path==='/api/shop'?qa.shop:qa.gacha)}};
    };
    const b=qa.box.querySelector('[data-count="1"]'); b.click(); b.click();
    qa.close();
  });
  assert.equal(await page.locator('#collection').isVisible(),true);
  await page.locator('.royal-skip').waitFor();
  await page.locator('.royal-skip').click();
  assert.equal(await page.evaluate(()=>apiCalls),1);
  assert.equal(await page.locator('.royal-result').count(),1);
  await page.getByRole('button',{name:'結果を閉じる',exact:true}).click();
  assert.equal(await page.locator('[data-count="1"]').isEnabled(),true);
  // API failure leaves no presentation and unlocks the draw controls.
  await page.evaluate(async()=>{
    const { account }=await import('/js/ui/Account.js');
    account.api=async()=>({json:{ok:false,reason:'通信テスト'}});
    qa.box.querySelector('[data-count="1"]').click();
  });
  await page.getByText('通信テスト',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-count="1"]').isEnabled(),true);
  assert.equal(await page.locator('.royal-reveal').count(),0);
  assert.deepEqual(errors,[]);
  console.log('ガチャ演出：PC・スマホ・全レアリティ・早送り・スキップ・裏面・軽減設定・破棄 OK');
} finally { await browser?.close(); server.kill(); rmSync(dir,{recursive:true,force:true}); }
