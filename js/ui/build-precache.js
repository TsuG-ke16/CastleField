// PWAの配信内容を変えたら実行：node js/ui/build-precache.js
// ランタイムでは読み込まない。Node標準ライブラリだけで一覧と内容ハッシュを更新する。
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url));
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(join(dir,entry.name)):[join(dir,entry.name)]);
const paths=['index.html','manifest.webmanifest'];
for(const dir of ['css','js','data','assets'])for(const file of walk(join(root,dir)).sort()){
  const path=relative(root,file).replaceAll('\\','/');
  if(path.split('/').includes('review')||['style-reference.png','precache.js','build-precache.js','build-card-relief.js'].includes(path.split('/').at(-1))||!(/\.(js|css|json|png|webp)$/).test(path))continue;
  paths.push(path);
}
const hash=createHash('sha256');
for(const path of paths){hash.update(path);hash.update(readFileSync(join(root,path)));}
const source=`self.CF_CACHE_VERSION=${JSON.stringify(hash.digest('hex').slice(0,16))};\nself.CF_ASSETS=${JSON.stringify(paths)};\n`;
writeFileSync(join(root,'js/ui/precache.js'),source);
console.log(`PWA: ${paths.length}ファイルの一覧・版を更新しました`);
