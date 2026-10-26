import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { resolveScript, resolveOutput, previewOutput, OUTPUT_PRESETS, GAZES } from '../src/contracts.mjs';
import { compileTimeline } from '../src/timeline.mjs';
import { createActor } from '../src/actor.mjs';
import { createStunts } from '../src/stunts.mjs';
const catalog = JSON.parse(await readFile(new URL('../assets/catalog.json', import.meta.url)));
const raw = {template:'book-duet',title:'Action check',comics:['book2-020'],seed:1,endCard:{enabled:false},lines:[{speaker:'reader',text:'Hello.'}]};
const resolve = lines => resolveScript({...raw,lines},catalog);
async function cast() {
 const bytes=await readFile(new URL('../assets/actor-blue.glb',import.meta.url));
 const source=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
 return ['reader','friend'].map((id,i)=>{const a=createActor(source,id,i);a.root.position.x=i*.72;return a;});
}
test('video presets resolve to exact pixels, preserve custom dimensions and preview aspect',()=>{
 assert.deepEqual(resolveOutput(),{width:1080,height:1920,fps:24});
 for(const [preset,size] of Object.entries(OUTPUT_PRESETS)){
  const output=resolveOutput({preset});assert.equal(output.width,size.width);assert.equal(output.height,size.height);
  assert.deepEqual(resolveOutput(output),output);
  const preview=previewOutput(output);assert.ok(Math.abs(preview.width/preview.height-size.width/size.height)<.005);
 }
 for(const size of [{width:128,height:1920},{width:1920,height:128}])assert.doesNotThrow(()=>resolveOutput(previewOutput(size)));
 assert.deepEqual(resolveOutput({width:640,height:480,fps:12}),{width:640,height:480,fps:12});
 for(const invalid of [{preset:'bad'},{preset:'landscape',width:1080},{width:129},{height:2000},{fps:60},null])assert.throws(()=>resolveOutput(invalid));
});
test('gaze and physical actions validate actor identity, hand ownership and book transitions',()=>{
 for(const gaze of GAZES)assert.doesNotThrow(()=>resolve([{...raw.lines[0],gaze:{reader:gaze,friend:'book'}}]));
 for(const gaze of [{reader:'wall'},{ghost:'book'},'book'])assert.throws(()=>resolveScript({...raw,lines:[{...raw.lines[0],gaze}]},catalog,{repair:false}));
 const lines=[raw.lines[0],{action:'hold'},{action:'throw'},{action:'open'},{action:'punch',actor:'reader',target:'friend'},{action:'explode',actor:'friend'}];
 const script=resolve(lines),timeline=compileTimeline(script,{'beat-0':{duration:1}});
 assert.equal(timeline.height,1920);assert.equal(timeline.events.find(e=>e.rail==='throw').bookState,'table-closed');
 assert.equal(timeline.events.find(e=>e.rail==='punch').target,'friend');
 assert.deepEqual(resolveScript(script,catalog),script);
 for(const action of [{action:'throw'},{action:'punch',target:'reader'},{action:'explode',actor:'ghost'},{action:'explode',target:'friend'}])assert.throws(()=>resolve([raw.lines[0],action]));
 assert.throws(()=>resolve([raw.lines[0],{action:'hold'},{action:'punch'}]),/place/);
 assert.throws(()=>resolve([raw.lines[0],{action:'hold'},{action:'throw'},raw.lines[0]]),/open/);
});
test('gaze overrides reading and holding, and reaction gaze ends with the reaction',async()=>{
 const [a]=await cast();const event={type:'line',speaker:'reader',start:0,end:3,gaze:{reader:'ceiling'}};
 a.apply({time:1,line:event,held:1,reading:true});assert.equal(a.diagnostics().gazeTarget,'ceiling');
 a.apply({time:1,line:{...event,gaze:{reader:'away'}},gaze:.32});assert.ok(a.diagnostics().gaze<0);
 const reaction={...event,speaker:'friend',gaze:undefined,reaction:{actor:'reader',gaze:'camera',at:'line_start',duration:.5}};
 a.apply({time:.2,line:reaction,listening:true});assert.equal(a.diagnostics().gazeTarget,'camera');
 a.apply({time:1,line:reaction,listening:true});assert.equal(a.diagnostics().gazeTarget,'speaker');
});
test('stunts seek exactly, launch the partner, burst into pieces and restore every actor',async()=>{
 const actors=await cast(),stunts=createStunts(actors);
 const sample=(rail,time)=>{stunts.reset();actors.forEach(a=>a.apply({time}));stunts.apply({rail,actor:'reader',target:'friend',start:0,end:3},time);return actors.map(a=>({position:a.root.position.toArray(),q:a.root.quaternion.toArray(),scale:a.root.scale.toArray(),visible:a.root.children.map(o=>o.visible),bones:Object.values(a.bones).map(b=>b.quaternion.toArray())}));};
 for(const action of ['punch','explode']){
  const first=sample(action,1.5);sample(action,2.9);sample(action,.1);assert.deepEqual(sample(action,1.5),first);
  assert.ok(first.flatMap(a=>[...a.position,...a.q,...a.scale,...a.bones.flat()]).every(Number.isFinite));
 }
 assert.ok(sample('punch',1.8)[1].position[1]>.5);
 sample('explode',1.5);assert.equal(actors[0].root.getObjectByName('cartoon-explosion').visible,true);
 stunts.reset();assert.ok(actors.every(a=>a.root.children[0].visible));assert.deepEqual(actors[1].root.position.toArray(),[.72,0,0]);
});

