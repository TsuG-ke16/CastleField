// 新しいホーム・モード切替・固定デッキがPWAキャッシュだけでも動くか確認する。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync,writeFileSync } from 'node:fs';
const {chromium}=createRequire(import.meta.url)('playwright');
const base=process.env.UI_TEST_URL ?? 'http://127.0.0.1:8000/';
const out=new URL(process.env.UI_REVIEW_DIR??'./artifacts/home-offline/',import.meta.url);mkdirSync(out,{recursive:true});
const browser=await chromium.launch({...(process.env.UI_TEST_CHROMIUM?{executablePath:process.env.UI_TEST_CHROMIUM}:{})});
try {
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(180000);
  const url=new URL(base);url.search='?home=1&debug=1&field3d=2d&fx=lite';await page.goto(url.href);await page.locator('#home:not([hidden])').waitFor();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.reload();
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  const cached=await page.evaluate(async()=>{const name=(await caches.keys()).find(k=>k.startsWith('castlefield-')),cache=await caches.open(name),urls=(await cache.keys()).map(r=>r.url);return{cache:name,entries:urls.length,webp:urls.filter(u=>u.includes('/kingdom-v2/')&&u.endsWith('.webp')).length,originals:urls.filter(u=>u.includes('/sources/')).length}});
  assert.equal(cached.webp,14);assert.equal(cached.originals,0);
  await context.setOffline(true);await page.reload();await page.locator('#home.home-local:not([hidden])').waitFor();
  await page.click('.home-tab[data-tab=menu]');await page.click('.home-tile[data-id=settings]');await page.click('[data-for=speed] [data-value=fast]');await page.keyboard.press('Escape');
  await page.click('.home-tab[data-tab=battle]');await page.click('.home-world[data-ruleset=classic]');await page.click('[data-act=skills]');await page.locator('.skilltree:not([hidden])').waitFor();assert.equal(await page.locator('.st-node').count(),201);await page.click('.st-done');

  await page.locator('.home-world[data-ruleset=factions]').click();await page.locator('#home[data-ruleset=factions]:not([hidden])').waitFor();
  await page.locator('[data-faction-quick=dragon]').click();
  await page.screenshot({path:new URL('home.png',out).pathname});
  await page.locator('[data-act=chooseMode]').click();await page.locator('.home-mode[data-mode=local]').click();
  await page.locator('.home-start').click();await page.waitForFunction(()=>Boolean(window.castlefield?.game()));
  const state=await page.evaluate(()=>{const s=castlefield.game().getState(null);return {deck:s.players.p1.deckId,players:s.playerOrder.length}});
  assert.equal(state.deck,'dragon');assert.equal(state.players,2);assert.deepEqual(errors,[]);
  const report={offline:true,rulesetSwitch:true,localStarted:true,offlineSettings:true,offlineSkills:201,...cached,...state,errors};writeFileSync(new URL('report.json',out),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally {await browser.close()}
