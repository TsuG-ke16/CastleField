import {sampleData,validateData,layout,assetBase,icons} from './data.mjs';
const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
let data=validateData(sampleData()),geometry,selected='sample-root',picked=new Set(),activeGroup=null,query='',dirty=false;
let camera={x:0,y:0,k:.66},raf=0,initialized=false;
const viewport=$('viewport'),nodeEls=new Map(),edgeEls=[],pointers=new Map();
const stateName={acquired:'取得済み',available:'取得可能',locked:'未解放'};
const svg=(tag,attrs={},parent)=>{const e=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);parent?.append(e);return e;};
const el=(tag,text,cls,parent)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;parent?.append(e);return e;};
const node=id=>data.nodes.find(n=>n.id===id),state=n=>picked.has(n.id)?'acquired':n.state==='acquired'?'available':n.state;
const spend=()=>data.nodes.reduce((a,n)=>a+(picked.has(n.id)?n.cost:0),0);
const asset=path=>assetBase+(typeof path==='string'&&/^(ui|cards)\/[\w/-]+\.png$/.test(path)?path:'ui/icon-kind-spell.png');
const notify=message=>{$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('toast').classList.remove('show'),2600);};
function schedule(){if(!raf)raf=requestAnimationFrame(()=>{raf=0;drawCamera();});}
function drawCamera(){
 $('camera').setAttribute('transform',`translate(${camera.x},${camera.y}) scale(${camera.k})`);
 $('camera').classList.toggle('overview',camera.k<.42);$('zoom-value').textContent=Math.round(camera.k*100)+'%';
 // Viewport culling: keep focusable nodes in view only. No per-frame DOM creation.
 const b=viewport.getBoundingClientRect(),margin=100;
 for(const [id,e]of nodeEls){const p=geometry.positions.get(id),x=p.x*camera.k+camera.x,y=p.y*camera.k+camera.y;e.style.display=x<-margin||y<-margin||x>b.width+margin||y>b.height+margin?'none':'';}
 drawMinimap();
}
function zoomAt(factor,x,y){const k=Math.max(.18,Math.min(1.8,camera.k*factor)),ratio=k/camera.k;camera.x=x-(x-camera.x)*ratio;camera.y=y-(y-camera.y)*ratio;camera.k=k;schedule();}
function focus(x,y,k=.95){const b=viewport.getBoundingClientRect();camera={x:b.width/2-x*k,y:b.height/2-y*k,k};schedule();}
function fit(){const ps=[...geometry.positions.values()],xs=ps.map(p=>p.x),ys=ps.map(p=>p.y),b=viewport.getBoundingClientRect();const minX=Math.min(...xs)-90,maxX=Math.max(...xs)+90,minY=Math.min(...ys)-200,maxY=Math.max(...ys)+90;const k=Math.max(.18,Math.min((b.width-35)/(maxX-minX),(b.height-130)/(maxY-minY),.9));focus((minX+maxX)/2,(minY+maxY)/2,k);}
function drawMinimap(){
 const canvas=$('minimap'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,180,126);const scale=.058,ox=90,oy=66;
 ctx.lineWidth=.6;ctx.strokeStyle='#57757e';ctx.beginPath();for(const e of data.edges){const a=geometry.positions.get(e.source),b=geometry.positions.get(e.target);ctx.moveTo(a.x*scale+ox,a.y*scale+oy);ctx.lineTo(b.x*scale+ox,b.y*scale+oy);}ctx.stroke();
 for(const n of data.nodes){const p=geometry.positions.get(n.id);ctx.fillStyle=picked.has(n.id)?'#b4e8dd':n.kind==='ultimate'?'#f2a347':'#6c939f';ctx.fillRect(p.x*scale+ox-1,p.y*scale+oy-1,2,2);}
 const b=viewport.getBoundingClientRect();ctx.strokeStyle='#8ad7de';ctx.lineWidth=1;ctx.strokeRect(-camera.x/camera.k*scale+ox,-camera.y/camera.k*scale+oy,b.width/camera.k*scale,b.height/camera.k*scale);ctx.fillStyle='#8ad7de10';ctx.fillRect(-camera.x/camera.k*scale+ox,-camera.y/camera.k*scale+oy,b.width/camera.k*scale,b.height/camera.k*scale);
}
function buildGraph(){
 geometry=layout(data);for(const id of ['halos','edges','labels','nodes'])$(id).replaceChildren();nodeEls.clear();edgeEls.length=0;
 data.groups.forEach(g=>{const p=geometry.centers.get(g.id);svg('circle',{cx:p.x,cy:p.y,r:235,class:'cluster-halo'},$('halos'));const t=svg('text',{x:p.x,y:p.y-280,class:'cluster-label'},$('labels'));t.textContent=g.name;const s=svg('text',{x:p.x,y:p.y-259,class:'cluster-subtitle'},$('labels'));s.textContent=data.sample?'LAYOUT SAMPLE':`${data.nodes.filter(n=>n.group===g.id).length} NODES`;});
 for(const e of data.edges){const a=geometry.positions.get(e.source),b=geometry.positions.get(e.target),line=svg('path',{d:`M ${a.x} ${a.y} L ${b.x} ${b.y}`,class:'edge'},$('edges'));edgeEls.push({line,edge:e});}
 for(const n of data.nodes){
  const p=geometry.positions.get(n.id),root=n.kind==='root',ult=n.kind==='ultimate',r=root?55:ult?39:26;
  const g=svg('g',{transform:`translate(${p.x} ${p.y})`,tabindex:'0',role:'button','data-id':n.id,'aria-label':n.name},$('nodes'));
  svg('circle',{r:r+11,class:'selection-ring'},g);
  if(ult)svg('path',{d:`M 0 -52 L 52 0 L 0 52 L -52 0 Z`,class:'node-disc'},g);else svg('circle',{r,class:'node-disc'},g);
  svg('image',{href:asset(n.icon??data.groups.find(x=>x.id===n.group)?.icon),x:-r*.65,y:-r*.65,width:r*1.3,height:r*1.3},g);
  const badge=svg('g',{class:'check-badge',transform:`translate(${r*.75},${r*.75})`},g);svg('circle',{r:8,class:'node-check-disc'},badge);const check=svg('text',{y:5,class:'node-check'},badge);check.textContent='✓';
  if(ult){const t=svg('text',{y:72,class:'ultimate-mark'},g);t.textContent='奥義';}
  else if(!root){const t=svg('text',{y:43,class:'node-id'},g);t.textContent=n.name;}
  else{const t=svg('text',{y:84,class:'root-title'},g);t.textContent=n.name;}
  g.addEventListener('click',()=>{if(!suppressClick)select(n.id);});g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();select(n.id);}});nodeEls.set(n.id,g);
 }
 renderGroups();renderStates();schedule();
}
function renderStates(){
 for(const n of data.nodes){const e=nodeEls.get(n.id);e.setAttribute('class',`skill-node ${n.kind} ${n.kind==='root'?'root-node':''} ${state(n)} ${selected===n.id?'selected':''} ${query&&!`${n.name} ${data.groups.find(g=>g.id===n.group)?.name??''}`.toLowerCase().includes(query)?'search-dim':''}`);e.setAttribute('aria-label',`${n.name}、${n.kind==='ultimate'?'奥義、':''}${stateName[state(n)]}`);e.setAttribute('aria-pressed',String(selected===n.id));e.querySelector('.check-badge').style.display=picked.has(n.id)?'':'none';}
 for(const {line,edge}of edgeEls)line.setAttribute('class',`edge ${picked.has(edge.source)&&picked.has(edge.target)?'acquired':''} ${edge.target===selected||edge.source===selected?'focused':''}`);
 const used=spend();$('points').replaceChildren(document.createTextNode(String(data.maxPoints-used)));el('small',` / ${data.maxPoints} SP`,'',$('points'));
 $('picked-count').replaceChildren(document.createTextNode(String(picked.size)+' '));el('small','/ 200','',$('picked-count'));$('spent').replaceChildren(document.createTextNode(String(used)+' '));el('small','SP','',$('spent'));$('progress').style.width=(data.maxPoints?100*used/data.maxPoints:0)+'%';
 $('save').textContent=dirty?'ビルド保存 *':'ビルド保存';drawMinimap();renderDetail();
}
function renderGroups(){
 $('groups').replaceChildren();data.groups.forEach((g,i)=>{
  const items=data.nodes.filter(n=>n.group===g.id),searchMatch=!query||`${g.name} ${items.map(n=>n.name).join(' ')}`.toLowerCase().includes(query);if(!searchMatch)return;
  const b=el('button',null,`group-button ${activeGroup===g.id?'active':''}`,$('groups'));b.dataset.group=g.id;b.setAttribute('aria-pressed',String(activeGroup===g.id));const img=el('img',null,'group-icon',b);img.src=asset(g.icon??icons[i]);img.alt='';const name=el('span',g.name,'group-name',b);el('small',data.sample?'表示用クラスター':'スキル系統','',name);el('span',`${items.filter(n=>picked.has(n.id)).length} / ${items.length}`,'group-count',b);
  b.onclick=()=>{activeGroup=g.id;const c=geometry.centers.get(g.id);focus(c.x,c.y,viewport.clientWidth<600?.9:1);$('map-title').textContent=g.name;$('map-subtitle').textContent=`${items.length}ノード · ${data.sample?'表示サンプル':data.title??'仕様データ'}`;renderGroups();};
 });
}
function select(id){selected=id;renderStates();$('inspector').classList.add('open');}
function renderDetail(){
 const n=node(selected)??data.nodes[0],group=data.groups.find(g=>g.id===n.group),container=$('detail');container.replaceChildren();
 const card=el('div',null,'detail-card',container),art=el('img',null,'card-art',card);art.src=asset(n.icon??group?.icon);art.alt='';const frame=el('img',null,'frame',card);frame.src=assetBase+`cards/frame-${n.kind==='ultimate'?'legendary':'rare'}.png`;frame.alt='';el('span',n.kind==='ultimate'?'奥義':n.name,'card-name',card);el('span',data.sample?'表示サンプル':group?.name??'ROOT','card-caption',card);
 el('p',group?.name??'ツリーの中心','detail-group',container);el('h3',n.name,'detail-title',container);el('span',`${state(n)==='acquired'?'✓ ':''}${stateName[state(n)]}${n.kind==='ultimate'?' / 奥義':''}`,`state-chip ${state(n)}`,container);el('p',n.description??'効果の記載はありません。','detail-description',container);
 const condition=el('div','取得条件','detail-condition',container);el('strong',n.condition??(data.sample?'表示サンプル・取得判定未接続':'取得判定は本体APIから提供'),' ',condition);
 const b=el('button',picked.has(n.id)?'取得済み':data.sample?`取得済みの表示を試す · ${n.cost} SP`:'取得判定API 未接続','primary detail-action',container);
 b.disabled=!data.sample||picked.has(n.id)||state(n)!=='available'||spend()+n.cost>data.maxPoints;
 b.onclick=()=>{if(!data.sample||state(n)!=='available'||picked.has(n.id))return;if(spend()+n.cost>data.maxPoints)return;picked.add(n.id);dirty=true;renderStates();renderGroups();notify('表示サンプルを取得済みに変更しました');};
 el('p',data.sample?'表示の体験用です。取得条件は判定しません。':'本番の取得条件・効果は変更しません。','detail-footnote',container);
}
function resetState(){picked=new Set(data.nodes.filter(n=>n.state==='acquired').map(n=>n.id));dirty=false;}
function dialog(title,render){$('dialog-title').textContent=title;$('dialog-body').replaceChildren();render($('dialog-body'));$('dialog').showModal();}
$('dialog-close').onclick=()=>$('dialog').close();$('dialog').onclick=e=>{if(e.target===$('dialog')&&(e.clientX<$('dialog').getBoundingClientRect().left||e.clientX>$('dialog').getBoundingClientRect().right||e.clientY<$('dialog').getBoundingClientRect().top||e.clientY>$('dialog').getBoundingClientRect().bottom))$('dialog').close();};
function loadBuilds(){try{const x=JSON.parse(localStorage.getItem('castle-field.skill-preview.builds.v1')??'[]');return Array.isArray(x)?x:[];}catch{return [];}}
$('save').onclick=()=>dialog('ビルドを保存',p=>{el('p','このブラウザのプレビュー専用領域に保存します。ゲームのセーブデータとは共有しません。','',p);const input=el('input',null,'',p);input.id='build-name';input.maxLength=40;input.placeholder='ビルド名';input.value=`育成プラン ${loadBuilds().length+1}`;input.setAttribute('aria-label','ビルド名');const row=el('div',null,'dialog-buttons',p),b=el('button','保存する','primary',row);b.onclick=()=>{if(!input.value.trim()){input.focus();return;}const saved=loadBuilds();saved.unshift({name:input.value.trim(),dataset:data.id,picked:[...picked],time:new Date().toISOString(),sample:!!data.sample});try{localStorage.setItem('castle-field.skill-preview.builds.v1',JSON.stringify(saved.slice(0,20)));dirty=false;renderStates();$('dialog').close();notify('ビルドをこのブラウザに保存しました');}catch{notify('保存できませんでした。ブラウザの保存設定を確認してください。');}};setTimeout(()=>input.focus(),0);});
$('builds').onclick=()=>dialog('保存したビルド',p=>{const saved=loadBuilds().filter(b=>b.dataset===data.id);if(!saved.length)el('p','この仕様データで保存したビルドはまだありません。','',p);saved.forEach(b=>{const row=el('div',null,'saved-item',p),label=el('div',null,'',row);el('strong',b.name,'',label);el('small',`${b.picked.length}ノード · ${new Date(b.time).toLocaleDateString('ja-JP')}`,'',label);const load=el('button','読込','secondary',row);load.onclick=()=>{const ids=new Set(data.nodes.map(n=>n.id));if(!Array.isArray(b.picked)||b.picked.some(id=>!ids.has(id))){notify('保存データがこの仕様と一致しません');return;}const candidate=new Set(b.picked),cost=data.nodes.filter(n=>candidate.has(n.id)).reduce((a,n)=>a+n.cost,0);if(cost>data.maxPoints){notify('保存データのポイントが上限を超えています');return;}picked=candidate;dirty=false;renderStates();renderGroups();$('dialog').close();notify('保存した表示状態を読み込みました');};});});
$('reset').onclick=()=>dialog('振り直し',p=>{el('p','プレビューの取得表示を初期状態に戻します。保存したビルドは残ります。本番の振り直し条件・消費は未接続です。','',p);const row=el('div',null,'dialog-buttons',p),cancel=el('button','キャンセル','secondary',row);cancel.onclick=()=>$('dialog').close();const b=el('button','表示を初期化','primary',row);b.onclick=()=>{resetState();dirty=true;renderStates();renderGroups();$('dialog').close();notify('表示状態を初期化しました');};});
$('help').onclick=()=>dialog('ツリーの操作',p=>{el('p','マウス：ドラッグで移動、ホイールで拡大・縮小。タッチ：1本指で移動、2本指でピンチ。','',p);el('p','キーボード：マップにフォーカスして矢印キーで移動、＋ / −で拡大縮小。ノードはTabで選んでEnterで詳細を開けます。','',p);el('p','系統一覧でクラスターへ移動。「全体」で200ノードを見渡せます。選択したノードにつながる線を強調します。','',p);for(const [text,id]of [['振り直し','reset'],['保存したビルド','builds']]){const b=el('button',text,'secondary',p);b.style.marginRight='8px';b.onclick=()=>{$('dialog').close();$(id).click();};}});
$('search').oninput=e=>{query=e.target.value.trim().toLowerCase();renderGroups();renderStates();};
$('overview').onclick=()=>{activeGroup=null;$('map-title').textContent='成長のつながり';$('map-subtitle').textContent='200ノード / 19系統';renderGroups();fit();};
$('fit').onclick=()=>$('overview').click();$('close-detail').onclick=()=>$('inspector').classList.remove('open');
for(const [id,f]of [['zoom-in',1.2],['zoom-out',1/1.2]])$(id).onclick=()=>zoomAt(f,viewport.clientWidth/2,viewport.clientHeight/2);
viewport.addEventListener('wheel',e=>{e.preventDefault();const b=viewport.getBoundingClientRect();zoomAt(Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.0025),e.clientX-b.left,e.clientY-b.top);},{passive:false});
let suppressClick=false,gesture=null;
const pair=()=>{const [a,b]=[...pointers.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.hypot(a.x-b.x,a.y-b.y)};};
viewport.addEventListener('pointerdown',e=>{if(e.button!==0)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY});gesture=pointers.size===2?pair():null;suppressClick=false;viewport.classList.add('dragging');});
viewport.addEventListener('pointermove',e=>{const old=pointers.get(e.pointerId);if(!old)return;const b=viewport.getBoundingClientRect();if(Math.hypot(e.clientX-old.startX,e.clientY-old.startY)>5){suppressClick=true;viewport.setPointerCapture(e.pointerId);}pointers.set(e.pointerId,{...old,x:e.clientX,y:e.clientY});
 if(pointers.size===2){suppressClick=true;const current=pair();if(gesture){const midX=gesture.x-b.left,midY=gesture.y-b.top;zoomAt(current.d/Math.max(1,gesture.d),midX,midY);camera.x+=current.x-gesture.x;camera.y+=current.y-gesture.y;}gesture=current;}else{camera.x+=e.clientX-old.x;camera.y+=e.clientY-old.y;}schedule();});
