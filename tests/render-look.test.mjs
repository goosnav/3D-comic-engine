import test from 'node:test';import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';import {loadCatalog} from '../src/library.mjs';import {resolveScript} from '../src/contracts.mjs';import {compileTimeline} from '../src/timeline.mjs';
const catalog=await loadCatalog(),raw={template:'conversation',title:'Look',seed:11,lines:[{speaker:'reader'}]};
test('cartoon and quality normalize and persist without changing existing script defaults or timing',()=>{
 const normal=resolveScript(raw,catalog);assert.equal(normal.cartoon,undefined);assert.equal(normal.renderQuality,undefined);
 const script=resolveScript({...raw,cartoon:{enabled:true},renderQuality:'ultra'},catalog);assert.deepEqual(script.cartoon,{enabled:true,pixelSize:4,outline:1,shades:5});assert.deepEqual(resolveScript(script,catalog),script);
 const timeline=compileTimeline(script,{});assert.equal(timeline.renderQuality,'ultra');assert.deepEqual(timeline.cartoon,script.cartoon);assert.equal(timeline.frames,compileTimeline(normal,{}).frames);
 for(const patch of [{renderQuality:'magic'},{cartoon:true},{cartoon:{enabled:'yes'}},{cartoon:{pixelSize:0}},{cartoon:{pixelSize:13}},{cartoon:{outline:3}},{cartoon:{shades:1}},{cartoon:{shades:2.5}},{cartoon:{unknown:1}}])assert.throws(()=>resolveScript({...raw,...patch},catalog));
});
test('quality buys actual samples, supersampling, shadows and encoding without changing output dimensions',async()=>{
 const {renderSettings}=await import('../src/render-settings.mjs');const standard=renderSettings({}),high=renderSettings({renderQuality:'high'}),ultra=renderSettings({renderQuality:'ultra'});
 assert.equal(standard.cpuSamples,8);assert.equal(high.cpuSamples,64);assert.equal(ultra.cpuSamples,256);assert.equal(standard.bounces,12);
 assert.equal(standard.scale,1);assert.equal(high.scale,1.5);assert.equal(ultra.scale,2);assert.ok(high.shadowSize>standard.shadowSize);assert.ok(ultra.shadowSize>high.shadowSize);assert.ok(ultra.crf<high.crf&&high.crf<standard.crf);assert.throws(()=>renderSettings({renderQuality:'bad'}));
});
test('cartoon Off preserves bytes; enabled treatment adds dark boundaries and flatter bands deterministically',async()=>{
 const {applyDigitalCartoon}=await import('../src/digital-look.mjs');const c=createCanvas(192,192),ctx=c.getContext('2d');
 const gradient=ctx.createLinearGradient(0,0,192,0);gradient.addColorStop(0,'#425a60');gradient.addColorStop(1,'#8b9c96');ctx.fillStyle=gradient;ctx.fillRect(0,0,192,192);ctx.fillStyle='#dc9f68';ctx.fillRect(48,32,96,128);
 const before=ctx.getImageData(0,0,192,192);applyDigitalCartoon(ctx,{enabled:false});assert.deepEqual(ctx.getImageData(0,0,192,192).data,before.data);
 applyDigitalCartoon(ctx,{enabled:true,pixelSize:12,outline:1,shades:4});const after=ctx.getImageData(0,0,192,192);assert.notDeepEqual(after.data,before.data);
 let edge=0,inside=0;for(let y=50;y<140;y++){edge+=after.data[(y*192+48)*4];inside+=after.data[(y*192+90)*4];}assert.ok(edge<inside*.7,'outlines visibly darken the shape boundary');
 const colors=(data,y)=>new Set(Array.from({length:40},(_,x)=>Array.from(data.slice((y*192+x)*4,(y*192+x)*4+3)).join(','))).size;assert.ok(colors(after.data,20)<colors(before.data,20),'shading uses fewer tones');
 ctx.putImageData(before,0,0);applyDigitalCartoon(ctx,{enabled:true,pixelSize:12,outline:1,shades:4});assert.deepEqual(ctx.getImageData(0,0,192,192).data,after.data);
});
test('higher recording quality increases encoder budget while Standard keeps existing settings',async()=>{
 const {createRecorder}=await import('../browser/recording.mjs');class Recorder{constructor(stream,options){this.options=options;}}
 const a=createRecorder({},Recorder,['video/webm']),b=createRecorder({},Recorder,['video/webm'],{bitrateScale:2});assert.equal(a.options.videoBitsPerSecond,2500000);assert.equal(b.options.videoBitsPerSecond,5000000);assert.equal(b.options.audioBitsPerSecond,a.options.audioBitsPerSecond);
});
