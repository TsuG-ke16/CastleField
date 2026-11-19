// precache.jsのハッシュが変わると更新を検知。新workerは、画面から skipWaiting が届いたら（ホーム・タイトルにいるとき）すぐ有効になり、画面が読み直す。
// 届かなければ、今までどおり全タブを閉じた次の起動で有効になる。
importScripts('./js/ui/precache.js');
const CACHE='castlefield-'+self.CF_CACHE_VERSION;
const ROOT=new URL('./',self.location.href);
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);let index=0;
  await Promise.all(Array.from({length:6},async()=>{while(index<self.CF_ASSETS.length){const path=self.CF_ASSETS[index++];await cache.add(new Request(new URL(path,ROOT),{cache:'reload'}));}}));
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith('castlefield-')&&name!==CACHE)await caches.delete(name);
})()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==ROOT.origin||!url.pathname.startsWith(ROOT.pathname)||url.pathname.includes('/api/'))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(request.mode==='navigate')return await cache.match(new URL('index.html',ROOT))??fetch(request);
    return await cache.match(request,{ignoreSearch:true})??fetch(request);
  })());
});
self.addEventListener('message',event=>{if(event.data==='skipWaiting')self.skipWaiting();});
