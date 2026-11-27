// Existing PR #202 navigation + native dialog: real APIs, no separate gacha fixture page.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createGameServer,loadModeData} from '../server/server.js';
const {chromium}=createRequire(import.meta.url)('playwright');
const out=new URL('../assets/review/gacha/',import.meta.url).pathname;mkdirSync(out,{recursive:true});
const server=createGameServer({modeData:loadModeData(),accounts:{dbPath:':memory:',env:{}}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.UI_TEST_CHROMIUM??'/usr/bin/chromium',args:['--no-sandbox']});
const report=[];
try {
 for(const [device,width,height] of [['pc',1440,900],['mobile',390,844]]){
  const c=await browser.newContext({viewport:{width,height},isMobile:device==='mobile',hasTouch:device==='mobile',serviceWorkers:'block'}),p=await c.newPage(),errors=[];
  p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));
  const press=async s=>p.locator(s)[device==='mobile'?'tap':'click']();
  const shot=async name=>p.screenshot({animations:'disabled',path:`${out}${device}-${name}.png`});
  await p.goto(base+'/?home=1&fx=lite&debug=1');await p.locator('#home:not([hidden])').waitFor();await p.waitForFunction(async()=>!!(await import('/js/ui/Account.js')).account.user);
  const user=(await(await c.request.get(base+'/api/me')).json()).user;server.account.economy.credit(user.id,15000,'ui-test',device);
  await p.reload();await press('.home-tab[data-tab=gacha]');await p.locator('[data-count="1"]:enabled').waitFor();
  assert.equal(await p.locator('#collection.embedded-view').count(),1);
  assert.equal(await p.locator('#collection .social-tabs,.royal-gacha-hero,.royal-reveal').count(),0);
  assert.equal(await p.locator('.gacha-altar').count(),1);assert.equal(await p.locator('[data-act=pull]').count(),2);
  assert.equal(await p.locator('#collection [data-act=buy],#collection [data-act=equip],#collection [data-act=exchange]').count(),0);
  await shot('top');
  let pulls=0;p.on('request',r=>{if(r.url().endsWith('/api/gacha/pull')&&r.method()==='POST')pulls++});
  const before=await p.evaluate(async()=>(await (await import('/js/ui/Account.js')).account.api('GET','/api/shop')).json.coins);
  await press('[data-count="1"]');await p.locator('dialog.gacha-reveal[open]').waitFor();await shot('chest');
  assert.equal(await p.locator('dialog:modal').count(),1);assert.equal(pulls,1);
  await press('.gacha-open');await p.locator('.gacha-reveal[data-phase=charge]').waitFor();
  await press('.gacha-open');await press('.gacha-close');
  await p.locator('.gacha-reveal[data-phase=results]').waitFor();assert.equal(await p.locator('.gacha-card').count(),1);
  await press('.gacha-card');await p.locator('.gacha-reveal[data-phase=inspect]').waitFor();await shot('inspect');
  await p.getByRole('button',{name:'裏返す',exact:true})[device==='mobile'?'tap':'click']();
  assert.equal(await p.locator('.royal-card-back').getAttribute('aria-hidden'),'false');await shot('back');
  await p.locator('.royal-rotation').fill('-180');await p.locator('.royal-rotation').dispatchEvent('input');
  await p.getByRole('button',{name:'角度を戻す',exact:true}).click();assert.equal(await p.locator('.royal-rotation').inputValue(),'0');
  await p.keyboard.press('Escape');await p.locator('.gacha-reveal[data-phase=results]').waitFor();
  await p.keyboard.press('Escape');await p.locator('.gacha-reveal').waitFor({state:'detached'});
  assert.ok(await p.locator('[data-page=gacha]').isVisible());assert.equal(await p.locator('.royal-card').count(),0);
  // Ten rewards stay inside the same dialog; all results and server points are retained.
  await press('[data-count="10"]');await p.locator('.gacha-reveal[open]').waitFor();await press('.gacha-close');
  assert.equal(await p.locator('.gacha-card:visible').count(),10);assert.equal(pulls,2);await shot('ten-results');
  const after=await p.evaluate(async()=>(await (await import('/js/ui/Account.js')).account.api('GET','/api/shop')).json.coins);assert.equal(before-after,1000);
  await press('.gacha-close');await p.waitForTimeout(1800);assert.equal(await p.locator('.gacha-reveal').count(),0);
  // Main nav still goes straight to independent shop and wardrobe.
  await press('.home-tab[data-tab=shop]');await p.locator('[data-shop-source=coin]').waitFor();
  assert.equal(await p.locator('[data-act=pull]').count(),0);assert.equal(await p.locator('[data-act=equip]').count(),0);
  await press('.home-tab[data-tab=menu]');await press('.home-tile[data-id=skin]');await p.locator('.wardrobe-stage').waitFor();
  assert.equal(await p.locator('[data-act=pull],[data-act=buy],[data-act=exchange]').count(),0);
  assert.deepEqual(errors,[]);report.push({device,realPulls:pulls,nativeDialog:true,singleEntry:true,independentDestinations:true,back:true,escapeReturnsToGacha:true,errors});await c.close();
 }
 // Reduced-motion behavior and every rarity use the very same CollectionView.reveal.
 const c=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'}),p=await c.newPage();await p.goto(base+'/?home=1&fx=lite');await p.locator('#home:not([hidden])').waitFor();
 await p.evaluate(async()=>{
  const {CollectionView}=await import('/js/ui/CollectionView.js');document.querySelector('#collection')?.remove();window.fixtureView=new CollectionView();fixtureView.box.hidden=false;
  const shop=await(await fetch('/data/shop.json')).json();window.fixtureItem={id:'unit_shadow',...shop.items.unit_shadow};
 });
 for(const rarity of ['common','uncommon','rare','epic','legendary','special']){
  await p.evaluate(r=>fixtureView.reveal([{rarity:r,item:fixtureItem,duplicate:true,pointsGained:20}]),rarity);
  await p.locator('.gacha-open').click();assert.equal(await p.locator('.gacha-reveal[data-phase=results]').count(),1);assert.match(await p.locator('.gacha-card').innerText(),/重複.*20/);await p.locator('.gacha-close').click();
 }
 await p.emulateMedia({reducedMotion:'no-preference'});
 await p.evaluate(()=>fixtureView.reveal(['rare','epic','legendary'].map(rarity=>({rarity,item:fixtureItem,duplicate:false,pointsGained:0}))));
 await p.evaluate(()=>{const b=document.querySelector('.gacha-open');b.click();b.click();b.click();});
 assert.equal(await p.locator('.gacha-reveal').getAttribute('data-phase'),'card');
 assert.match(await p.locator('.gacha-reveal h3').innerText(),/エピック/);
 await p.locator('.gacha-open').click();assert.match(await p.locator('.gacha-reveal h3').innerText(),/レジェンド/);
 await p.keyboard.press('Escape');assert.equal(await p.locator('.gacha-card:visible').count(),3);await p.keyboard.press('Escape');
 await p.waitForTimeout(1800);assert.equal(await p.locator('.gacha-reveal').count(),0);
 await c.close();writeFileSync(out+'report.json',JSON.stringify(report,null,2)+'\n');console.log('Existing gacha + 3D presentation: PC/mobile, navigation, real draws, rarity, motion, skip, inspection OK');
}finally{await browser.close();await new Promise(r=>server.close(r));}
