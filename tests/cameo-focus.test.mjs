import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadCatalog} from '../src/library.mjs';
import {resolveScript} from '../src/contracts.mjs';
import {compileTimeline} from '../src/timeline.mjs';
import {loadCPUScene} from '../src/cpu-scene.mjs';
const catalog=await loadCatalog();
const raw={template:'conversation',title:'Awkward cameo',seed:42,lines:[{cameo:'goose'}],output:{width:192,height:320,fps:12}};
const timeline=(patch={})=>compileTimeline(resolveScript({...raw,...patch},catalog),{});
test('cameo-only rows normalize, round-trip and preserve exact silent timing without background opt-in',()=>{
 const s=resolveScript(raw,catalog);assert.deepEqual(s.lines[0],{cameo:'goose',behaviour:'stand',camera:'static',seconds:3,id:'beat-0'});
 assert.deepEqual(resolveScript(s,catalog),s);assert.equal(s.extras,undefined);
 const t=compileTimeline(s,{});assert.equal(t.duration,3);assert.equal(t.frames,36);assert.equal(t.events[0].type,'cameo');assert.deepEqual(t.extras,['goose']);assert.deepEqual(t.backgroundExtras,[]);
 assert.equal(timeline({lines:[{cameo:'goose',seconds:1.25},{speaker:'reader'}]}).duration,3.25);
});
test('cameo and ambience schema rejects invalid IDs, mixed rows and invalid settings',()=>{
 for(const line of [{cameo:'missing'},{cameo:'goose',speaker:'reader'},{cameo:'goose',text:'Hello'},{cameo:'goose',action:'read'},{cameo:'goose',behaviour:'fly'},{cameo:'goose',camera:'book'},{cameo:'goose',seconds:0},{cameo:'goose',seconds:31}])assert.throws(()=>timeline({lines:[line]}));
 for(const ambience of [null,'room',{mode:'loud'},{volume:-1},{volume:2},{mode:'off',unknown:1}])assert.throws(()=>timeline({ambience}));
 assert.deepEqual(timeline({ambience:{mode:'laundromat'}}).ambience,{mode:'laundromat',volume:.35});
});
test('all existing cameos fit static/follow shots, animate, seek deterministically and restore the cast',async()=>{
 for(const id of catalog.extras.map(e=>e.id))for(const [width,height]of [[192,320],[320,192]])for(const behaviour of ['stand','walk'])for(const camera of ['static','follow']){
  const t=timeline({output:{width,height,fps:12},lines:[{cameo:id,behaviour,camera,seconds:3},{speaker:'reader'}]});
  const stage=await loadCPUScene(t,catalog),root=stage.extras.roots[0];stage.evaluate(0);const initialCamera=stage.camera.position.toArray(),initialRoot=root.position.toArray();
  for(const frame of [0,12,30]){
   stage.evaluate(frame);assert.equal(root.visible,true);assert.ok(stage.actors.every(a=>!a.root.visible));
   const b=new THREE.Box3().setFromObject(root,true);
   for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){
    const p=new THREE.Vector3(x,y,z).project(stage.camera);assert.ok(Math.abs(p.x)<.97&&Math.abs(p.y)<.97&&p.z<1&&p.z>-1,`${id} ${behaviour}/${camera} ${width} frame ${frame} fits: ${p.toArray()}`);
   }
  }
  if(camera==='static'||behaviour==='stand')assert.deepEqual(stage.camera.position.toArray(),initialCamera);else assert.notDeepEqual(stage.camera.position.toArray(),initialCamera);
  if(behaviour==='stand')assert.deepEqual(root.position.toArray(),initialRoot);else assert.notDeepEqual(root.position.toArray(),initialRoot);
  const snapshot=()=>[stage.camera.matrixWorld.toArray(),root.position.toArray(),...(()=>{const m=[];root.traverse(o=>{if(o.isBone)m.push(o.quaternion.toArray());});return m;})()];
  const expected=snapshot();stage.evaluate(36);assert.ok(stage.actors.every(a=>a.root.visible));assert.equal(root.visible,false);stage.evaluate(4);stage.evaluate(30);assert.deepEqual(snapshot(),expected);
 }
});
test('focus hides other extras and actor supports/interaction props, then restores them',async()=>{
 const t=timeline({characters:{reader:'billy'},extras:['goose'],lines:[{action:'press_button'},{cameo:'walker',seconds:1},{speaker:'reader'}]});
 const stage=await loadCPUScene(t,catalog);stage.evaluate(30);
 for(const name of ['reader-crate','button-pedestal','interaction-button'])assert.equal(stage.scene.getObjectByName(name).visible,false);
 assert.equal(stage.extras.roots[0].visible,false);assert.equal(stage.extras.roots[1].visible,true);
 stage.evaluate(0);for(const name of ['reader-crate','button-pedestal','interaction-button'])assert.equal(stage.scene.getObjectByName(name).visible,true);
});

test('portable jobs preserve cameo intent, independent backgrounds and ambience with integrity',async()=>{
 const {makeRenderJob,readRenderJob}=await import('../src/render-job.mjs');
 const job=await makeRenderJob({...raw,extras:['glove-bot'],ambience:{mode:'laundromat',volume:.2}},catalog);
 const restored=await readRenderJob(job,catalog);assert.equal(restored.script.lines[0].cameo,'goose');assert.deepEqual(restored.script.extras,['glove-bot']);assert.deepEqual(restored.script.ambience,{mode:'laundromat',volume:.2});
 job.payload.script.lines[0].seconds=4;await assert.rejects(readRenderJob(job,catalog),/integrity/);
});
test('book rails remain held across a solo cameo cut and restore on return',async()=>{
 const t=compileTimeline(resolveScript({template:'book-duet',title:'Reading interrupted',comics:['book2-036'],seed:4,endCard:{enabled:false},lines:[{action:'hold',seconds:1},{cameo:'goose',seconds:1},{speaker:'reader',text:''}]},catalog),{});
 const stage=await loadCPUScene(t,catalog);stage.evaluate(30);assert.equal(stage.book.root.visible,false);assert.equal(stage.book.diagnostics().held,1);
 stage.evaluate(54);assert.equal(stage.book.root.visible,true);assert.equal(stage.book.diagnostics().held,1);
});
