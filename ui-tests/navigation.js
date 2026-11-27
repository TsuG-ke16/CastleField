import {selectDifficulty} from './lib/title.js';
// Integration through real UI + real HTTP APIs. All account data lives in :memory:.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createGameServer,loadModeData} from '../server/server.js';
const{chromium}=createRequire(import.meta.url)('playwright');
const out=new URL(process.env.UI_REVIEW_DIR??'../assets/review/navigation-v4/',import.meta.url).pathname;mkdirSync(out,{recursive:true});
const server=createGameServer({modeData:loadModeData(),cpuDelayMs:0,accounts:{dbPath:':memory:',env:{}}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.UI_TEST_CHROMIUM??'/usr/bin/chromium',args:['--no-sandbox']});
const report=[];
try{
 for(const[device,width,height]of[['pc',1440,900],['mobile',390,844]]){
  const c=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',serviceWorkers:'block'});
  await c.addInitScript(()=>{localStorage.setItem('cf-tutorial','done');localStorage.setItem('cf-settings-v1',JSON.stringify({speed:'skip',reduced:true}))});
  const p=await c.newPage();p.setDefaultTimeout(20000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const shot=async(name)=>{await p.locator('#home').evaluate(e=>e.scrollTop=0).catch(()=>{});await p.screenshot({path:`${out}${device}-${name}.png`})};
  const tab=async id=>p.locator(`.home-tab[data-tab=${id}]`).click();
  const menu=async id=>{await tab('menu');await p.locator(`.home-tile[data-id=${id}]`).click()};
  const boot=async(mode='kingdom')=>{await p.goto(`${base}/?home=1&fx=lite&debug=1&seed=8${mode==='kingdom'?'':`&mode=${mode}`}`);await p.locator('#home:not([hidden])').waitFor();await p.waitForFunction(()=>Boolean(window.castlefield));await p.waitForFunction(async()=>{const{account}=await import('/js/ui/Account.js');return!!account.user});};
  await boot();const user=(await(await c.request.get(base+'/api/me')).json()).user;
  server.account.economy.credit(user.id,5000,'ui-test',`${device}-seed`);
  await p.reload();await p.locator('#home:not([hidden])').waitFor();
  // Difficulty is a preference, not an implicit start action, and survives reload.
  await selectDifficulty(p,'hard');assert.equal(await p.evaluate(()=>castlefield.game()),null);
  await p.reload();await p.locator('.cpu-choice[data-level=hard][aria-pressed=true]').waitFor({state:'attached'});await shot('home');console.log(device,'home preferences passed');
  await p.locator('.home-match-options summary').click();await p.selectOption('[name=playerCount]','3');await p.selectOption('[name=stage]','ice');await shot('home-options');
  await p.locator('.home-match-options summary').click();
  await p.locator('[data-act=chooseMode]').click();await p.locator('[data-mode=local]').click();assert.ok(await p.locator('.home-cpu').isHidden());
  await p.locator('[data-act=chooseMode]').click();await p.locator('[data-mode=solo]').click();
  // A single deck editor action on the deck page. Catalog remains available.
  await tab('deck');assert.equal(await p.locator('[data-page=deck] [data-act=deck]').count(),1);assert.equal(await p.locator('[data-page=deck] [data-act=skin]').count(),0);
  await p.locator('.home-deck-editbtn').click();await p.locator('#deck-editor[open]').waitFor();await p.locator('.deck-close').click();assert.ok(await p.locator('[data-page=deck]').isVisible());await shot('deck');
  await tab('shop');await p.locator('[data-act=buy][data-id=unit_crimson]').waitFor();assert.equal(await p.locator('#collection [data-act=pull]').count(),0);assert.equal(await p.locator('#collection [data-act=equip]').count(),0);
  await shot('shop');await p.locator('[data-act=buy][data-id=unit_crimson]').click();await p.waitForFunction(()=>document.querySelector('#collection .item-card.owned')!==null);
  await tab('gacha');await p.locator('[data-act=pull][data-count="1"]:enabled').waitFor();assert.equal(await p.locator('.collection-tabs').count(),0);assert.equal(await p.locator('#collection:not([hidden])').count(),1);
  await shot('gacha');let pulls=0;p.on('request',r=>{if(r.url().endsWith('/api/gacha/pull')&&r.method()==='POST')pulls++});
  const response=p.waitForResponse(r=>r.url().endsWith('/api/gacha/pull')&&r.request().method()==='POST');await p.locator('[data-act=pull][data-count="1"]').click();assert.ok((await(await response).json()).ok);
  await p.locator('.gacha-reveal').waitFor();assert.equal(pulls,1,'one UI pull makes one purchase');await p.locator('.gacha-open').click();await p.locator('.gacha-close').click();
  await menu('skin');await p.locator('[data-act=equip][data-id=unit_crimson]').waitFor();assert.equal(await p.locator('#collection [data-act=buy]').count(),0);
  await p.locator('[data-act=equip][data-id=unit_crimson]').click();await p.locator('[data-act=unequip][data-id=unit_crimson]').waitFor();assert.equal((await(await c.request.get(base+'/api/collection')).json()).equipped.unit,'unit_crimson');await shot('skin');
  await p.locator('[data-act=backMenu]:visible').click();assert.ok(await p.locator('[data-page=menu]').isVisible());
  await menu('settings');await p.locator('#settings.embedded-view').waitFor();await p.locator('[data-for=speed] [data-value=fast]').click();assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('cf-settings-v1')).speed),'fast');await shot('settings');await p.locator('.home-tab[data-tab=battle]').focus();await p.keyboard.press('Tab');assert.ok(await p.locator('.home-tab:focus').count()>0,'embedded settings do not trap navigation focus');await p.locator('[data-page=settings] h1').focus();await p.keyboard.press('Escape');assert.ok(await p.locator('[data-page=menu]').isVisible());
  await menu('profile');await p.locator('[data-part=renameBtn]:visible').waitFor();await p.locator('[data-part=renameBtn]').click();await p.locator('[data-part=nameInput]').fill('王国の旅人');await p.locator('.profile-rename button[type=submit]').click();await p.waitForFunction(()=>document.querySelector('.profile-name-row [data-part=name]').textContent==='王国の旅人');await shot('profile');
  await p.locator('[data-act=backMenu]:visible').click();await p.locator('.home-tile[data-id=account]').click();await p.locator('#account:not([hidden])').waitFor();assert.equal(await p.locator('#account [data-act=rename]').count(),0);await shot('account');await p.locator('#account [data-act=close]').click();assert.ok(await p.locator('[data-page=menu]').isVisible());await shot('menu');
  await tab('battle');await p.locator('[data-act=chooseMode]').click();await p.locator('[data-mode=online]').click();await p.locator('#title-pass').fill('navigation-ui-room-'+device);await shot('online-home');
  await p.locator('.home-start').click();await p.locator('#room-screen:not([hidden])').waitFor();await p.screenshot({path:`${out}${device}-room.png`});
  // Reload a fresh context for CPU/local so a live room cannot affect either route.
  await c.close();
  report.push({device,economy:{realSinglePull:true,buy:true,equip:true},settingsPersistence:true,profileRename:true,accountSeparated:true,onlineRoom:true,errors});
  assert.deepEqual(errors,[]);
  for(const mode of ['kingdom','factions','classic']){
   for(const format of ['solo','local']){
    const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',serviceWorkers:'block'});const page=await context.newPage();page.setDefaultTimeout(30000);const es=[];page.on('pageerror',e=>es.push(e.message));
    await context.addInitScript(()=>{localStorage.setItem('cf-tutorial','done');localStorage.setItem('cf-settings-v1',JSON.stringify({speed:'skip',reduced:true}))});
    await page.goto(`${base}/?home=1&fx=lite&debug=1&seed=8${mode==='kingdom'?'':`&mode=${mode}`}`);await page.locator('#home:not([hidden])').waitFor();
    if(format==='local'){await page.click('[data-act=chooseMode]');await page.click('[data-mode=local]');assert.ok(await page.locator('.home-cpu').isHidden())}
    else await selectDifficulty(page,'easy');
    if(mode==='classic'){
     assert.ok(await page.locator('[data-act=skills]').isVisible());assert.ok(await page.locator('.home-deckpanel').isHidden());
     await page.click('[data-act=skills]');await page.locator('.skilltree:not([hidden])').waitFor();await page.click('.st-chip[data-group=available]');await page.locator('.st-result').first().click();await page.locator('[data-act=acquire]').click();await page.click('.st-done');assert.equal(await page.locator('[data-part=skillCount]').textContent(),'1');
     await page.reload();await page.locator('#home:not([hidden])').waitFor();assert.equal(await page.locator('[data-part=skillCount]').textContent(),'1');assert.ok(await page.locator('.skilltree').isHidden());
    }else assert.ok(await page.locator('[data-act=skills]').isHidden());
    if(mode==='factions'){await page.click('[data-faction-quick=forest]');assert.equal(await page.locator('[data-page=menu] [data-id=rank]').count(),0)}
    await page.locator('.home-match-options summary').click();await page.selectOption('.home-match-fields [name=playerCount]','3');await page.selectOption('.home-match-fields [name=stage]','ice');await page.locator('.home-match-options summary').click();
    if(format==='solo')await page.locator('#home').evaluate(e=>e.scrollTop=0);
    await page.screenshot({path:`${out}${device}-${mode}-${format}-home.png`});
    await page.click('.home-start');await page.waitForFunction(()=>Boolean(window.castlefield?.game()));assert.ok(await page.locator('#home').isHidden());assert.ok(await page.locator('.skilltree').count()===0||await page.locator('.skilltree').isHidden());
    const state=await page.evaluate(()=>{const g=castlefield.game();return{players:Object.keys(g.getState(null).players).length,stage:g.getState(null).stage.id,deckMode:g.rules.deckMode,skills:g.getState(null).players}});
    assert.equal(state.players,3);assert.equal(state.stage,'ice');assert.equal(state.deckMode,mode==='factions'?'own':mode==='classic'?'shared':'cost');assert.deepEqual(es,[]);
    report.push({device,mode,format,directStart:true,optionalSkills:mode==='classic',deckMode:state.deckMode,errors:es});console.log(device,mode,format,'passed');await context.close();
   }
  }
 }
 for(const[device,width,height]of[['small',320,568],['tablet',820,1180],['landscape',844,390]]){
  const c=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',serviceWorkers:'block'}),p=await c.newPage();
  await p.goto(base+'/?home=1&fx=lite');await p.locator('.home-start').waitFor();await p.locator('.home-start').scrollIntoViewIfNeeded();
  const geometry=await p.evaluate(()=>{const h=document.querySelector('#home'),b=h.querySelector('.home-start'),r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{overflow:h.scrollWidth>h.clientWidth+1,startClickable:b.contains(hit),height:r.height}});
  assert.equal(geometry.overflow,false);assert.ok(geometry.startClickable);assert.ok(geometry.height>=44);
  await p.screenshot({path:`${out}${device}-home.png`});report.push({device,...geometry});await c.close();
 }
 writeFileSync(out+'report.json' ,JSON.stringify(report,null,2));console.log('Navigation passed',report.length);
}finally{await browser.close();await new Promise(r=>server.close(r))}
