import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleData,validateData,layout } from './data.mjs';

test('layout fixture contains 200 unique nodes across 19 groups, with valid links',()=>{
 const d=validateData(sampleData());assert.equal(new Set(d.nodes.map(n=>n.id)).size,200);assert.equal(d.groups.length,19);
 assert.equal(d.nodes.filter(n=>n.kind==='ultimate').length,19);
 const {positions}=layout(d);assert.equal(positions.size,200);
 for(const p of positions.values())assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
});
test('validation and layout preserve exact input links and supplied positions',()=>{
 const input=sampleData();input.sample=false;input.nodes[0].position={x:52,y:77};
 input.edges.push({source:input.nodes[1].id,target:input.nodes[120].id});
 const snapshot=structuredClone(input),d=validateData(input),geometry=layout(d);
 assert.deepEqual(d.edges,snapshot.edges);assert.deepEqual(geometry.positions.get(input.nodes[0].id),{x:52,y:77});
 assert.deepEqual(input,snapshot);assert.notEqual(d,input);
});
test('rejects unknown links, duplicate IDs, invalid states, counts and point totals',()=>{
 for(const mutate of [d=>d.edges.push({source:'unknown',target:d.nodes[0].id}),d=>d.nodes[1].id=d.nodes[0].id,d=>d.nodes[0].state='invented',d=>d.nodes.pop(),d=>d.groups.pop(),d=>d.maxPoints=0,d=>d.nodes[0].position={x:NaN,y:0}]){
  const d=sampleData();mutate(d);assert.throws(()=>validateData(d));
 }
});
