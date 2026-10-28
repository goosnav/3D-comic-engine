import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {run} from '../src/process.mjs';import {createJob} from '../src/jobs.mjs';
import {selectBackend,probeCapability,invalidateCapability} from '../src/capabilities.mjs';
test('unavailable renderers are cached, never retried as encoders, and override is strict',async()=>{
 invalidateCapability('chromium-gpu',Error('denied'));invalidateCapability('chromium-software',Error('denied'));invalidateCapability('blender-cpu',Error('missing Blender'));
 await assert.rejects(selectBackend(),/No rendering backend/);await assert.rejects(selectBackend('blender-cpu'),/missing Blender/);await assert.rejects(selectBackend('bogus'),/Unknown backend/);
 assert.equal((await probeCapability('chromium-gpu')).error,'denied');
});
test('cancellation terminates a real child and returns the cancellation cause',async()=>{
 const c=new AbortController();const work=run(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:c.signal});setTimeout(()=>c.abort(Error('acceptance cancelled')),50);await assert.rejects(work,/acceptance cancelled/);
});
test('invalid scripts and unwritable output never create a render job',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'capability-input-'));try{await assert.rejects(createJob({}, {outputRoot:dir}),/template|title/);assert.deepEqual(await fs.readdir(dir),[]);const script={title:'Output test',template:'book-duet',comics:['book2-036'],lines:[{speaker:'reader',text:'Hello.'}]};await fs.writeFile(path.join(dir,'file'),'not a directory');await assert.rejects(createJob(script,{outputRoot:path.join(dir,'file','output')}),/ENOTDIR/);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('missing executables report installation failures without fallback loops',async()=>{await assert.rejects(run('/definitely-absent-ffmpeg',[]),/ENOENT/);await assert.rejects(run('/definitely-absent-blender',[]),/ENOENT/);});
test('cancellation escapes the production queue lock promptly and releases the job lock',async()=>{
 const {default:lockfile}=await import('proper-lockfile');const {processJob,readJob}=await import('../src/jobs.mjs');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'queue-cancel-'));const job=await createJob({title:'Queued cancel',template:'book-duet',comics:['book2-036'],lines:[{speaker:'reader',text:'Hello.'}]},{outputRoot:dir});
 const release=await lockfile.lock(dir);const c=new AbortController();try{const start=Date.now();const pending=processJob(job.id,{outputRoot:dir,signal:c.signal});setTimeout(()=>c.abort(Error('Cancel queued render')),50);await assert.rejects(pending,/abort|cancel/i);assert.ok(Date.now()-start<1500);assert.equal((await readJob(job.id,dir)).status,'cancelled');assert.equal(await lockfile.check(path.join(dir,job.id)),false);}finally{await release();await fs.rm(dir,{recursive:true,force:true});}
});
