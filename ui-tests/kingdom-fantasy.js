// UI only: node ui-tests/kingdom-fantasy.js (start HTTP on 3000 first).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.UI_TEST_URL ?? 'http://127.0.0.1:3000';
const out = new URL('../assets/review/kingdom-fantasy/', import.meta.url).pathname;
mkdirSync(out, { recursive:true });
const browser = await chromium.launch({ headless:true, executablePath:process.env.UI_TEST_CHROMIUM ?? '/usr/bin/chromium', args:['--no-sandbox'] });
const report = [];
try {
 for (const [device,width,height] of [['pc',1440,900],['tablet',820,1180],['mobile',390,844],['small',320,568],['landscape',844,390]]) {
  const context = await browser.newContext({ viewport:{width,height}, reducedMotion:'reduce', hasTouch:true });
  const page = await context.newPage(); const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/?fx=lite`); await page.locator('#home:not([hidden])').waitFor();
  await page.screenshot({path:`${out}after-home-${device}.png`});
  // Use the production view/model/data; isolated storage keeps real saved builds untouched.
  await page.evaluate(async()=>{
   const {SkillTreeView}=await import('/js/ui/SkillTreeView.js');
   const tree=await(await fetch('/data/classic/skilltree.json')).json();
   const memory=new Map(); window.qaStore={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
   window.st=new SkillTreeView({tree,storage:qaStore});st.open({});
  });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.st-node').count(),201);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const targets=await page.evaluate(()=>[...st.nodeEls.values()].every(({g})=>g.querySelector('.st-hit').getBoundingClientRect().width>=47.9));
  assert.ok(targets,'every SVG hit disc is at least 48 CSS px');
  await page.screenshot({path:`${out}after-tree-${device}.png`});
  await page.locator('[data-group="available"]').click();
  assert.ok(await page.locator('.st-result').count()>0);
  await page.locator('.st-result[data-id="C01"]').click();
  await page.locator('.st-acquire').click();
  assert.ok(await page.locator('.st-node[data-id="C01"]').evaluate(el=>el.classList.contains('st-owned')));
  const saved=await page.evaluate(()=>st.build.ids.includes('C01')&&qaStore.getItem('cf-classic-skilltree')!==null);
  assert.ok(saved);
  await page.screenshot({path:`${out}after-detail-${device}.png`});
  await page.locator('.st-d-close').click();
  await page.locator('[data-group=""]').click();
  await page.locator('.st-search').fill('X25');
  await page.locator('.st-result[data-id="X25"]').click();
  assert.ok(await page.locator('.st-d-desc').isVisible());
  await page.locator('.st-d-close').click();await page.locator('.st-search').fill('');
  await page.locator('[data-zoom="current"]').click();
  const before=await page.evaluate(()=>st.view.k);await page.locator('[data-zoom="in"]').click();assert.ok(await page.evaluate(k=>st.view.k>k,before));
  await page.locator('[data-zoom="out"]').click();await page.locator('[data-zoom="fit"]').click();
  // Browser input produces real pointer capture, including two-finger touch events.
  const stage=await page.locator('.st-svg').boundingBox(),x=stage.x+stage.width*.28,y=stage.y+stage.height*.35;
  const k0=await page.evaluate(()=>st.view.k);
  await page.touchscreen.tap(x,y);await page.touchscreen.tap(x,y);
  const double=await page.evaluate(k=>st.view.k>k,k0);
  const cdp=await context.newCDPSession(page),k1=await page.evaluate(()=>st.view.k);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-20,y,id:1},{x:x+20,y,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-20,y,id:1},{x:x+60,y,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const pinch=await page.evaluate(k=>st.view.k>k,k1),cx=await page.evaluate(()=>st.view.cx);
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+40,y,{steps:4});await page.mouse.up();
  const pan=await page.evaluate(cx=>st.view.cx!==cx,cx),gesture={double,pinch,pan};
  assert.deepEqual(gesture,{double:true,pinch:true,pan:true},device);
  await page.locator('[data-zoom="current"]').click();
  await page.evaluate(()=>st.nodeEls.get(st.selected??st.ix.startId).g.focus());
  await page.keyboard.press('ArrowRight');
  assert.ok(await page.evaluate(()=>st.selected!==null));
  await page.keyboard.press('Escape');assert.ok(await page.locator('.st-detail').isHidden());
  await page.locator('.st-done').click();assert.ok(await page.locator('#skilltree-view').isHidden());
  assert.deepEqual(errors,[]);
  report.push({device,width,height,nodes:201,hitPixels:48,search:true,acquire:true,save:true,gestures:gesture,keyboard:true,errors});
  await context.close();
 }
 writeFileSync(`${out}smoke.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally { await browser.close(); }
