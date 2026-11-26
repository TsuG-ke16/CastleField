import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync,spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { canonical,hash,seedFor,wilson,finite,generate,checkBuild,taskAt,accumulator,absorb,absorbPair,summarize } from './core.mjs';
import { Pool } from './pool.mjs';
const api={nodes:[{id:'root',group:'magic'},{id:'a',group:'magic'},{id:'b',group:'life'}],canAcquire:(b,id,budget)=>b.length<budget&&!b.includes(id)&&(id==='root'||b.includes('root')),validate:b=>!b.includes('a')||b.includes('root')};
test('canonical hashes ignore object order, preserve array order; paired seed',()=>{assert.equal(hash({b:2,a:1}),hash({a:1,b:2}));assert.notEqual(hash([1,2]),hash([2,1]));let c={seed:5,sides:[{},{}]};assert.equal(taskAt(c,0).seed,taskAt(c,1).seed);assert.notEqual(taskAt(c,0).seed,taskAt(c,2).seed);assert.equal(taskAt(c,1).firstPlayer,'p2');});
test('real legality callback respected; no adapter cannot claim non-empty build',()=>{assert.deepEqual(generate(api,{budget:2,include:['a'],exclude:['b']}),['root','a']);assert.deepEqual(generate(api,{budget:2,groups:['magic']}),['root','a']);assert.throws(()=>checkBuild(api,['a'],2));assert.throws(()=>checkBuild(null,['a'],2));assert.throws(()=>generate(api,{budget:1,include:['a']}));});
test('Wilson bounds and paired intervals; anomalies not draws',()=>{assert.equal(wilson(0,0),null);assert.ok(wilson(0,10)[1]>.2);let a=accumulator();let x={status:'ok',winner:'p1',firstPlayer:'p1',turns:10},y={status:'ok',winner:'p2',firstPlayer:'p2',turns:20};absorb(a,x);absorb(a,y);absorbPair(a,x,y);absorb(a,{status:'anomaly',errorCode:'timeout'});let r=summarize(a);assert.equal(r.winRate,.5);assert.equal(r.drawRate,0);assert.equal(r.anomalies,1);assert.equal(r.firstRate,1);assert.equal(r.secondRate,0);assert.equal(r.pairedWinRate,.5);assert.equal(r.averageTurns,15);});
test('finite guard catches NaN and Infinity',()=>{assert.throws(()=>finite({a:[NaN]}),/nonfinite/);assert.throws(()=>finite({b:Infinity}),/nonfinite/);finite({x:0,y:null});});
// These are deliberately tiny contract fixtures, not Castle Field battle rules or balance data.
function fixture(){let root=mkdtempSync(join(tmpdir(),'castle-qa-fixture-'));mkdirSync(join(root,'js/game'),{recursive:true});mkdirSync(join(root,'tests'));writeFileSync(join(root,'package.json'),'{"type":"module"}');writeFileSync(join(root,'tests/helpers.js'),`export const seededRng=seed=>()=>seed/4294967296;export const buildData=()=>({cards:{},rules:{deckMode:'shared',maxMp:20}});export const loadOptionalData=()=>({});`);writeFileSync(join(root,'js/game/strategies.js'),`const s={takeTurn(){},respond(){},chooseDiscard(){return []}};export const STRATEGIES={smart:s,random:s,hang:{...s,takeTurn(){while(true){}}}};export const mulliganChoice=()=>[];`);writeFileSync(join(root,'js/game/Game.js'),`export class Game{constructor(o){this.rules=o.rules;this.firstPlayer=o.setup.firstPlayer;this.playerOrder=['p1','p2'];this.players=Object.fromEntries(this.playerOrder.map(id=>[id,{id,castle:{hp:10,maxHp:10},mp:1,coins:0,armor:0,soldiers:[],hand:[]}]));this.phase='ready';this.turn=0;this.winner=null;this.currentPlayer=this.firstPlayer;}emit(){}start(){this.phase='main';this.turn=1;this.emit('turnStarted',{turn:1});}endTurn(){this.phase='gameOver';this.winner=this.firstPlayer;this.emit('gameOver',{winner:this.winner,reason:'fixture'});return {ok:true};}getState(){return {phase:this.phase,turn:this.turn,winner:this.winner,playerOrder:this.playerOrder,currentPlayer:this.currentPlayer};}pileOf(){return {deck:[],discard:[],exhausted:[]}}}`);execFileSync('git',['init','-q',root]);execFileSync('git',['-C',root,'add','.']);execFileSync('git',['-C',root,'-c','user.name=QA','-c','user.email=qa@example.invalid','commit','-qm','fixture']);return root;}
const base={mode:'classic',seed:1,firstPlayer:'p1',sides:[{strategy:'smart',build:[]},{strategy:'random',build:[]}],maxTurns:10,maxEvents:100,budget:0,commit:'fixture'};
test('worker runs fixture, kills non-yielding worker, then recovers',async()=>{let root=fixture(),p=new Pool(root,null,1,300);try{await p.start();let [r]=await p.batch([{...base,id:0}]);assert.equal(r.status,'ok',r.error);assert.equal(r.winner,'p1');let [hang]=await p.batch([{...base,id:1,sides:[{strategy:'hang'},{strategy:'random'}]}]);assert.equal(hang.errorCode,'timeout');let [again]=await p.batch([{...base,id:2}]);assert.equal(again.resultHash,r.resultHash);}finally{await p.close();rmSync(root,{recursive:true,force:true});}});
test('CLI writes atomic batches, resume and regression; worker count independent',()=>{let root=fixture(),cli=fileURLToPath(new URL('./cli.mjs',import.meta.url)),a=join(root,'a'),b=join(root,'b'),c=join(root,'c');const run=(cmd,dir,extra=[])=>spawnSync(process.execPath,[cli,cmd,'--root',root,'--out',dir,'--games','8','--workers','2',...extra],{encoding:'utf8',timeout:15000});try{let x=run('quick',a);assert.equal(x.status,0,x.stderr);let s=JSON.parse(readFileSync(join(a,'summary.json')));assert.equal(s.attempted,8);assert.equal(s.winRate,.5);let r=run('quick',a,['--resume']);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(readFileSync(join(a,'summary.json'))).attempted,8);let y=run('regression',b);assert.equal(y.status,0,y.stderr);let z=run('regression',c,['--baseline',b,'--workers','1']);assert.equal(z.status,0,z.stderr);assert.equal(JSON.parse(readFileSync(join(c,'regression.json'))).changed,0);
mkdirSync(join(root,'tools/castle-qa'),{recursive:true});writeFileSync(join(root,'tools/castle-qa/engine.mjs'),'// changed QA driver');
let dirty=run('quick',join(root,'dirty'));assert.equal(dirty.status,1);assert.match(dirty.stderr,/QA working tree is dirty/);}finally{rmSync(root,{recursive:true,force:true});}});

