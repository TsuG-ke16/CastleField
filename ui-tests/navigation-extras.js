// Retained auxiliary destinations. No invites, purchases or matchmaking requests are sent.
import assert from 'node:assert/strict';import{createRequire}from'node:module';import{mkdirSync,writeFileSync}from'node:fs';
const{chromium}=createRequire(import.meta.url)('playwright');const base=process.env.UI_TEST_URL??'http://127.0.0.1:3000/';const out=new URL(process.env.UI_REVIEW_DIR??'../assets/review/navigation-v4/',import.meta.url);mkdirSync(out,{recursive:true});
const b=await chromium.launch({headless:true,executablePath:process.env.UI_TEST_CHROMIUM??'/usr/bin/chromium'}),report=[];
try{for(const[device,width,height]of[['pc',1440,900],['mobile',390,844]]){
 const c=await b.newContext({viewport:{width,height},reducedMotion:'reduce',serviceWorkers:'block'}),p=await c.newPage(),errors=[];p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));
 await p.goto(new URL('?home=1&fx=lite',base).href);await p.locator('#home:not([hidden])').waitFor();await p.waitForFunction(async()=>!!(await import('/js/ui/Account.js')).account.user);await p.click('.home-tab[data-tab=menu]');
 const shot=async name=>{await p.screenshot({path:new URL(`${device}-${name}.png`,out).pathname});report.push({device,screen:name,errors:[...errors]})};
 for(const[act,id,close]of[['rank','ranked','.ranked-close'],['ranking','ranking','.ranked-close'],['friend','social','.social-close'],['mission','missions','.collection-close'],['help','help','#help-close']]){
  const from=['rank','friend'].includes(act)?'battle':'menu';await p.click(`.home-tab[data-tab=${from}]`);
  await p.click(`.home-tile[data-id=${act}]`);await p.locator(`#${id}:not([hidden])`).waitFor();await p.waitForTimeout(150);await shot(act);
  if(act==='rank'){await p.click('.ranked-rewards-btn');await p.locator('#rank-rewards:not([hidden])').waitFor();await shot('rank-rewards');await p.click('.rank-rewards-close')}
  await p.locator(`#${id} ${close}`).click();assert.ok(await p.locator(`[data-page=${from}]`).isVisible());
 }
 await p.click('.home-tab[data-tab=deck]');await p.click('.home-deck-editbtn');await p.locator('#deck-editor[open]').waitFor();await shot('deck-editor');await p.click('.deck-close');
 await p.click('.home-tile[data-id=catalog]');await p.locator('#card-guide:not([hidden])').waitFor();await shot('catalog');await p.getByRole('button',{name:'一覧を閉じる'}).click();assert.ok(await p.locator('[data-page=deck]').isVisible());
 assert.deepEqual(errors,[]);await c.close();
}writeFileSync(new URL('extras.json',out),JSON.stringify(report,null,2));console.log('Retained destinations passed:',report.length)}finally{await b.close()}
