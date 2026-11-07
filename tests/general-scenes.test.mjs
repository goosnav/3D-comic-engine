import test from 'node:test';import assert from 'node:assert/strict';
import {loadCatalog} from '../src/library.mjs';import {resolveScript} from '../src/contracts.mjs';import {editorDefaults} from '../src/editor-defaults.mjs';import {compileTimeline} from '../src/timeline.mjs';
const catalog=await loadCatalog();
test('untouched new project resolves with v12 beady and regular people and silent shots',()=>{
 const raw=editorDefaults(catalog).script;assert.equal(raw.template,'conversation');const s=resolveScript(raw,catalog);assert.deepEqual(s.characters,{reader:'v12-beady',friend:'v12'});assert.deepEqual(s.comics,[]);assert.equal(s.book,false);assert.equal(s.endCard.enabled,false);
 const t=compileTimeline(s,{});assert.equal(t.duration,4);assert.equal(t.book,false);assert.deepEqual(t.events.map(e=>[e.type,e.speaker,e.shot,e.end-e.start]),[['hold','reader','speaker',2],['hold','friend','speaker',2]]);
 assert.deepEqual(resolveScript(s,catalog),s);
});
test('every general preset is ready to export and book actions/shots remain explicit errors',()=>{
 for(const id of ['conversation','greeting','button-demo']){const s=resolveScript(editorDefaults(catalog,id).script,catalog);assert.ok(compileTimeline(s,{}).frames>0);assert.equal(s.book,false);}
 const raw=editorDefaults(catalog,'conversation').script;
 for(const lines of [[{action:'open'}],[{speaker:'reader',text:'',shot:'book'}],[{speaker:'reader',text:'',shot:'source'}]])assert.throws(()=>resolveScript({...raw,lines},catalog),/book|source/i);
});
test('empty/whitespace/absent text becomes silence, recordings retain takes, malformed text rejects',()=>{
 const raw={template:'conversation',title:'Silent',lines:[]};
 assert.equal(compileTimeline(resolveScript(raw,catalog),{}).duration,2);
 const s=resolveScript({...raw,lines:[{speaker:'reader'},{speaker:'friend',text:'  ',gesture:'nod'},{speaker:'reader',text:'Hello.'}]},catalog);
 const t=compileTimeline(s,{'beat-2':{duration:.75,mouth:[]}});assert.equal(t.duration,4.75);assert.equal(t.events.filter(e=>e.type==='source').length,0);assert.equal(t.events[1].gesture,'nod');
 const r=resolveScript({...raw,lines:[{speaker:'reader',audio:'take.wav'}]},catalog);assert.equal(compileTimeline(r,{'beat-0':{duration:1.25,mouth:[]}}).duration,1.25);
 assert.throws(()=>resolveScript({...raw,lines:[{speaker:'reader',text:12}]},catalog),/text/);
});
test('book template blank rows cover the selected page without inventing speech',()=>{
 const s=resolveScript({template:'book-duet',title:'Quiet reading',comics:['book2-036'],endCard:{enabled:false},lines:[{speaker:'reader',text:''}]},catalog);const t=compileTimeline(s,{});assert.equal(t.duration,2);assert.equal(t.events[0].type,'hold');assert.equal(t.events[0].shot,'speaker');
});
test('real v12 rigs evaluate speech and silence without a book or floating legacy mouth',async()=>{
 const {loadCPUScene}=await import('../src/cpu-scene.mjs');const s=resolveScript({...editorDefaults(catalog).script,lines:[{speaker:'reader',text:'Hello.'}],output:{width:128,height:128,fps:12}},catalog);const t=compileTimeline(s,{'beat-0':{duration:2,mouth:[{t:0,value:0},{t:.5,value:1},{t:1,value:0},{t:2,value:0}]}});
 const noBook=structuredClone(catalog);delete noBook.assets.book;const stage=await loadCPUScene(t,noBook);stage.evaluate(0);const closed=stage.actors[0].bones.jaw.quaternion.toArray();stage.evaluate(6);assert.notDeepEqual(stage.actors[0].bones.jaw.quaternion.toArray(),closed);assert.equal(stage.actors[0].diagnostics().faceMode,'puppet-mouth');assert.equal(stage.scene.getObjectByName('legacy-mouth'),undefined);assert.equal(stage.book.diagnostics().enabled,false);
});
test('button has deterministic movement and actual hand contact in the shared scene',async()=>{
 const {loadCPUScene}=await import('../src/cpu-scene.mjs');const s=resolveScript(editorDefaults(catalog,'button-demo').script,catalog);const t=compileTimeline(s,{});const stage=await loadCPUScene(t,catalog);stage.evaluate(0);const cap=stage.scene.getObjectByName('interaction-button'),start=cap.position.y;assert.ok(cap);stage.evaluate(28);assert.ok(cap.position.y<start);const pressed=cap.position.toArray();stage.evaluate(3);stage.evaluate(28);assert.deepEqual(cap.position.toArray(),pressed);
 const T=await import('three'),target=cap.getWorldPosition(new T.Vector3()).add(new T.Vector3(0,.035,0));assert.ok(stage.actors[0].bones.handL.getWorldPosition(new T.Vector3()).distanceTo(target)<.06);
});
test('silent beats preserve explicit pauses and time listener reactions at the requested boundary',async()=>{
 const raw={...editorDefaults(catalog).script,lines:[{speaker:'reader',text:'',pause:.5,reaction:{actor:'friend',at:'line_end',duration:.75,gaze:'camera'}}]};
 const t=compileTimeline(resolveScript(raw,catalog),{});assert.equal(t.duration,2.75);assert.equal(t.events[0].silent,true);assert.equal(t.events[1].start,2);assert.ok(!t.events[1].silent);
 const {loadCPUScene}=await import('../src/cpu-scene.mjs');const stage=await loadCPUScene(t,catalog);stage.evaluate(12);assert.notEqual(stage.actors[1].diagnostics().gazeTarget,'camera');stage.evaluate(50);assert.equal(stage.actors[1].diagnostics().gazeTarget,'camera');
 raw.lines[0].reaction.at='line_start';const start=compileTimeline(resolveScript(raw,catalog),{});const other=await loadCPUScene(start,catalog);other.evaluate(6);assert.equal(other.actors[1].diagnostics().gazeTarget,'camera');other.evaluate(50);assert.notEqual(other.actors[1].diagnostics().gazeTarget,'camera');
});

