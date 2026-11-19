// UI projection / reconnect contracts. No game rules or production state are modified.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { toTitle } from './lib/title.js';
const { chromium } = createRequire(import.meta.url)('playwright');
const base='http://127.0.0.1:8000';
let server,browser;
const errors=[];
try {
  try { await fetch(base); } catch {
    server=spawn('python3',['-m','http.server','8000','--bind','127.0.0.1'],{cwd:new URL('../',import.meta.url),stdio:'ignore'});
    for(let i=0;i<50;i++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,100))}}
  }
  mkdirSync(new URL('./artifacts/',import.meta.url),{recursive:true});
  browser=await chromium.launch({headless:true});
  for(const [width,height] of [[390,844],[360,640],[844,390]]) {
    const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${base}/?local=1&cpu=hard&debug=1&seed=8`);
    await page.waitForFunction(()=>window.castlefield?.game() && !document.querySelector('#app').classList.contains('busy'));
    const checks=await page.evaluate(async()=>{
      const r=castlefield.renderer();
      const {currentRates}=await import('./js/ui/CardInfo.js');
      const {dropRates}=await import('./js/game/Setup.js');
      const [cards,rarities]=await Promise.all(['cards','rarities'].map(x=>fetch(`data/${x}.json`).then(r=>r.json())));
      const plain=dropRates(cards,rarities),boost=dropRates(cards,rarities,{from:'rare',multiplier:3});
      const session={getState:()=>({players:{p1:{permLuck:{chance:.3,boost:3,unused:'rare'}}}})};
      const mix=currentRates({session,viewerId:'p1',permLuckFrom:'rare'},cards,rarities);
      const probability=Object.keys(mix).every(k=>Math.abs(mix[k]-(plain[k]*.7+boost[k]*.3))<1e-9);
      session.getState=()=>({players:{p1:{luck:{draws:3,boost:4,from:'rare'},permLuck:{chance:.3,boost:3,unused:'rare'}}}});
      const temp=currentRates({session,viewerId:'p1',permLuckFrom:'rare'},cards,rarities), expected=dropRates(cards,rarities,{from:'rare',multiplier:4});
      const priority=Object.keys(temp).every(k=>Math.abs(temp[k]-expected[k])<1e-9);
      r.setMp(r.viewerId,0,20);r.showMpShortage(5);
      const empty=document.querySelector('.mp-track').getAttribute('aria-valuenow')==='0' && document.querySelector('.mp-shortage').textContent.includes('5');
      r.setMp(r.viewerId,20,20);r.showMpShortage();
      const full=document.querySelector('.mp-fill').style.width==='100%';
      r.round=8;r.monsterBirths.set('ui-test',3);
      r.addMonster({monsterId:'ui-test',type:'slime',roadId:r.roads?.[0]?.roadId ?? 'p1-p2#1',square:2,hp:7,maxHp:7,attack:3,attackIn:1,rewardRarity:'rare',evolveCount:1,castleAttack:4});
      const growth=r.monsterEl('ui-test').querySelector('.monster-growth').textContent;
      r.monsterBirths.delete('ui-test');r.updateMonster('ui-test',{});
      const reconnect=r.monsterEl('ui-test').querySelector('.monster-growth').textContent;
      // Keep the projection visible for the review screenshot; remove it before syncing the real match.
      return {probability,priority,empty,full,growth,reconnect};
    });
    assert.ok(checks.probability,'permanent luck uses mixture, not boosted probability alone');
    assert.ok(checks.priority,'temporary luck takes priority');assert.ok(checks.empty&&checks.full,'accessible empty/full MP meter and shortage');
    assert.match(checks.growth,/あと1周/);assert.doesNotMatch(checks.reconnect,/あと/,'reconnect does not invent countdown');
    await page.screenshot({path:new URL(`./artifacts/growth-${width}.png`,import.meta.url).pathname});
    await page.evaluate(()=>{castlefield.renderer().removeMonster('ui-test');return castlefield.refresh()});
    await page.screenshot({path:new URL(`./artifacts/mana-${width}x${height}.png`,import.meta.url).pathname});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal document overflow');
    await page.locator('#menu-open').click();await page.locator('#menu-catalog').click();
    await page.locator('.guide-card[data-type="manaShard"]').click();
    await page.getByText('MPコスト：0。MPを1回復。',{exact:false}).waitFor();
    await page.screenshot({path:new URL(`./artifacts/mana-guide-${width}.png`,import.meta.url).pathname});
    await page.close();
  }
  const local=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  local.on('pageerror',e=>errors.push(e.message));
  await local.goto(base); await toTitle(local); await local.locator('#home .home-mode[data-mode="solo"]').click(); await local.locator('#home [data-act="start"]').click();
  await local.locator('.local-options summary').click();
  await local.locator('select[name="playerCount"] + .pill-group [data-value="4"]').click();
  await local.locator('.level[data-level="easy"]').click();
  await local.waitForFunction(()=>!document.documentElement.classList.contains('at-title')&&!document.querySelector('#app').classList.contains('busy'));
  await local.screenshot({path:new URL('./artifacts/local-plaza.png',import.meta.url).pathname});
  await local.close();
  assert.deepEqual(errors,[]);console.log('PASS: MP meter, shortage, growth/reconnect, probability mix, guide, portrait/landscape');
} finally { await browser?.close();server?.kill(); }