test('matrix reports matchups using production interface fixture',()=>{let root=fixture(),cli=fileURLToPath(new URL('./cli.mjs',import.meta.url)),dir=join(root,'matrix'),cfg=join(root,'matrix.json');try{writeFileSync(cfg,JSON.stringify({candidates:[{label:'smart',strategy:'smart'},{label:'random',strategy:'random'}]}));let r=spawnSync(process.execPath,[cli,'matrix','--root',root,'--out',dir,'--games','4','--workers','2','--config',cfg],{encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr);let d=JSON.parse(readFileSync(join(dir,'summary.json')));assert.equal(d.attempted,12);assert.equal(d.matrix.cells.length,3);assert.equal(d.complete,true);}finally{rmSync(root,{recursive:true,force:true});}});

// Contract data only: group names and counts belong to the production adapter.
test('19 skill groups remain data-driven and use adapter legality',()=>{
 const nodes=Array.from({length:19},(_,i)=>({id:`node-${i}`,group:`group-${i}`}));
 const adapter={nodes,canAcquire:(picked,id,budget)=>nodes.some(n=>n.id===id)&&!picked.includes(id)&&picked.length<budget};
 for(const node of nodes){
  const build=generate(adapter,{budget:1,groups:[node.group],include:[node.id]});
  assert.deepEqual(build,[node.id]);checkBuild(adapter,build,1);
 }
 const all=generate(adapter,{budget:19});assert.equal(all.length,19);checkBuild(adapter,all,19);
 assert.throws(()=>checkBuild(null,[nodes[0].id],19),/not connected/);
});

test('matrix returns failure when any matchup has anomalies',()=>{
 const root=fixture(),cli=fileURLToPath(new URL('./cli.mjs',import.meta.url)),dir=join(root,'anomaly-matrix'),cfg=join(root,'cfg.json');
 try{
  writeFileSync(cfg,JSON.stringify({candidates:[{label:'hang',strategy:'hang'},{label:'smart',strategy:'smart'}]}));
  const r=spawnSync(process.execPath,[cli,'matrix','--root',root,'--out',dir,'--config',cfg,'--games','2','--workers','2','--timeout','300'],{encoding:'utf8',timeout:15000});
  assert.equal(r.status,1,r.stderr);
  const d=JSON.parse(readFileSync(join(dir,'summary.json')));assert.equal(d.complete,true);assert.ok(d.rows.some(r=>r.anomalies>0));
 }finally{rmSync(root,{recursive:true,force:true});}
});
