// 新しいホーム・モード切替・固定デッキがPWAキャッシュだけでも動くか確認する。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync,writeFileSync } from 'node:fs';
const {chromium}=createRequire(import.meta.url)('playwright');
const base=process.env.UI_TEST_URL ?? 'http://127.0.0.1:8000/';
const out=new URL('./artifacts/home-offline/',import.meta.url);mkdirSync(out,{recursive:true});
const browser=await chromium.launch({...(process.env.UI_TEST_CHROMIUM?{executablePath:process.env.UI_TEST_CHROMIUM}:{})});
try {
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  const url=new URL(base);url.search='?home=1&debug=1&field3d=2d';await page.goto(url.href);await page.locator('#home:not([hidden])').waitFor();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.reload();
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);await page.reload();await page.locator('#home.home-local:not([hidden])').waitFor();
  await page.locator('.home-world[data-ruleset=factions]').click();await page.locator('#home[data-ruleset=factions]:not([hidden])').waitFor();
  await page.locator('[data-act=chooseDeck]').first().click();await page.locator('[data-faction=dragon]').click();
  await page.locator('.home-deck-fan-mini img').evaluate(im=>im.decode());
  await page.screenshot({path:new URL('home.png',out).pathname});
  await page.locator('[data-act=chooseMode]').click();await page.locator('.home-mode[data-mode=local]').click();
  await page.locator('.home-start').click();await page.locator('#local-start').click();await page.waitForFunction(()=>Boolean(window.castlefield?.game()));
  const state=await page.evaluate(()=>{const s=castlefield.game().getState(null);return {deck:s.players.p1.deckId,players:s.playerOrder.length}});
  assert.equal(state.deck,'dragon');assert.equal(state.players,2);assert.deepEqual(errors,[]);
  const report={offline:true,rulesetSwitch:true,localStarted:true,...state,errors};writeFileSync(new URL('report.json',out),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally {await browser.close()}
