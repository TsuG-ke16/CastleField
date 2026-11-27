// Roll back mutable engine objects in place, preserving Card/Player/Soldier identity and prototypes.
// External listeners are held until commit; RNG values consumed by an aborted action are replayed.
const replays=new WeakMap();
function replayRng(game,rng,rolls) {
  if(!rolls.length)return rng;
  const old=replays.get(game);
  if(old?.wrapper===rng){old.values.unshift(...rolls);return old.wrapper;}
  const state={values:[...rolls],wrapper:null};
  state.wrapper=()=>state.values.length?state.values.shift():rng();
  replays.set(game,state);return state.wrapper;
}
export function skillTransaction(rt, run) {
  const game=rt.game, snapshots=new Map();
  const fixed=new Set([game.cardDefs,game.rules,game.skillTree,rt.tree,rt.nodeById,rt.subs,game.listeners,rt.observers]);
  const visit=o=>{
    if(!o||typeof o!=='object'||fixed.has(o)||Object.isFrozen(o)||snapshots.has(o))return;
    const data=o instanceof Map?[...o]:o instanceof Set?[...o]:o instanceof WeakSet?null:Object.entries(o);
    snapshots.set(o,data);
    if(o instanceof Set){for(const v of data)visit(v);}
    else if(data)for(const [k,v] of data){if(o instanceof Map)visit(k);visit(v);}
  };
  visit(game);
  const oldLogs=new Set(rt.log);
  const fallen=[...snapshots.keys()].filter(o=>rt.seenFallen.has(o));
  const listeners=game.listeners,observers=rt.observers,notifications=[],rng=game.rng,rolls=[];
  game.listeners=new Map([...listeners].map(([type,handlers])=>[type,new Set([...handlers].map(fn=>payload=>notifications.push(()=>fn(payload))))]));
  rt.observers=new Set([...observers].map(fn=>entry=>notifications.push(()=>fn(entry))));
  game.rng=()=>{const v=rng();rolls.push(v);return v;};
  const rollback=()=>{
    for(const [o,data] of snapshots){
      if(o instanceof WeakSet)continue;
      if(o instanceof Map){o.clear();for(const [k,v]of data)o.set(k,v);}
      else if(o instanceof Set){o.clear();for(const v of data)o.add(v);}
      else {for(const k of Object.keys(o))delete o[k];for(const [k,v]of data)o[k]=v;if(Array.isArray(o))o.length=data.length;}
    }
    rt.seenFallen=new WeakSet(fallen);
    game.rng=replayRng(game,rng,rolls);
  };
  let result;
  try { result=run();
    if(rt.log.some(e=>!oldLogs.has(e)&&e.code==='handlerError'))result={ok:false,reason:'スキルの効果処理に失敗しました。状態は変更していません'};
    if(result===false||result?.ok===false){rollback();return result===false?{ok:false,reason:'スキルを実行できませんでした'}:result;} }
  catch {rollback();return {ok:false,reason:'スキルの実行に失敗しました。状態は変更していません'};}
  finally {game.listeners=listeners;rt.observers=observers;}
  game.rng=rng;
  for(const notify of notifications){try{notify();}catch(err){console.error('スキル通知:',err);}}
  return result;
}
