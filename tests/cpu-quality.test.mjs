import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {loadCatalog, ROOT} from '../src/library.mjs';
import {resolveScript} from '../src/contracts.mjs';
import {compileTimeline} from '../src/timeline.mjs';
import {writeCPUJob} from '../src/cpu-job.mjs';
import {createCanvas} from '@napi-rs/canvas';
import * as cpuCapture from '../src/cpu-capture.mjs';

test('CPU cartoon changes stage pixels before sharp captions and leaves full inserts intact', () => {
  const canvas=createCanvas(16,16),ctx=canvas.getContext('2d');
  const stage=createCanvas(16,16),stageCtx=stage.getContext('2d');
  stageCtx.fillStyle='rgb(90,130,170)';stageCtx.fillRect(0,0,16,16);
  const overlay=createCanvas(16,16),overlayCtx=overlay.getContext('2d');
  overlayCtx.fillStyle='rgb(231,189,37)';overlayCtx.fillRect(0,0,3,3);
  const cartoon={enabled:true,pixelSize:4,outline:0,shades:2};
  cpuCapture.composeCPUFrame(ctx,{stage,overlay,full:false,cartoon});
  assert.deepEqual([...ctx.getImageData(0,0,1,1).data],[231,189,37,255]);
  assert.notDeepEqual([...ctx.getImageData(8,8,1,1).data],[90,130,170,255]);
  cpuCapture.composeCPUFrame(ctx,{stage,overlay,full:false,cartoon:{enabled:false}});
  assert.deepEqual([...ctx.getImageData(8,8,1,1).data],[90,130,170,255]);
  cpuCapture.composeCPUFrame(ctx,{overlay:stage,full:true,cartoon});
  assert.deepEqual([...ctx.getImageData(0,0,16,16).data],[...stageCtx.getImageData(0,0,16,16).data]);
});

test('portable CPU scene carries the selected rendering budget', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cpu-quality-job-'));
  try {
    const catalog=await loadCatalog();
    const script=resolveScript({template:'book-duet',title:'Quality',comics:['book2-036'],output:{width:128,height:128,fps:12},endCard:{enabled:false},lines:[{speaker:'reader',text:'Hello.',shot:'two-shot'}]},catalog);
    const timeline=compileTimeline(script,{[script.lines[0].id]:{duration:1,mouth:[]}});
    timeline.frames=1;timeline.renderQuality='high';
    const {folder}=await writeCPUJob({dir,timeline,catalog,inputKey:'quality'});
    const saved=JSON.parse(await fs.readFile(path.join(folder,'scene.json'),'utf8'));
    assert.equal(saved.renderSettings?.quality,'high');
    assert.equal(saved.renderSettings.cpuSamples,64);
    assert.equal(saved.renderSettings.bounces,12);
    assert.equal(saved.renderSettings.crf,16);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});

const blender=process.env.BLENDER??'blender';
const hasBlender=spawnSync(blender,['--version'],{encoding:'utf8'}).status===0;
async function runBlender(settings, override, renderFrame=false) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cpu-quality-render-'));
  const env={...process.env};delete env.THEATRE_CPU_SAMPLES;
  if(override!==undefined)env.THEATRE_CPU_SAMPLES=override;
  const job={version:1,kind:'goosnav-evaluated-scene',inputKey:'quality',timeline:{width:32,height:32},materials:[],meshes:[],frames:[],renderSettings:settings};
  if(renderFrame){
    job.frames=[{full:false,sha256:createHash('sha256').update('').digest('hex'),objects:[],camera:{matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,5,1],fov:38,near:.04,far:500}}];
    await fs.writeFile(path.join(dir,'vertices-000000.bin'),'');
  }
  await fs.writeFile(path.join(dir,'scene.json'),JSON.stringify(job));
  const result=spawnSync(blender,['--background','--factory-startup','--python-exit-code','1','--python',path.join(ROOT,'renderers/blender_cpu.py'),'--',dir],{encoding:'utf8',env,timeout:30000});
  return {dir,result};
}
for(const [quality,cpuSamples] of [['standard',8],['high',64],['ultra',256]]) {
  test(`Blender applies and reports the actual ${quality} sample budget`,{skip:!hasBlender},async()=>{
    const {dir,result}=await runBlender({quality,cpuSamples,bounces:12});
    try {
      assert.equal(result.status,0,result.stderr+result.stdout);
      assert.ok((await fs.readdir(dir)).includes('render-info.json'),'Blender must write actual settings for verification');
      const actual=JSON.parse(await fs.readFile(path.join(dir,'render-info.json'),'utf8'));
      assert.deepEqual(actual,{quality,cpuSamples,bounces:12,cpuSamplesOverridden:false});
    } finally {await fs.rm(dir,{recursive:true,force:true});}
  });
}
test('Blender reports an explicit sample override without relabeling its quality',{skip:!hasBlender},async()=>{
  const {dir,result}=await runBlender({quality:'ultra',cpuSamples:256,bounces:12},'3');
  try {
    assert.equal(result.status,0,result.stderr+result.stdout);
    assert.ok((await fs.readdir(dir)).includes('render-info.json'),'actual override must be persisted');
    const actual=JSON.parse(await fs.readFile(path.join(dir,'render-info.json'),'utf8'));
    assert.deepEqual(actual,{quality:'ultra',cpuSamples:3,bounces:12,cpuSamplesOverridden:true});
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
test('portable Blender resume rerenders if the explicit sample budget changes',{skip:!hasBlender},async()=>{
  const {dir,result}=await runBlender({quality:'high',cpuSamples:64,bounces:12},'1',true);
  try {
    assert.equal(result.status,0,result.stdout+result.stderr);
    const resumed=spawnSync(blender,['--background','--factory-startup','--python-exit-code','1','--python',path.join(ROOT,'renderers/blender_cpu.py'),'--',dir],{encoding:'utf8',env:{...process.env,THEATRE_CPU_SAMPLES:'2'},timeout:30000});
    assert.equal(resumed.status,0,resumed.stdout+resumed.stderr);
    assert.match(resumed.stdout,/CPU_FRAME 0/,'a cached frame with fewer samples cannot satisfy the new budget');
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
test('Blender rejects invalid sample overrides before rendering',{skip:!hasBlender},async()=>{
  for(const override of ['0','4097','1.5','oops']) {
    const {dir,result}=await runBlender({quality:'high',cpuSamples:64,bounces:12},override);
    try {
      assert.notEqual(result.status,0,`override ${override} must fail`);
      assert.match(result.stdout+result.stderr,/THEATRE_CPU_SAMPLES must be an integer from 1 to 4096/);
    } finally {await fs.rm(dir,{recursive:true,force:true});}
  }
});
