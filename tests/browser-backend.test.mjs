import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCatalog} from '../src/library.mjs';
test('cancel escapes a browser audio startup that never resolves',async t=>{
 const {createBrowserBackend}=await import('../browser/backend.mjs');
 const oldAudio=globalThis.AudioContext,oldRecorder=globalThis.MediaRecorder;let closed=false;
 globalThis.AudioContext=class{state='suspended';resume(){return new Promise(()=>{});}async close(){closed=true;this.state='closed';}};
 globalThis.MediaRecorder=class{};
 t.after(()=>{globalThis.AudioContext=oldAudio;globalThis.MediaRecorder=oldRecorder;});
 const api=createBrowserBackend({catalog:await loadCatalog(),canvas:{captureStream(){}}});
 const {script}=await api('/api/select',{template:'book-duet',seed:12});
 const job=await api('/api/render',{script,voice:'flite'});await api('/api/cancel',{id:job.id});
 for(let i=0;i<50&&(await api('/api/jobs')).jobs[0].status==='running';i++)await new Promise(r=>setTimeout(r,10));
 assert.equal((await api('/api/jobs')).jobs[0].status,'cancelled');assert.equal(closed,true);
});
test('browser API selects and validates without a server or writer',async()=>{
 const {createBrowserBackend}=await import('../browser/backend.mjs');
 const api=createBrowserBackend({catalog:await loadCatalog()});
 assert.ok((await api('/api/session')).token);
 const {script}=await api('/api/select',{template:'book-duet',seed:12});
 assert.deepEqual((await api('/api/validate',{script})).script,script);
 await assert.rejects(api('/api/draft',{script}),/local|desktop/i);
 assert.deepEqual(await api('/api/jobs'),{jobs:[]});
 script.sourceLock[0].sha256='wrong';
 await assert.rejects(api('/api/validate',{script}),/source lock/i);
});
