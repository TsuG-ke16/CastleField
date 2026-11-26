import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { createRunner } from './engine.mjs';
const root=resolve(process.env.CASTLE_QA_ROOT??fileURLToPath(new URL('../../',import.meta.url)));
const found=existsSync(resolve(root,'js/game/Game.js'))&&existsSync(resolve(root,'tests/sim/sim.js'));
test('real Game: matches existing simulator, normal/classic/factions, both first players, deterministic', {skip:!found}, async()=>{
 const load=p=>import(pathToFileURL(resolve(root,p)).href);
 const [{runMatch},{buildData,loadOptionalData}]=await Promise.all([load('tests/sim/sim.js'),load('tests/helpers.js')]);
 const run=await createRunner(root,null);
 for(let mode of ['kingdom','classic','factions'])for(let firstPlayer of ['p1','p2'])for(let seed of [1,3,17]){
  const names=['smart','random'],m=mode==='kingdom'?null:mode;
  const {cards,rules}=buildData({mode:m});
  const expected=runMatch({cards,rules,strategies:names,seed,maxTurns:1000,gameOptions:{...loadOptionalData(m),setup:{firstPlayer}}});
  const task={id:0,seed,firstPlayer,mode,sides:names.map(strategy=>({strategy,build:[]})),maxTurns:1000,maxEvents:2000,budget:0};
  const a=run(task),b=run(task);
  assert.equal(a.status,'ok',`${mode}/${firstPlayer}/${seed}: ${a.error}`);
  assert.deepEqual(a.stateHash,b.stateHash);
  assert.equal(a.winner,expected.winner);assert.equal(a.turns,expected.turns);assert.equal(a.reason,expected.reason??null);
  for(let [event,count] of Object.entries(expected.events))assert.equal(a.events[event],count,event);
  assert.equal(a.resultHash,b.resultHash);
 }
});
