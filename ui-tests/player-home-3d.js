// Confirm the larger hero with the normal WebGL diorama, not only the lite fallback.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)('playwright');
const base=process.env.UI_TEST_URL??'http://127.0.0.1:3000/';
const out=new URL(process.env.UI_REVIEW_DIR??'../assets/review/player-layout-v5/',import.meta.url);mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.UI_TEST_CHROMIUM??'/usr/bin/chromium'}),report=[];
try{for(const [device,width,height] of [['pc',1440,900],['mobile',390,844]]){
 const c=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',serviceWorkers:'block'}),p=await c.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(180000);
 await p.goto(new URL('?home=1',base).href);await p.locator('#home.diorama-3d-ready').waitFor();
 await p.waitForFunction(()=>{const c=document.querySelector('.home-diorama-canvas');return c?.width>0&&c?.height>0});
 assert.ok(await p.locator('.home-diorama-canvas').evaluate(c=>{const gl=c.getContext('webgl2');return gl&&!gl.isContextLost()}));
 const hero=await p.locator('.home-hero').boundingBox();assert.ok(hero.height>=210);
 await p.screenshot({path:new URL(`${device}-home-3d.png`,out).pathname,timeout:60000});
 assert.deepEqual(errors,[]);report.push({device,webgl:true,hero,errors});console.log(device,'normal home 3D passed');await c.close();
}writeFileSync(new URL('home-3d.json',out),JSON.stringify(report,null,2)+'\n')}finally{await browser.close()}
