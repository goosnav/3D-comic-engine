import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {run} from '../src/process.mjs';
import {digest,loadCatalog,ROOT} from '../src/library.mjs';
import {getExampleLibrary} from '../src/example-library.mjs';
test('static build refuses unrelated files rather than publishing leftover private data',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'comic-static-private-'));
 try{
  await fs.writeFile(path.join(dir,'writer.local.json'),'private fixture');
  await assert.rejects(run(process.execPath,['tools/build-web.mjs','--out-dir',dir],{timeout:60000}),/unexpected|unrelated/i);
  assert.equal(await fs.readFile(path.join(dir,'writer.local.json'),'utf8'),'private fixture');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('static build contains exact assets and runtime, excluding private/server files',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'comic-static-'));
 try{
  await run(process.execPath,['tools/build-web.mjs','--out-dir',dir],{timeout:60000});
  const html=await fs.readFile(path.join(dir,'index.html'),'utf8');assert.match(html,/content="browser"/);
  const c=await loadCatalog();
  const examples=await getExampleLibrary({catalog:c});
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir,'examples/index.json'),'utf8')),examples.index);
  for(const [name,bytes]of examples.files)assert.deepEqual(await fs.readFile(path.join(dir,'examples',name)),bytes);
  for(const forbidden of ['batch.json','pages-001-025.batch.json','README.md'])await assert.rejects(fs.access(path.join(dir,'examples',forbidden)));
  for(const name of ['blank-book-duet.json','book-duet.example.json','fireside.example.json','page-tour.example.json','astronaut.example.json'])assert.equal(await fs.readFile(path.join(dir,'templates',name),'utf8'),await fs.readFile(path.join(ROOT,'templates',name),'utf8'));
  for(const e of [...Object.values(c.assets),...c.comics])assert.equal(digest(await fs.readFile(path.join(dir,e.path))),e.sha256);
  assert.equal((await fs.stat(path.join(dir,'vendor/flite.wasm'))).size,(await fs.stat(path.join(ROOT,'node_modules/@echogarden/flite-wasi/flite.wasm'))).size);
  for(const forbidden of ['writer.local.json','src/server.mjs','output','DEV','node_modules'])await assert.rejects(fs.access(path.join(dir,forbidden)));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
