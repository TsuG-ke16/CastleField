import { parentPort,workerData } from 'node:worker_threads';
import { createRunner } from './engine.mjs';
try{const run=await createRunner(workerData.root,workerData.adapter);parentPort.postMessage({ready:true});parentPort.on('message',t=>{let last=0;let result=run(t,v=>{let now=Date.now();if(now-last>100){last=now;parentPort.postMessage({trace:v});}});parentPort.postMessage({result});});}catch(e){parentPort.postMessage({fatal:String(e.stack??e)});}