test('chaos actions leave frame, remain squashed or exploded, and restore only on a cut',async()=>{
 const actors=await cast(),stunts=createStunts(actors);
 const sample=(rail,p)=>{stunts.reset();actors.forEach(a=>a.apply({time:p*2}));stunts.apply({rail,actor:'reader',target:'friend',start:0,end:2},p*2);};
 sample('punch',.98);assert.ok(actors[1].root.position.x>25);
 sample('explode',.99);assert.equal(actors[0].root.children[0].visible,false);assert.equal(actors[0].root.getObjectByName('cartoon-explosion').children.length,42);
 sample('flatten',.99);assert.ok(actors[0].root.scale.y<.1);
 sample('walk_away',.99);assert.ok(actors[0].root.position.x < -15);
 assert.ok(actors[0].nose,'nose is extracted from the original mesh');
 sample('nose_off',0);const rest=actors[0].nose.position.clone();
 sample('nose_off',.5);assert.ok(actors[0].nose.position.distanceTo(rest)>.3);
 sample('nose_off',.99);assert.ok(actors[0].nose.position.distanceTo(rest)<1e-9);
 for(const action of ['flatten','nose_off','head_spin','head_jerk','walk_away'])assert.doesNotThrow(()=>resolve([raw.lines[0],{action,shot:'extreme-wide'}]));
});


test('every bundled character exposes the authored nose without changing the source geometry',async()=>{
 for(const variant of catalog.variants){
  const bytes=await readFile(new URL('../'+catalog.assets[variant.asset].path,import.meta.url));
  const source=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  let before=0;source.traverse(o=>{if(o.isMesh)before+=o.geometry.index?.count??0;});
  const actor=createActor(source,'reader');assert.ok(actor.nose,variant.id);
  actor.nose.geometry.computeBoundingBox();assert.ok(actor.nose.geometry.boundingBox.getSize(new (await import('three')).Vector3()).length()>.1,variant.id);
  let after=0;source.traverse(o=>{if(o.isMesh)after+=o.geometry.index?.count??0;});assert.equal(after,before,variant.id);
 }
});


test('partner actions validate targets, reach contact, track ascent and seek deterministically',async()=>{
 const THREE=await import('three');
 const actors=await cast(),stunts=createStunts(actors);
 const sample=(rail,p)=>{stunts.reset();actors.forEach(a=>a.apply({time:p*2}));stunts.apply({rail,actor:'reader',target:'friend',start:0,end:2},p*2);actors.forEach(a=>a.root.updateMatrixWorld(true));};
 for(const action of ['nose_touch','high_five','handshake','ascend']){
  assert.equal(resolve([raw.lines[0],{action}]).lines[1].target,'friend');
  assert.throws(()=>resolve([raw.lines[0],{action,target:'reader'}]),/different target/);
  sample(action,.5);const first=actors.map(a=>a.root.position.toArray());sample(action,.9);sample(action,.1);sample(action,.5);
  assert.deepEqual(actors.map(a=>a.root.position.toArray()),first);
 }
 for(const action of ['high_five','handshake'])for(const p of [.2,.5,.95]){
  sample(action,p);
  const wrists=actors.map(a=>a.bones.handR.getWorldPosition(new THREE.Vector3()));
  assert.ok(wrists[0].distanceTo(wrists[1])<.035,`${action}: hands meet (${wrists[0].distanceTo(wrists[1])})`);
 }
 sample('nose_touch',.5);
 const tips=actors.map(a=>{const b=a.nose.geometry.boundingBox,t=b.getCenter(new THREE.Vector3());t.z=b.max.z;return a.nose.localToWorld(t);});
 assert.ok(tips[0].distanceTo(tips[1])<1e-6);
 sample('ascend',.2);const early=stunts.diagnostics().trackingPitch;
 sample('ascend',.95);assert.ok(actors[0].root.position.y>50);assert.ok(stunts.diagnostics().trackingPitch<early);assert.ok(stunts.diagnostics().trackingPitch<-1.5);
 sample('punch',.13);assert.ok(actors[1].root.position.x>15,'victim rockets away within the first impact frames');
 sample('dance',.99);assert.ok(actors[0].bones.forearmR.scale.y>1);
});

test('cosmic rage drives violent body poses but retains held-hand ownership',async()=>{
 const [a]=await cast(),line={type:'line',speaker:'reader',start:0,end:3,emotion:'cosmic_rage',gesture:'none'};
 a.apply({time:1,line});const q=a.bones.upper_armR.quaternion.clone();assert.ok(a.bones.forearmR.scale.y!==1);
 a.apply({time:1.05,line});assert.ok(q.angleTo(a.bones.upper_armR.quaternion)>.5);
 a.apply({time:1,line,held:1});assert.equal(a.bones.forearmR.scale.y,1);
});
