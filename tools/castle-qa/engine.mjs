import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { finite, hash, canonical, skillAPI, checkBuild } from './core.mjs';
const load=(root,p)=>import(pathToFileURL(resolve(root,p)).href);
const add=(o,k,n=1)=>o[k]=(o[k]??0)+n;
export async function createRunner(root,adapterPath){
 const [{Game},{buildData,loadOptionalData,seededRng},{STRATEGIES,mulliganChoice},api]=await Promise.all([load(root,'js/game/Game.js'),load(root,'tests/helpers.js'),load(root,'js/game/strategies.js'),skillAPI(root,adapterPath)]);
 return function run(t,trace=()=>{}){
  const eventDigest=createHash('sha256');
  let game,reason=null,events={},metrics={},history=[],actions=[],activeActions=[],eventCount=0,turnEvents=0,seq=0,actionId=0,depth=0,flags=[],finalState=null,turn=0;
  const fail=(code,msg)=>Object.assign(Error(msg),{code});
  const ring=(arr,v,n)=>{arr.push(v);if(arr.length>n)arr.shift();};
  const snapshot=()=>game?{public:game.getState(null),privateViews:Object.fromEntries(game.playerOrder.map(p=>[p,game.getState(p)])),piles:Object.fromEntries(game.playerOrder.map(p=>{let x=game.pileOf(p);return [p,{deck:x.deck.map(c=>c.toState()),discard:x.discard.map(c=>c.toState()),exhausted:x.exhausted.map(c=>c.toState())}]}))}:null;
  const report=(error)=>{let state=null;try{state=snapshot();}catch(e){state={snapshotError:String(e)};}return {id:t.id,seed:t.seed,firstPlayer:t.firstPlayer,status:'anomaly',errorCode:error.code??'exception',error:String(error.stack??error),turns:turn,events,metrics,history,actions,flags,state,task:t};};
  try{
   if(t.mode!=='classic'&&t.sides.some(s=>s.build?.length))throw fail('illegal_build','Classic build in non-classic mode');
   for(const s of t.sides){checkBuild(api,s.build??[],t.budget);if(!STRATEGIES[s.strategy])throw fail('config',`Unknown strategy ${s.strategy}`);}
   const mode=t.mode==='kingdom'?null:t.mode;let {cards,rules}=buildData({mode});let options=loadOptionalData(mode);const setup={firstPlayer:t.firstPlayer};
   if(t.sides.some(s=>s.deck!=null)){if(!t.sides.every(s=>s.deck!=null))throw fail('config','Both decks required');if(rules.deckMode==='shared')throw fail('config','Shared deck mode cannot accept individual decks');if(t.sides.every(s=>typeof s.deck==='string'))setup.decks=t.sides.map(s=>s.deck);else if(rules.deckMode==='cost'&&t.sides.every(s=>s.deck&&typeof s.deck==='object'))setup.deckLists=t.sides.map(s=>s.deck);else throw fail('config','Invalid deck type for this mode');}
   if(t.sides.some(s=>s.castle!=null)){if(!t.sides.every(s=>typeof s.castle==='string'))throw fail('config','Both castle IDs required');setup.castles=t.sides.map(s=>s.castle);}
   let gameOptions={cards,rules,...options,setup,rng:seededRng(t.seed)};
   if(t.mode==='classic'&&api)gameOptions=api.apply(gameOptions,t.sides.map(s=>s.build??[]),t.budget);
   game=new Game(gameOptions);if(game.playerOrder.length!==2)throw fail('config','Only 2-player matches supported');
   let aiRng=seededRng(t.seed^0x9e3779b9),ctx={cards:gameOptions.cards,rules:gameOptions.rules,discardCount:0,upgrades:gameOptions.upgrades||{}};
   const strat=p=>STRATEGIES[t.sides[Number(p.slice(1))-1].strategy];
   const metric=(p,k,n=1)=>{if(p==='p1'||p==='p2'){if(!Number.isFinite(n))throw fail('nonfinite_metric',k);add(metrics,`${p}.${k}`,n);}};
   for(let p of game.playerOrder)for(let k of ['castleDamageReceived','soldierDamageReceived','castleHealing','soldierHealing','mpSpent','mpGained','coinsSpent','coinsGained','cardsPlayed','soldiersDeployed','soldiersKilled','reviveCardsPlayed','revivals','poisonCastleDamage','statusSoldierDamage'])metric(p,k,0);
   const originalEmit=game.emit;
   // Wrap the existing synchronous event dispatcher. Listener exceptions are swallowed by Game,
   // so the watchdog is outside listeners and can interrupt recursive chains.
   game.emit=function(type,e={}){
    ++eventCount;++turnEvents;++depth;++seq;
    if(type==='turnStarted'){turn=e.turn;turnEvents=1;}
    if(turnEvents>t.maxEvents||depth>100||eventCount>t.maxEvents*(t.maxTurns+2))throw fail('event_limit',`event cap at ${type}, depth ${depth}`);
    finite(e);eventDigest.update(canonical([type,e])+'\n');add(events,type);let p=e.playerId;
    ring(history,{seq,actionId:activeActions.at(-1)??null,turn,dispatchDepth:depth,type,payload:structuredClone(e)},80);
    if(type==='discardRequired')ctx.discardCount=e.count;
    if(type==='gameOver')reason=e.reason??null;
    if(type==='castleDamaged'){let damage=e.amount-(e.blocked??0);metric(p,'castleDamageReceived',damage);if(e.source?.kind==='poison')metric(p,'poisonCastleDamage',damage);if(e.source?.playerId&&e.source.playerId!==p)metric(e.source.playerId,'attributedCastleDamage',damage);}
    if(type==='soldierDamaged'){let net=e.amount-(e.blocked??0);metric(p,'soldierDamageReceived',net);if(['poison','burn'].includes(e.cause))metric(p,'statusSoldierDamage',net);}
    if(type==='castleHealed')metric(p,'castleHealing',e.amount);
    if(type==='soldierHealed')metric(p,'soldierHealing',e.amount);
    if(type==='mpChanged'||type==='coinsChanged'){let k=type==='mpChanged'?'mp':'coins';metric(p,k+(e.delta<0?'Spent':'Gained'),Math.abs(e.delta));}
    if(type==='cardPlayed'){metric(p,'cardsPlayed');add(events,`card:${p}:${e.type}`);if(gameOptions.cards[e.type]?.effect==='reviveFallen')metric(p,'reviveCardsPlayed');if(!gameOptions.cards[e.type])throw fail('unknown_card',e.type);}
    if(type==='soldierDeployed'){metric(p,'soldiersDeployed');if(e.revived)metric(p,'revivals');if(!gameOptions.cards[e.type])throw fail('unknown_card',e.type);}
    if(type==='soldierDestroyed'&&e.reason==='killed')metric(p,'soldiersKilled');
    if(type==='reactionTriggered')add(events,`reaction:${e.reaction}`);
    if(api&&t.mode==='classic'&&api.observe){let m=api.observe(type,e);if(m)for(const [key,val] of Object.entries(m)){if(!Number.isFinite(val))throw fail('invalid_adapter_metric',key);add(metrics,key,val);}}
    // Do not pass custom events to old Game unless the production engine registered them.
    try{return originalEmit.call(this,type,e);}finally{depth--;}
   };
   function verify(){let s=game.getState(null);finite(s);for(let p of Object.values(game.players)){
     finite({hp:p.castle.hp,mp:p.mp,coins:p.coins,armor:p.armor});if(p.castle.hp<0||p.castle.hp>p.castle.maxHp||p.mp<0||p.mp>game.rules.maxMp||p.coins<0||p.armor<0)throw fail('resource_range',p.id);
     for(let soldier of p.soldiers){finite({hp:soldier.hp,attack:soldier.attack,position:soldier.position});if(soldier.hp<=0||soldier.hp>soldier.maxHp)throw fail('soldier_hp',soldier.soldierId);if(!gameOptions.cards[soldier.type])throw fail('unknown_soldier',soldier.type);}
     for(let c of p.hand)if(!gameOptions.cards[c.type])throw fail('unknown_card',c.type);if(p.soldiers.some(x=>!game.players[x.targetId]))throw fail('unknown_target',p.id);
    }if(api&&t.mode==='classic'&&api.verify)api.verify(game);if(s.phase==='gameOver'&&s.winner!=null&&!s.playerOrder.includes(s.winner))throw fail('invalid_winner',String(s.winner));if(s.phase!=='gameOver'&&s.winner!=null)throw fail('premature_winner',s.winner);return s;}
   // Observe exact public action calls, including CPU's ignored unsuccessful choices.
   for(let name of ['start','mulligan','playCard','endTurn','discard','passDefense','defend','buyUpgrade','fuse'])if(typeof game[name]==='function'){
    const fn=game[name];game[name]=function(...args){let id=++actionId;let entry={id,parentActionId:activeActions.at(-1)??null,turn:game.turn,name,args:structuredClone(args)};ring(actions,entry,120);activeActions.push(id);try{let result=fn.apply(this,args);entry.result=result&&typeof result==='object'?{ok:result.ok,reason:result.reason}:null;return result;}finally{activeActions.pop();}};
   }
   const step=(name,fn)=>{trace({turn:game.turn,phase:game.phase,action:name,actions:actions.slice(-12),history:history.slice(-12)});return fn();};
   const must=(r,label)=>{if(!r?.ok)throw fail('action_rejected',`${label}: ${r?.reason}`);};
   const settleDefense=()=>{for(let i=0;i<50&&game.phase==='defend';i++){let p=game.getState(null).defense.defenderId;step('respond',()=>strat(p).respond(game,p,aiRng,ctx));}if(game.phase==='defend')throw fail('defense_stall','defense unresolved after 50 attempts');};ctx.onDefense=settleDefense;
   step('start',()=>game.start());for(let p of game.getState(null).mulligan?.pending??[])must(step('mulligan',()=>game.mulligan(p,mulliganChoice(game,p,ctx))),'mulligan');
   let guard=0;for(;;){let now=verify();turn=now.turn;if(now.phase==='gameOver'){finalState=now;break;}if(now.turn>t.maxTurns)throw fail('turn_limit',`Exceeded ${t.maxTurns} turns`);if(++guard>t.maxTurns*20)throw fail('turn_stall','main loop guard');if(now.phase==='defend'){settleDefense();continue;}let p=now.currentPlayer;if(now.phase==='discard'){must(step('discard',()=>game.discard(strat(p).chooseDiscard(game,p,aiRng,ctx))),'discard');continue;}if(now.phase!=='main')throw fail('unknown_phase',now.phase);step('takeTurn',()=>strat(p).takeTurn(game,p,aiRng,ctx));if(game.phase==='gameOver')continue;must(step('endTurn',()=>game.endTurn()),'endTurn');}
   if(events.gameOver!==1)throw fail('gameover_count',String(events.gameOver));
   let stateHash=hash(snapshot()),eventHash=eventDigest.digest('hex');return {id:t.id,seed:t.seed,firstPlayer:t.firstPlayer,status:'ok',winner:finalState.winner,turns:finalState.turn,reason,events,metrics,stateHash,eventHash,resultHash:hash({winner:finalState.winner,turns:finalState.turn,reason,events,metrics,stateHash,eventHash})};
  }catch(e){return report(e);}
 };
}
