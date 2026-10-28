import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCatalog} from '../src/library.mjs';
import {resolveScript} from '../src/contracts.mjs';
import {compileTimeline} from '../src/timeline.mjs';
test('real rig evaluates without WebGL, deterministically across seeks', async () => {
  const {loadCPUScene} = await import('../src/cpu-scene.mjs');
  const catalog = await loadCatalog();
  const script = resolveScript({template:'book-duet',title:'CPU rig acceptance',comics:['book2-036'],seed:42,output:{width:320,height:480,fps:12},endCard:{enabled:false},lines:[{speaker:'reader',text:'Look at this book.',shot:'two-shot',gesture:'explain'}]},catalog);
  const timeline = compileTimeline(script,{[script.lines[0].id]:{duration:2,mouth:[{t:0,value:0},{t:1,value:1},{t:2,value:0}]}});
  const stage = await loadCPUScene(timeline,catalog);
  const snapshot = f => { stage.evaluate(f); return stage.actors.map(a => a.diagnostics()); };
  const first = snapshot(6); snapshot(18); assert.deepEqual(snapshot(6),first);
  assert.notDeepEqual(snapshot(18),first);
  assert.ok(stage.actors.every(a=>a.bones.head && a.bones.handR && Object.keys(a.bones).length>=40));
});
test('CPU source insert retains captions and serializes actual rig poses with frame integrity',async()=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');const {writeCPUJob}=await import('../src/cpu-job.mjs');const {loadImage,createCanvas}=await import('@napi-rs/canvas');const {digest}=await import('../src/library.mjs');
 const catalog=await loadCatalog(),script=resolveScript({template:'book-duet',title:'Source caption',comics:['book2-036'],output:{width:128,height:128,fps:12},endCard:{enabled:false},lines:[{speaker:'reader',text:'Yellow words.',shot:'source'}]},catalog);
 const timeline=compileTimeline(script,{[script.lines[0].id]:{duration:1,mouth:[],captions:[]}});timeline.frames=1;timeline.events.find(e=>e.type==='line').captions=[{start:0,end:1,text:'Yellow words.'}];
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cpu-source-'));try{const {job,folder}=await writeCPUJob({dir,timeline,catalog,inputKey:'test'});assert.equal(job.version,1);assert.ok(job.frames[0].rigs[0].bones.head);assert.equal(digest(await fs.readFile(path.join(folder,'vertices-000000.bin'))),job.frames[0].sha256);
 const c=createCanvas(128,128);c.getContext('2d').drawImage(await loadImage(path.join(folder,'overlay-000000.png')),0,0);const pixels=c.getContext('2d').getImageData(0,0,128,32).data;let yellow=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>180&&pixels[i+1]>130&&pixels[i+2]<130)yellow++;assert.ok(yellow>15,'source image must retain the yellow reader caption');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