test('short characters can reach the interaction prop from a support',async()=>{
 const {loadCPUScene}=await import('../src/cpu-scene.mjs'),T=await import('three');const raw=editorDefaults(catalog,'button-demo').script;raw.characters.reader='billy';const stage=await loadCPUScene(compileTimeline(resolveScript(raw,catalog),{}),catalog);stage.evaluate(28);const cap=stage.scene.getObjectByName('interaction-button'),target=cap.getWorldPosition(new T.Vector3()).add(new T.Vector3(0,.035,0));assert.ok(stage.scene.getObjectByName('reader-crate'));assert.ok(stage.actors[0].bones.handL.getWorldPosition(new T.Vector3()).distanceTo(target)<.06);
});

test('either actor reaches a button that stays inside the portrait two-shot',async()=>{
 const {loadCPUScene}=await import('../src/cpu-scene.mjs'),T=await import('three');
 for(const role of ['reader','friend'])for(const variant of ['v12','billy']){
  const raw=editorDefaults(catalog,'button-demo').script;raw.characters[role]=variant;raw.lines[0].actor=role;
  const stage=await loadCPUScene(compileTimeline(resolveScript(raw,catalog),{}),catalog);stage.evaluate(28);const cap=stage.scene.getObjectByName('interaction-button');
  const box=new T.Box3().setFromObject(cap);for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])assert.ok(Math.abs(new T.Vector3(x,y,z).project(stage.camera).x)<1,`${role} ${variant} button fits`);
  const actor=stage.actors.find(a=>a.root.name===`actor-${role}`),hand=actor.bones[role==='reader'?'handL':'handR'];assert.ok(hand.getWorldPosition(new T.Vector3()).distanceTo(cap.position.clone().add(new T.Vector3(0,.035,0)))<.06,`${role} ${variant} reaches`);
 }
});
