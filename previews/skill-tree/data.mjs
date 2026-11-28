// Layout fixtures only. These are NOT production skill IDs, links, costs or rules.
export const assetBase = '../../assets/';
export const icons = ['ui/icon-kind-spell.png','ui/icon-fire.png','ui/icon-water.png','ui/icon-earth.png','ui/icon-wind.png','ui/icon-kind-defense.png','ui/icon-heart.png','ui/icon-mp.png','ui/icon-luck.png','ui/icon-kind-wild.png','ui/factions/crest-kingdom.png','ui/factions/crest-forest.png','ui/factions/crest-demon.png','ui/factions/crest-dragon.png','ui/home/deck.png','ui/home/rank.png','ui/icon-kind-defense.png','ui/icon-coin.png','ui/home/catalog.png'];
export function sampleData(){
 const groups=Array.from({length:19},(_,i)=>({id:`sample-group-${i+1}`,name:`系統${String(i+1).padStart(2,'0')}`,icon:icons[i]}));
 const nodes=[{id:'sample-root',name:'はじまりの城',group:null,kind:'root',state:'acquired',cost:0,description:'すべての系統を見渡す、育成の出発点。仕様書のルートノードを示す表示サンプルです。',icon:'ui/kingdom-crest.png'}],edges=[];
 for(let g=0;g<19;g++){
  const count=g<9?11:10;
  for(let i=0;i<count;i++){
   const id=`sample-${g+1}-${i+1}`,isUltimate=i===count-1;
   const state=g===0&&i<3?'acquired':(i<2||g===0&&i===3)?'available':'locked';
   nodes.push({id,name:isUltimate?'奥義サンプル':`ノード ${String(i+1).padStart(2,'0')}`,group:groups[g].id,kind:isUltimate?'ultimate':'normal',state,cost:isUltimate?3:1,description:'ノード名・効果・取得条件は仕様書を受け取った後に反映します。現在は既存素材を使用したデザインと操作の確認用です。',condition:'仕様書未読込・取得判定は未接続',icon:groups[g].icon});
   edges.push({source:i===0?'sample-root':`sample-${g+1}-${i===count-1?count-2:Math.max(1,Math.floor((i+1)/2))}`,target:id});
  }
 }
 return {version:1,id:'castle-field-layout-sample-v1',sample:true,title:'200ノード表示サンプル',maxPoints:40,groups,nodes,edges};
}
export function validateData(input){
 if(!input||input.version!==1||typeof input.id!=='string'||!input.id.trim())throw Error('version: 1 と一意な仕様ID（id）が必要です。');
 if(!Array.isArray(input.nodes)||input.nodes.length!==200)throw Error('nodes は200件で指定してください。');
 if(!Array.isArray(input.groups)||input.groups.length!==19)throw Error('groups は19件で指定してください。');
 if(!Array.isArray(input.edges))throw Error('接続を edges 配列で指定してください。');
 if(!Number.isSafeInteger(input.maxPoints)||input.maxPoints<0)throw Error('maxPoints は0以上の整数が必要です。');
 const groups=new Set(),nodes=new Set();
 for(const g of input.groups){if(!g||typeof g.id!=='string'||groups.has(g.id)||typeof g.name!=='string')throw Error('系統IDの重複または名称不備があります。');groups.add(g.id);}
 for(const n of input.nodes){
  if(!n||typeof n.id!=='string'||nodes.has(n.id)||typeof n.name!=='string')throw Error('ノードIDの重複または名称不備があります。');nodes.add(n.id);
  if(n.group!==null&&!groups.has(n.group))throw Error(`ノード ${n.id} の系統が存在しません。`);
  if(!['normal','ultimate','root'].includes(n.kind)||!['acquired','available','locked'].includes(n.state))throw Error(`ノード ${n.id} の種別・状態が不正です。`);
  if(!Number.isSafeInteger(n.cost)||n.cost<0)throw Error(`ノード ${n.id} のコストが不正です。`);
  if(n.position&&(!Number.isFinite(n.position.x)||!Number.isFinite(n.position.y)))throw Error('座標が不正です。');
 }
 for(const e of input.edges)if(!e||!nodes.has(e.source)||!nodes.has(e.target)||e.source===e.target)throw Error('存在しないノードまたは自己接続が含まれています。');
 if(input.nodes.filter(n=>n.state==='acquired').reduce((a,n)=>a+n.cost,0)>input.maxPoints)throw Error('取得済みノードのコストが最大ポイントを超えています。');
 // No topology inference, prerequisite inference, link rewriting, or acquisition rules.
 return structuredClone(input);
}
export function layout(data){
 const centers=new Map();
 data.groups.forEach((g,i)=>{
  const inner=i<7,idx=inner?i:i-7,total=inner?7:12,angle=-Math.PI/2+idx*Math.PI*2/total;
  const r=inner?490:1040;centers.set(g.id,{x:Math.cos(angle)*r,y:Math.sin(angle)*r});
 });
 const positions=new Map();
 for(const n of data.nodes.filter(n=>n.group===null))positions.set(n.id,n.position??{x:0,y:0});
 for(const g of data.groups){const items=data.nodes.filter(n=>n.group===g.id),c=centers.get(g.id);items.forEach((n,i)=>{
  let p;if(n.kind==='ultimate')p={x:c.x,y:c.y-205};
  else if(i===0)p={x:c.x,y:c.y+185};
  else{const a=Math.PI/2+i*2*Math.PI/(items.length-2);p={x:c.x+Math.cos(a)*116,y:c.y+Math.sin(a)*112};}
  positions.set(n.id,n.position??p);
 });}
 return {positions,centers};
}
