import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {prepareAudio} from '../src/audio.mjs';

test('default speech produces measured PCM offline without Python and reuses verified cache',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'theatre-flite-'));
 const previous=process.env.THEATRE_PYTHON;process.env.THEATRE_PYTHON=path.join(root,'no-python');
 try{
  const script={cast:[{id:'reader',voice:'am_onyx'}],lines:[{id:'a',speaker:'reader',text:'The book is on the table.'}]};
  const options={cacheRoot:root};const first=await prepareAudio(script,options);
  assert.ok(first.a.duration>.5);assert.ok(first.a.mouth.some(p=>p.value>0));
  const before=await fs.stat(first.a.path);const second=await prepareAudio(script,options);
  assert.equal(second.a.sha256,first.a.sha256);assert.equal((await fs.stat(second.a.path)).mtimeMs,before.mtimeMs);
 }finally{if(previous===undefined)delete process.env.THEATRE_PYTHON;else process.env.THEATRE_PYTHON=previous;await fs.rm(root,{recursive:true,force:true});}
});