function endPointer(e){pointers.delete(e.pointerId);gesture=null;if(!pointers.size)viewport.classList.remove('dragging');setTimeout(()=>{if(!pointers.size)suppressClick=false;},0);}
viewport.addEventListener('pointerup',endPointer);viewport.addEventListener('pointercancel',endPointer);viewport.addEventListener('lostpointercapture',e=>{pointers.delete(e.pointerId);if(!pointers.size)viewport.classList.remove('dragging');});
viewport.addEventListener('keydown',e=>{const moves={ArrowLeft:[70,0],ArrowRight:[-70,0],ArrowUp:[0,70],ArrowDown:[0,-70]};if(moves[e.key]){e.preventDefault();camera.x+=moves[e.key][0];camera.y+=moves[e.key][1];schedule();}if(e.key==='+'||e.key==='='){e.preventDefault();$('zoom-in').click();}if(e.key==='-'){e.preventDefault();$('zoom-out').click();}if(e.key==='Escape')$('inspector').classList.remove('open');});
$('minimap').onclick=e=>{const b=e.currentTarget.getBoundingClientRect(),x=(e.clientX-b.left)*180/b.width,y=(e.clientY-b.top)*126/b.height;focus((x-90)/.058,(y-66)/.058,camera.k);};
$('import').onclick=()=>$('import-file').click();$('import-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>2_000_000)throw Error('ファイルは2MB以下にしてください。');const next=validateData(JSON.parse(await file.text()));next.sample=false;data=next;resetState();selected=data.nodes[0].id;activeGroup=null;buildGraph();$('notice').replaceChildren();el('span','仕様データ表示','notice-badge',$('notice'));el('span','接続線は読込データをそのまま表示。取得判定・戦闘処理は未接続です。','',$('notice'));$('source-status').textContent=data.id;$('map-subtitle').textContent='200ノード / 19系統 · 仕様データ';fit();notify('仕様データを読み込みました');}catch(err){notify(`読み込めません：${err.message}`);}finally{e.target.value='';}};
new ResizeObserver(()=>{if(initialized)schedule();}).observe(viewport);
resetState();buildGraph();initialized=true;focus(0,-230,viewport.clientWidth<600?.58:.66);
// A visual prototype owns no Game object, acquisition callback or production storage.
