import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {createJob,processJob,readJob} from '../src/jobs.mjs';
test('actual CPU cancellation retains a frame and resumes without Chromium or a server',{timeout:180000},async()=>{
 process.env.THEATRE_BROWSER='/unavailable-chromium';process.env.THEATRE_CPU_SAMPLES='1';
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cpu-recovery-'));
 const job=await createJob({title:'CPU recovery',template:'book-duet',comics:['book2-036'],output:{width:128,height:128,fps:12},endCard:{enabled:false},lines:[{speaker:'reader',text:'Hello there.',shot:'two-shot',gesture:'nod'}]},{outputRoot:dir,backend:'blender-cpu'});
 const controller=new AbortController();let cancelled=false;
 await assert.rejects(processJob(job.id,{outputRoot:dir,signal:controller.signal,progress:message=>{if(message.includes('CPU_FRAME 0')){cancelled=true;controller.abort(Error('Acceptance interruption'));}}}),/Acceptance interruption/);
 assert.equal(cancelled,true);assert.equal((await readJob(job.id,dir)).status,'cancelled');
 const frame=path.join(dir,job.id,'cpu-job','render-000000.png');const before=(await fs.stat(frame)).mtimeMs;const progress=[];
 const result=await processJob(job.id,{outputRoot:dir,progress:s=>progress.push(s)});assert.equal(result.status,'complete');assert.equal(result.verification.backend,'blender-cpu');assert.equal((await fs.stat(frame)).mtimeMs,before);assert.equal(progress.some(s=>s.includes('CPU_FRAME 0')),false);console.log(JSON.stringify({output:result.verification.path,frames:result.verification.frames,reusedFrame:true}));
});
