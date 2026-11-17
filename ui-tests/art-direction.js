// Art assets and cross-screen styling must remain loaded, readable and inside the viewport.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {statSync,mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
const {chromium}=createRequire(import.meta.url)('playwright');
const base=process.env.UI_TEST_URL??'http://127.0.0.1:8000/';
const assets=['bg/kingdom-meadow.png','bg/kingdom-valley.png',...['crest','parchment','platform','primary','secondary','wood'].map(x=>`ui/kingdom-${x}.png`)];
let browser,server;const errors=[];
try{
 for(const name of assets)assert.ok(statSync(new URL(`../assets/${name}`,import.meta.url)).size<=300*1024,`${name} fits the image budget`);
 try{await fetch(base)}catch{
  server=spawn('python3',['-m','http.server','8000','--bind','127.0.0.1'],{cwd:new URL('../',import.meta.url),stdio:'ignore'});
  for(let i=0;i<50;i++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,100))}}
 }
 mkdirSync(new URL('./artifacts/',import.meta.url),{recursive:true});
 browser=await chromium.launch();
 for(const [width,height] of [[390,844],[360,640]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});page.setDefaultTimeout(15000);
  page.on('pageerror',e=>errors.push(e.message));
  const url=new URL(base);url.search='?local=1&cpu=hard&debug=1&seed=8';await page.goto(url.href);
  await page.waitForFunction(()=>window.castlefield?.game()&&!document.querySelector('#app').classList.contains('busy'));
  await page.addStyleTag({content:'#debug-toggle{display:none}'});
  const loaded=await page.evaluate(async names=>Promise.all(names.map(async name=>{const i=new Image();i.src=`assets/${name}`;try{await i.decode();return i.naturalWidth>0}catch{return false}})),assets);
  assert.ok(loaded.every(Boolean),'all generated assets decode');
  assert.ok(await page.locator('#end-turn').evaluate(e=>getComputedStyle(e).borderImageSource.includes('kingdom-primary')),'main action uses generated primary material');
  assert.ok(await page.locator('#scenery').evaluate(e=>getComputedStyle(e).backgroundImage.includes('kingdom-meadow')),'portrait uses portrait art');
  assert.ok(await page.locator('#turn-status').evaluate(e=>getComputedStyle(e,'::before').backgroundImage.includes('kingdom-crest')),'crest remains visible on own turn');
  await page.locator('#menu-open').click();await page.locator('#menu-settings').click();
  await page.locator('#settings').waitFor({state:'visible'});
  await page.screenshot({path:new URL(`./artifacts/kingdom-settings-${width}.png`,import.meta.url).pathname});
  await page.locator('.settings-close').click();
  if(await page.locator('#menu').isVisible()) await page.locator('#menu-close').click();
  await page.locator('#menu-open').click();await page.locator('#menu-catalog').click();
  await page.locator('#card-guide').waitFor({state:'visible'});
  await page.screenshot({path:new URL(`./artifacts/kingdom-catalog-${width}.png`,import.meta.url).pathname});
  await page.locator('.guide-box .round-btn').click();
  await page.locator('#upgrade-open').click();await page.locator('#upgrade-panel').waitFor({state:'visible'});
  await page.locator('#shop-tab-special').click();
  assert.ok(await page.locator('.upgrade-item').first().evaluate(e=>e.getBoundingClientRect().width>250),'shop descriptions use the full row');
  assert.equal(await page.locator('#shop-tab-special').evaluate(e=>getComputedStyle(e).borderImageSource),'none','selected tab uses readable solid enamel');
  const rect=await page.locator('#upgrade-panel').boundingBox();assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=width+1&&rect.y+rect.height<=height+1,'shop fits screen');
  await page.screenshot({path:new URL(`./artifacts/kingdom-shop-${width}.png`,import.meta.url).pathname});
  await page.locator('.upgrade-close').focus();await page.keyboard.press('Enter');
  await page.locator('#upgrade-panel').waitFor({state:'hidden'});
  await page.setViewportSize({width:844,height:390});
  assert.ok(await page.locator('#scenery').evaluate(e=>getComputedStyle(e).backgroundImage.includes('kingdom-valley')),'landscape uses wide art');
  await page.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS: generated PNG budgets/decoding, responsive backgrounds, crest and primary material, settings/catalog/shop');
}finally{await browser?.close();server?.kill()}
