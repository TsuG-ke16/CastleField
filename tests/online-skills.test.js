import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../js/game/Game.js';
import {createSkillQa} from '../js/game/skills/qa.js';
import {HANDLERS} from '../js/game/skills/handlers/index.js';
import {Lobby} from '../server/rooms.js';
import {loadData,loadModeData} from '../server/server.js';
import {buildData,loadOptionalData,seededRng} from './helpers.js';
function game(){const {cards,rules}=buildData({mode:'classic',rules:{mulligan:false}});const opts=loadOptionalData('classic');const g=new Game(createSkillQa(opts.skillTree).apply({...opts,cards,rules,rng:seededRng(1)},[['B01','B02','X35'],[]]));g.start();g.players.p1.hand.splice(2);return g;}
for(const mode of ['throw','false','failure','handlerError'])test(`skill action ${mode}: rolls back payment, board, cards, counters, logs, RNG and notifications`,()=>{
 const g=game(),p=g.players.p1,before=structuredClone(g.getState('p1')),hand=p.hand,rt=g.skillRt,log=structuredClone(g.skillEvents);let events=0,logs=0,n=0;
 g.on('castleDamaged',()=>events++);rt.observe(()=>logs++);g.rng=()=>++n/10;
 const def=HANDLERS.B02.actions.B02,run=def.run;
 try{def.run=api=>{g.rng();p.hand.pop();g.pileOf('p1').deck.shift();g.players.p2.soldiers.push({soldierId:'failed-unit'});g.players.p2.castle.hp--;api.state.res.soul=9;g.emit('castleDamaged',{playerId:'p2',amount:1,blocked:0,hp:g.players.p2.castle.hp,source:{kind:'skill'}});if(mode==='throw')throw Error('private');if(mode==='handlerError'){rt.diagnostic('handlerError',{message:'private'});return true;}return mode==='false'?false:{ok:false,reason:'failed'};};
  assert.equal(g.skillAction('p1','B02').ok,false);assert.equal(g.skillAction('p1','B02').ok,false);
 }finally{def.run=run;}
 assert.equal(p.hand,hand);assert.deepEqual(g.getState('p1'),before);assert.deepEqual(g.skillEvents,log);assert.equal(events,0);assert.equal(logs,0);assert.equal(g.rng(),.1);assert.equal(g.rng(),.2);
 assert.equal(g.skillAction('p1','B02').ok,true);assert.equal(p.castle.hp,before.players.p1.castleHp-3);
});
test('public skill history is an allowlist; private handler results, cards, peek and preferences never enter it',()=>{
 const g=game(),rt=g.skillRt;rt.record({kind:'trigger',playerId:'p1',skillId:'B02',count:1,cardId:'SECRET',args:{secret:1},peek:['secret']});rt.record({kind:'effect',playerId:'p1',skillId:'B02',type:'soldierDamaged',amount:99,soldierId:'SECRET'});rt.record({kind:'diagnostic',playerId:'p1',reason:'SECRET'});
 const foe=g.getState('p2');assert.ok(foe.skillLog.some(e=>e.skillId==='B02'));assert.equal(JSON.stringify(foe.skillLog).includes('SECRET'),false);assert.equal(foe.players.p1.skillState.prefs,undefined);
 assert.equal(foe.skillLog.some(e=>e.kind==='diagnostic'),false);assert.ok(g.getState('p1').skillLog.some(e=>e.kind==='diagnostic'));
});
test('room binds skill actions, prefs and preview to the authenticated seat; preview has no effects',()=>{
 const lobby=new Lobby(loadData(),()=>seededRng(1),{modeData:loadModeData()});const a=lobby.join('skills','A',null,'classic'),b=lobby.join('skills','B',null,'classic');const {room,seat}=lobby.findSeat(a.token),foe=lobby.findSeat(b.token).seat;
 assert.equal(room.setSeat(seat,{skills:{ids:['B01','B02','X35'],config:{}}}).ok,true);room.startGame();const g=room.game;
 for(const pid of [...(g.getState('p1').mulligan?.pending??[])])g.mulligan(pid,[]);
 g.currentPlayer='p1';g.phase='main';g.players.p1.hand.splice(2);
 assert.equal(room.action(foe,'skillAction',['B02',{playerId:'p1'}]).ok,false);
 assert.equal(room.action(seat,'setSkillPrefs',[{X35:{autoDefer:true}}]).ok,true);
 assert.equal(g.getState('p1').players.p1.skillState.prefs.X35.autoDefer,true);
 assert.equal(room.action(foe,'setSkillPrefs',[{X35:{autoDefer:true}}]).ok,false);
 g.debugSetHand('p1',['classic_king_holy_fireball']);g.players.p1.mp=1;
 const before=structuredClone(g.getState('p1')),card=g.players.p1.hand[0];
 const preview=room.action(seat,'previewSkillCost',[card.cardId,{hpForMp:true}]);assert.equal(preview.ok,true);assert.equal(preview.preview.ok,true);assert.deepEqual(g.getState('p1'),before);
 const missing=room.action(seat,'previewSkillCost',[g.players.p2.hand[0].cardId,{}]);assert.equal(missing.ok,false);assert.match(missing.reason,/手札/);
});
test('skill card apply failure restores MP, HP, hand, piles and runtime after payment',()=>{
 const g=game();g.debugSetHand('p1',['classic_king_holy_fireball']);g.players.p1.mp=1;
 const card=g.players.p1.hand[0],before=structuredClone(g.getState('p1')),runtime=g.skillRt.serialize(),apply=g.applyCard;let delivered=0;g.on('cardPlayed',()=>delivered++);
 try{g.applyCard=()=>{throw Error('apply failed');};assert.equal(g.playCard(card.cardId,g.getTargets(card.cardId)[0],{hpForMp:true}).ok,false);}finally{g.applyCard=apply;}
 assert.deepEqual(g.getState('p1'),before);assert.deepEqual(g.skillRt.serialize(),runtime);assert.equal(delivered,0);
});
