import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {writeMix} from '../src/audio.mjs';
import {digest} from '../src/library.mjs';
import * as ambience from '../src/ambience.mjs';
const render = (...args) => { assert.equal(typeof ambience.renderAmbience, 'function', 'shared ambience generator exists'); return ambience.renderAmbience(...args); };
const rms = samples => Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
const timeline = (mode='room', volume=.35) => ({duration:6,seed:17,ambience:{mode,volume},events:[]});

test('ambience generates deterministic, distinct, quiet room and laundromat samples with smooth edges',()=>{
 for (const mode of ['room','laundromat']) {
  const t=timeline(mode), samples=render(t), repeat=render(t);
  assert.equal(samples.length,288000);assert.deepEqual(samples,repeat);
  assert.ok(rms(samples)>.002 && rms(samples)<.012, 'audible but quiet background');
  assert.ok(samples.every(x=>Number.isFinite(x)&&Math.abs(x)<.03));
  assert.equal(samples[0],0);assert.equal(samples.at(-1),0);
  assert.ok(rms(samples.subarray(0,480))<rms(samples.subarray(48000,48480))*.03);
  assert.ok(rms(samples.subarray(-480))<rms(samples.subarray(48000,48480))*.03);
 }
 assert.notDeepEqual(render(timeline('room')),render(timeline('laundromat')));
 assert.notDeepEqual(render(timeline()),render({...timeline(),seed:18}));
 const quiet=render(timeline('room',.2)), loud=render(timeline('room',.4));
 assert.ok(Math.abs(rms(loud)/rms(quiet)-2)<.00001);
});

test('Off and zero volume are silent; Auto yields to music and explicit modes keep playing',()=>{
 assert.equal(render(timeline('off')),null);assert.equal(render(timeline('room',0)),null);
 assert.equal(render(timeline('auto'),{music:true}),null);
 assert.equal(render({duration:6,events:[]},{music:true}),null);
 assert.deepEqual(render(timeline('auto')),render(timeline('room')));
 assert.ok(render(timeline('laundromat'),{music:true}) instanceof Float32Array);
});

test('measured dialogue ducks ambience before speech and releases smoothly without treating holds as dialogue',()=>{
 const t=timeline(), base=render(t), spoken=render({...t,events:[{type:'line',start:2,end:3},{type:'hold',start:4,end:5} ]});
 const ratio=(start,end)=>rms(spoken.subarray(start*48000,end*48000))/rms(base.subarray(start*48000,end*48000));
 assert.ok(ratio(2,3)<.25);assert.ok(ratio(1.9,2)<.9);assert.ok(ratio(3,3.1)<.5);
 assert.ok(ratio(4,5)>.99);
 let delta=0;for(let i=1;i<spoken.length;i++) delta=Math.max(delta,Math.abs(spoken[i]-spoken[i-1]));
 assert.ok(delta<.003,'no abrupt ambience or ducking transitions');
});

test('synthesis is bounded and honours cancellation before allocation',()=>{
 const c=new AbortController();c.abort(Error('Stop ambience'));
 assert.throws(()=>render(timeline(),{signal:c.signal}),/Stop ambience/);
 for(const duration of [-1,NaN,Infinity,601])assert.throws(()=>render({...timeline(),duration}),/duration|600/i);
 for(const sampleRate of [0,NaN,Infinity,1e8])assert.throws(()=>render(timeline(),{sampleRate}),/sample|rate|bound/i);
});

test('decoded offline mix includes ambience in pauses, keeps measured speech timing, and Off is lossless',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ambience-mix-'));
 try {
  const bytes=Buffer.alloc(48000*2);for(let i=0;i<48000;i++)bytes.writeInt16LE(Math.round(Math.sin(2*Math.PI*440*i/48000)*12000),i*2);
  const file=path.join(root,'take.pcm');await fs.writeFile(file,bytes);
  const takes={voice:{path:file,sha256:digest(bytes)}};
  const t={...timeline(),events:[{type:'line',id:'voice',start:2,end:3}]};
  const decode=async(name,value,options)=>{const out=path.join(root,name+'.wav');await writeMix(value,takes,out,options);return execFileSync('ffmpeg',['-v','error','-i',out,'-f','s16le','-ac','1','-ar','48000','pipe:1']);};
  const off=await decode('off',{...t,ambience:{mode:'off',volume:.35}});
  assert.equal(off.length,576000);assert.deepEqual(off.subarray(192000,288000),bytes);
  assert.ok(off.subarray(0,192000).every(x=>x===0));assert.ok(off.subarray(288000).every(x=>x===0));
  const on=await decode('room',t), bed=render(t);
  assert.ok(on.subarray(96000,192000).some(x=>x!==0));
  for(let i=0;i<288000;i++) {
   const speech=i>=96000&&i<144000?bytes.readInt16LE((i-96000)*2):0;
   assert.ok(Math.abs(on.readInt16LE(i*2)-speech-bed[i]*32768)<1.1, 'same PCM bed as browser, speech stays at the measured offset');
  }
  assert.deepEqual(await decode('autoMusic',{...t,ambience:{mode:'auto'}},{music:true}),off);
  assert.ok((await decode('explicitMusic',t,{music:true})).subarray(96000,192000).some(x=>x!==0));
 } finally {await fs.rm(root,{recursive:true,force:true});}
});

test('adding ambience never clips or amplifies already full scale speech, including music headroom',()=>{
 assert.equal(typeof ambience.limitAmbience,'function');
 for(const reserve of [0,.08,.12])for(const speech of [-1,-.999,-.9,-.5,0,.5,.9,.999,1])for(const bed of [-.03,.03]){
  const contribution=ambience.limitAmbience(bed,speech,reserve);
  assert.ok(Math.abs(speech+contribution)<=1);
  assert.ok(Math.abs(contribution)<=Math.abs(bed));
  if(Math.abs(speech)>1-reserve && Math.sign(speech)===Math.sign(bed))assert.equal(Math.abs(contribution),0);
 }
});
