// Verify fixed-density image composition and complete coverage of real, including dynamic, controls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync,mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
const {chromium}=createRequire(import.meta.url)('playwright');
const base=process.env.UI_TEST_URL??'http://127.0.0.1:8000/';
const folder=new URL('../assets/ui/natural/',import.meta.url);
const files=readdirSync(folder).filter(n=>n.endsWith('.png'));
for(const name of files){
 const b=readFileSync(new URL(name,folder));assert.ok(b.length<=300*1024,`${name}: image budget`);
 const w=b.readUInt32BE(16),h=b.readUInt32BE(20),m=name.match(/-(40|44|72)-(left|middle|right)/);
 if(m){const size=Number(m[1]),cap={40:14,44:16,72:26}[size];assert.equal(h,size*2);assert.equal(w,m[2]==='middle'?2:cap*2,'native 2x pixel density');}
}
let browser,server;const errors=[];
try{
 try{await fetch(base)}catch{server=spawn('python3',['-m','http.server','8000','--bind','127.0.0.1'],{cwd:new URL('../',import.meta.url),stdio:'ignore'});for(let i=0;i<50;i++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,100))}}}
 mkdirSync(new URL('./artifacts/',import.meta.url),{recursive:true});
 browser=await chromium.launch();
 for(const[width,height]of[[390,844],[360,640],[844,390],[1440,1000]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});page.setDefaultTimeout(15000);
  page.on('pageerror',e=>errors.push(e.message));const url=new URL(base);url.search='?local=1&cpu=hard&debug=1&seed=8';await page.goto(url.href);
  await page.waitForFunction(()=>window.castlefield?.game()&&!document.querySelector('#app').classList.contains('busy'));
  await page.addStyleTag({content:'#debug-toggle{display:none}'});
  async function coverage(){
   const missing=await page.evaluate(()=>[...document.querySelectorAll('button')].filter(e=>e.getClientRects().length&&!e.closest('#debug-panel')&&e.id!=='debug-toggle').filter(e=>!e.dataset.uiSkin||!getComputedStyle(e).backgroundImage.includes('/natural/')).map(e=>e.id||e.textContent));
   assert.deepEqual(missing,[],'every visible button uses the shared image kit');
  }
  await coverage();
  const geometry=await page.evaluate(()=>{
   const b=getComputedStyle(document.querySelector('#end-turn')),p=getComputedStyle(document.querySelector('#controls')),card=document.querySelector('#hand .card').getBoundingClientRect();
   return{button:b.backgroundSize,repeat:b.backgroundRepeat,frameRepeat:p.borderImageRepeat,slice:p.borderImageSlice,tile:p.backgroundSize,cardRatio:card.width/card.height};
  });
  assert.match(geometry.button,/16px 44px, 16px 44px, 1px 44px/);assert.match(geometry.repeat,/repeat-x/);
  assert.equal(geometry.frameRepeat,'repeat');assert.ok(!geometry.slice.includes('fill'),'frame has no stretched center');assert.match(geometry.tile,/128px 128px/);
  assert.ok(Math.abs(geometry.cardRatio-2/3)<.002,'card illustrations keep their aspect ratio');
  if(width===390){
   const contrast=await page.evaluate(async()=>{
    const linear=v=>(v/=255)<=.04045?v/12.92:((v+.055)/1.055)**2.4;
    const lum=c=>c.reduce((n,v,i)=>n+linear(v)*[.2126,.7152,.0722][i],0);
    const results={};
    for(const[tone,text]of[['neutral',[55,47,37]],['primary',[55,47,37]],['selected',[255,255,255]],['danger',[255,248,233]]]){
     const im=new Image();im.src=`assets/ui/natural/${tone}-44-middle.png`;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);const bg=[...x.getImageData(1,44,1,1).data].slice(0,3);const a=lum(bg),b=lum(text);results[tone]=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    }return results;
   });
   for(const[tone,ratio]of Object.entries(contrast))assert.ok(ratio>=4.5,`${tone} text contrast ${ratio}`);
   console.log('contrast',JSON.stringify(contrast));
  }
  await page.locator('#menu-open').click();await page.locator('#match-info summary').click();await coverage();
  await page.screenshot({path:new URL(`./artifacts/material-menu-${width}.png`,import.meta.url).pathname});
  await page.locator('#menu-catalog').click();await page.locator('.guide-card').first().waitFor();await coverage();
  await page.screenshot({path:new URL(`./artifacts/material-guide-${width}.png`,import.meta.url).pathname});
  await page.locator('.guide-box .round-btn').focus();await page.keyboard.press('Enter');
  await page.locator('#upgrade-open').click();await page.locator('#shop-tab-special').click();await coverage();
  await page.screenshot({path:new URL(`./artifacts/material-shop-${width}.png`,import.meta.url).pathname});
  await page.locator('.upgrade-close').focus();await page.keyboard.press('Enter');
  await page.locator('#menu-open').click();await page.locator('#menu-settings').click();await coverage();
  await page.screenshot({path:new URL(`./artifacts/material-settings-${width}.png`,import.meta.url).pathname});
  await page.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS: native 2x slices, repeated material density, fixed frame corners, all buttons including dynamic controls, contrast, card aspect ratios, 4 viewports');
}finally{await browser?.close();server?.kill()}
