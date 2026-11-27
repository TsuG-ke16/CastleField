// Extends PR #202's existing native result dialog. No navigation, page, API or modal creation.
import { itemPreview } from './Cosmetics.js';
const NAMES = { common:'コモン',uncommon:'アンコモン',rare:'レア',epic:'エピック',legendary:'レジェンド',special:'スペシャル' };
const node=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls;if(text!=null)e.textContent=text;return e;};
const button=(text,fn)=>{const b=node('button','small-btn',text);b.type='button';b.addEventListener('click',fn);return b;};
function treasureChest(){
 const camera=node('div','royal-chest-camera');camera.setAttribute('aria-hidden','true');
 camera.innerHTML=`<div class="royal-chest"><div class="chest-body"><i class="chest-front"><span class="chest-crest">♛</span></i><i class="chest-back"></i><i class="chest-left"></i><i class="chest-right"></i><i class="chest-floor"></i></div><div class="chest-lid"><i class="lid-top"><span>✦</span></i><i class="lid-front"></i><i class="lid-back"></i><i class="lid-left"></i><i class="lid-right"></i></div></div>`;
 return camera;
}
export class GachaPresentation {
 constructor({wrap,capsule,launch,grid,hint,skip,title,results,reducedMotion=false}){
  Object.assign(this,{wrap,capsule,launch,grid,hint,skip,title,results});
  this.phase='waiting';this.index=0;this.closed=false;
  this.reduced=reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.queue=results.length===1?results:results.filter(r=>['epic','legendary','special'].includes(r.rarity));
  wrap.classList.add('gacha-enhanced');wrap.dataset.phase='waiting';
  wrap.dataset.rarity=results.reduce((a,r)=>['common','uncommon','rare','epic','legendary','special'].indexOf(r.rarity)>['common','uncommon','rare','epic','legendary','special'].indexOf(a)?r.rarity:a,'common');
  wrap.classList.toggle('fx-lite',new URLSearchParams(location.search).get('fx')==='lite');
  const halo=node('div','royal-halo'),particles=node('div','royal-particles');particles.setAttribute('aria-hidden','true');
  for(let i=0;i<16;i++){const p=node('i','');p.style.setProperty('--n',i);particles.append(p);}
  this.cardSlot=node('div','royal-card-slot');this.chest=treasureChest();
  capsule.replaceChildren(halo,particles,this.chest,this.cardSlot);
  this.controls=node('div','royal-controls');this.controls.hidden=true;wrap.insertBefore(this.controls,hint);
  skip.hidden=false;skip.textContent='スキップ';
  launch.addEventListener('click',e=>{e.stopPropagation();this.next();});
  skip.addEventListener('click',e=>{e.stopPropagation();if(this.phase==='results')wrap.close();else this.showResults();});
  capsule.addEventListener('click',()=>{if(this.phase!=='inspect')this.next();});
  wrap.addEventListener('cancel',e=>{if(!['waiting','results'].includes(this.phase)){e.preventDefault();this.showResults();}});
  wrap.addEventListener('close',()=>this.dispose(),{once:true});
  [...grid.children].forEach((c,i)=>{
   c.tabIndex=0;c.setAttribute('role','button');c.setAttribute('aria-label',`${results[i].item.name}を観賞する`);
   c.addEventListener('click',()=>this.inspect(results[i],c));
   c.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();this.inspect(results[i],c);}});
  });
 }
 schedule(ms){clearTimeout(this.timer);this.timer=setTimeout(()=>this.next(),ms);}
 state(phase){this.phase=phase;this.wrap.dataset.phase=phase;}
 next(){
  if(this.closed)return;clearTimeout(this.timer);
  if(this.reduced){this.showResults();return;}
  if(this.phase==='waiting'){this.state('charge');this.title.textContent='宝箱に光が集まる…';this.launch.textContent='タップで早送り';this.schedule(900);}
  else if(this.phase==='charge'){this.state('open');this.title.textContent='封印が解かれる…';this.schedule(700);}
  else if(this.phase==='open'){if(this.queue.length)this.revealCard();else this.showResults();}
  else if(this.phase==='card'){this.index++;if(this.index<this.queue.length)this.revealCard();else this.showResults();}
 }
 makeCard(r){
  const card=node('div',`royal-card r-${r.rarity}`),front=node('div','royal-card-front');
  const crest=new Image();crest.src='assets/ui/kingdom-crest.png';crest.alt='';crest.className='royal-card-crest';
  front.append(node('span',r.duplicate?'royal-duplicate':'royal-new',r.duplicate?`重複 +${r.pointsGained}pt`:'NEW'),crest,itemPreview(r.item),node('span','royal-rarity',NAMES[r.rarity]??r.rarity),node('strong','royal-card-name',r.item.name));
  const back=node('div','royal-card-back'),img=new Image();img.src='assets/ui/card-back.png';img.alt='王国のカード裏面';back.append(img);back.setAttribute('aria-hidden','true');card.append(front,back);return card;
 }
 revealCard(){const r=this.queue[this.index];this.state('card');this.wrap.dataset.rarity=r.rarity;this.title.textContent=`${NAMES[r.rarity]??r.rarity}！`;this.cardSlot.replaceChildren(this.makeCard(r));this.schedule(1500);}
 showResults(){
  if(this.closed)return;clearTimeout(this.timer);this.state('results');this.wrap.classList.add('opened','all');this.title.textContent='宝箱の中身';
  this.capsule.hidden=true;this.cardSlot.replaceChildren();this.grid.hidden=false;this.controls.hidden=true;this.controls.replaceChildren();this.launch.hidden=true;
  this.hint.hidden=false;this.hint.textContent='獲得カードをタップで観賞';this.skip.textContent='とじる';this.skip.focus({preventScroll:true});
 }
 inspect(r,opener){
  if(this.phase!=='results')return;this.state('inspect');this.opener=opener;this.angle=0;
  this.wrap.dataset.rarity=r.rarity;this.title.textContent=r.item.name;this.grid.hidden=true;this.capsule.hidden=false;
  const card=this.makeCard(r);this.cardSlot.replaceChildren(card);this.hint.textContent='ドラッグで傾ける / スライダーで回転';this.skip.textContent='一覧に戻る';
  const range=node('input','royal-rotation');range.type='range';range.min='-180';range.max='180';range.value='0';range.setAttribute('aria-label','カードの回転角度');
  const rotate=(x,y=0)=>{card.style.transform=`rotateX(${y}deg) rotateY(${x}deg)`;const back=Math.abs(x)>90;card.children[0].setAttribute('aria-hidden',String(back));card.children[1].setAttribute('aria-hidden',String(!back));};
  range.addEventListener('input',()=>{this.angle=Number(range.value);rotate(this.angle);});
  let pointer=null;
  card.addEventListener('pointerdown',e=>{pointer={x:e.clientX,y:e.clientY};card.setPointerCapture(e.pointerId);});
  card.addEventListener('pointermove',e=>{if(pointer)rotate(this.angle+Math.max(-28,Math.min(28,(e.clientX-pointer.x)/3)),Math.max(-18,Math.min(18,(pointer.y-e.clientY)/4)));});
  const release=()=>{pointer=null;rotate(this.angle);};card.addEventListener('pointerup',release);card.addEventListener('pointercancel',release);
  this.controls.replaceChildren(range,button('裏返す',()=>{this.angle=this.angle===0?180:0;range.value=String(this.angle);rotate(this.angle);}),button('角度を戻す',()=>{this.angle=0;range.value='0';rotate(0);}));this.controls.hidden=false;range.focus({preventScroll:true});
 }
 dispose(){this.closed=true;clearTimeout(this.timer);this.cardSlot.replaceChildren();this.controls.replaceChildren();}
}
