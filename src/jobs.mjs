import {makeRenderJob} from './render-job.mjs';
import {setTimeout as delay} from 'node:timers/promises';
import {run} from './process.mjs';
import {selectBackend,probeCapability,invalidateCapability,BACKENDS} from './capabilities.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import lockfile from 'proper-lockfile';
import {ROOT,digest,loadCatalog,verifyCatalog,safePath} from './library.mjs';
import {previewOutput,resolveScript} from './contracts.mjs';
import {prepareAudio,writeMix} from './audio.mjs';
import {compileTimeline} from './timeline.mjs';
export const OUTPUT=path.join(ROOT,'output');
export async function atomicJSON(file,data){await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID();await fs.writeFile(temp,JSON.stringify(data,null,2)+'\n');await fs.rename(temp,file);}
function checkID(id){if(!/^[A-Za-z0-9_-]{1,180}$/.test(id))throw Error('Invalid job ID');}
export async function readJob(id,root=OUTPUT){
 checkID(id);const job=JSON.parse(await fs.readFile(path.join(root,id,'job.json')));
 if(job.status==='complete'){
  try{if(digest(await fs.readFile(path.join(root,id,id+'.mp4')))!==job.verification?.sha256)throw Error('Changed video');}
  catch{job.status='interrupted';job.error='Completed video is missing or changed. Resume to rebuild it from verified checkpoints.';delete job.video;}
 }
 if(['audio','rendering','encoding','queued','validating'].includes(job.status)&&job.pid){try{process.kill(job.pid,0);}catch{job.status='interrupted';job.error='Worker stopped. Resume this run; verified stages are preserved.';}}
 return job;
}
export async function listJobs(root=OUTPUT){await fs.mkdir(root,{recursive:true});const out=[];for(const name of await fs.readdir(root)){try{out.push(await readJob(name,root));}catch{}}return out.sort((a,b)=>b.created.localeCompare(a.created));}
export function segmentRanges(frames,fps,seconds=5){const result=[],size=Math.max(1,Math.round(fps*seconds));for(let start=0;start<frames;start+=size)result.push([start,Math.min(frames,start+size)]);return result;}
export async function createJob(raw,{outputRoot=OUTPUT,inputRoot=ROOT,voice='flite',backend='auto'}={}){
 if(!BACKENDS.includes(backend))throw Error('Invalid backend');
 if(!['flite','kokoro','recorded'].includes(voice))throw Error('voice: choose flite, kokoro or recorded');
 outputRoot=path.resolve(outputRoot);inputRoot=path.resolve(inputRoot);
 const catalog=await loadCatalog();await verifyCatalog(catalog).catch(e=>{throw Object.assign(e,{stage:'assets'});});let script;try{script=resolveScript(raw,catalog);}catch(e){throw Object.assign(e,{stage:'input'});}
 const slug=script.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'comic';
 const id=`${slug}-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`;
 const dir=path.join(outputRoot,id);await fs.mkdir(dir,{recursive:true}).catch(e=>{throw Object.assign(e,{stage:'output'});});await atomicJSON(path.join(dir,'script.json'),script);
 if(!script.lines.some(line=>line.audio))await atomicJSON(path.join(dir,'portable.render-job.json'),await makeRenderJob(script,catalog,{voice}));
 const job={id,status:'queued',created:new Date().toISOString(),title:script.title,voice,backend,inputRoot,pid:process.pid,progress:'Waiting for production slot'};
 await atomicJSON(path.join(dir,'job.json'),job);return job;
}
export const MAX_BATCH_JOBS=100;
export async function runBatch(entries,{baseDir=ROOT,outputRoot=OUTPUT,voice='flite',preview=false,look={},backend='auto',resume=false,signal,progress=()=>{}}={}){
 if(!Array.isArray(entries)||entries.length<1||entries.length>MAX_BATCH_JOBS)throw Error(`Batch manifest must be an array of 1–${MAX_BATCH_JOBS} entries`);
 const reportPath=path.join(outputRoot,`batch-${digest(JSON.stringify({entries,baseDir,voice,preview,look,backend})).slice(0,20)}.json`);
 let previous=[];if(resume){try{previous=JSON.parse(await fs.readFile(reportPath)).results??[];}catch(e){if(e.code!=='ENOENT')throw e;}}
 const results=[];
 const save=async()=>atomicJSON(reportPath,{results});
 for(const [index,entry] of entries.entries()){
  signal?.throwIfAborted();
  let job,sourceHash;
  try{
   if(!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).some(k=>!['input','voice'].includes(k)))throw Error('Batch entry must contain input and optional voice');
   const input=await safePath(baseDir,entry.input);
   if((await fs.stat(input)).size>256000)throw Error('Script exceeds the 256000-byte limit');
   const raw=JSON.parse(await fs.readFile(input,'utf8'));
   if(preview)raw.output=previewOutput(raw.output);
   // CLI --grade/--dither override every script in the batch.
   if(raw&&typeof raw==='object'&&!Array.isArray(raw))Object.assign(raw,look);
   sourceHash=digest(JSON.stringify(raw));const prior=previous[index];
   if(prior?.sourceHash===sourceHash&&(prior.job?.id||prior.id)){
    try{job=await readJob(prior.job?.id??prior.id,outputRoot);}catch{}
   }
   if(!job)job=await createJob(raw,{outputRoot,inputRoot:path.dirname(input),voice:entry.voice??voice,backend});
   progress(`[${index+1}/${entries.length}] Run ${job.id}`);
   const finished=await processJob(job.id,{outputRoot,signal,progress:message=>progress(`[${index+1}/${entries.length}] ${message}`)});
   results.push({input:entry.input,status:'complete',sourceHash:digest(JSON.stringify(raw)),job:finished});
  }catch(error){
   results.push({input:entry?.input??null,status:'failed',...(job?{id:job.id}:{}),error:error.message,sourceHash});
   progress(`[${index+1}/${entries.length}] Failed: ${error.message}`);
  }
  await save();
 }
 const failed=results.filter(r=>r.status==='failed').length;
 return {reportPath,ok:failed===0,succeeded:results.length-failed,failed,results};
}
export async function processJob(id,{outputRoot=OUTPUT,progress=()=>{},backend,signal}={}){
 checkID(id);const dir=path.join(outputRoot,id);let job=await readJob(id,outputRoot),release,runRelease;
 if(job.status==='complete')return job;
 const update=async(status,message)=>{job={...job,status,progress:message,pid:process.pid,updated:new Date().toISOString()};delete job.error;delete job.stage;await atomicJSON(path.join(dir,'job.json'),job);progress(message);};
 try{
  runRelease=await lockfile.lock(dir,{stale:30000,update:5000});
  await update('queued','Waiting for production slot');
  // One queue coordinates separate CLI processes in this project. This does not
  // claim coordination with the parent Blender harness; use a dedicated worker.
  for(let attempt=0;;attempt++){
   signal?.throwIfAborted();
   try{release=await lockfile.lock(outputRoot,{stale:30000,update:5000});break;}
   catch(error){if(error.code!=='ELOCKED'||attempt>=3600)throw error;await delay(1000,undefined,{signal});}
  }
  const catalog=await loadCatalog();await verifyCatalog(catalog).catch(e=>{throw Object.assign(e,{stage:'assets'});});const script=resolveScript(JSON.parse(await fs.readFile(path.join(dir,'script.json'))),catalog);
  signal?.throwIfAborted();
  const encoding=await probeCapability('ffmpeg');if(!encoding.available)throw Object.assign(Error(encoding.error),{stage:'encoding'});
  await update('audio','Preparing measured voice takes');
  const takes=await prepareAudio(script,{mode:job.voice,inputRoot:job.inputRoot,progress,signal});
  const timeline=compileTimeline(script,takes);await writeMix(timeline,takes,path.join(dir,'mix.wav'));await atomicJSON(path.join(dir,'timeline.json'),timeline);
  try{await fs.access(path.join(dir,'music.bin'));await run(process.env.FFMPEG??'ffmpeg',['-nostdin','-v','error','-y','-i',path.join(dir,'mix.wav'),'-i',path.join(dir,'music.bin'),'-filter_complex','[1:a]volume=0.12[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[a]','-map','[a]','-ar','48000',path.join(dir,'music-mix.wav')],{signal});await fs.rename(path.join(dir,'music-mix.wav'),path.join(dir,'mix.wav'));}catch(e){if(e.code!=='ENOENT')throw Object.assign(e,{stage:'speech'});}

  // Cache identity includes every renderer/compiler byte and exact voice content.
  const sources=await fs.readdir(path.join(ROOT,'src'));const code=[];for(const f of sources.filter(f=>f.endsWith('.mjs')).sort())code.push([f,digest(await fs.readFile(path.join(ROOT,'src',f)))]);
  const inputKey=digest(JSON.stringify({script,catalog,timeline,takes:Object.values(takes).map(t=>t.sha256),code,renderer:digest(await fs.readFile(path.join(ROOT,'renderers/blender_cpu.py'))),cpuSamples:process.env.THEATRE_CPU_SAMPLES??'8',music:await fs.readFile(path.join(dir,'mix.wav')).then(digest),lock:digest(await fs.readFile(path.join(ROOT,'package-lock.json')))}));
  await update('rendering',`${timeline.frames} frames, ${timeline.duration.toFixed(1)} seconds`);
  const selection=await selectBackend(backend??job.backend??'auto');
  job.selectedBackend=selection.backend;job.capabilities=selection.attempts;
  await update('rendering',`Backend: ${selection.backend} · H.264/AAC MP4`);
  const capture=selection.backend==='blender-cpu'?(await import('./cpu-capture.mjs')).captureCPU:(await import('./capture.mjs')).captureVideo;
  let video;const captureOptions={dir,id,script,timeline,catalog,inputKey,backend:selection.backend,allowFallback:(backend??job.backend??'auto')==='auto',signal,progress:async message=>update('rendering',message)};
  try{video=await capture(captureOptions);}catch(error){
    if((backend??job.backend??'auto')!=='auto'||!['renderer startup','permissions','frame rendering'].includes(error.stage)||signal?.aborted||selection.backend==='blender-cpu')throw error;
    invalidateCapability(selection.backend,error);if(error.stage==='permissions')invalidateCapability('chromium-software',error);
    const fallback=await selectBackend('blender-cpu');job.selectedBackend=fallback.backend;
    video=await (await import('./cpu-capture.mjs')).captureCPU({...captureOptions,backend:fallback.backend});
  }

  signal?.throwIfAborted();
  job={...job,selectedBackend:video.backend,status:'complete',progress:'Complete video verified locally; not uploaded',video:`/output/${id}/${path.basename(video.path)}`,verification:video,updated:new Date().toISOString()};await atomicJSON(path.join(dir,'job.json'),job);return job;
 }catch(e){if(runRelease){job={...job,status:signal?.aborted?'cancelled':'failed',stage:e.stage??(['EACCES','EROFS','ENOSPC','ENOTDIR'].includes(e.code)?'output':job.status==='audio'?'speech':job.status==='rendering'?'frame rendering':'input'),error:e.message,progress:'Stopped with checkpoints preserved',updated:new Date().toISOString()};await atomicJSON(path.join(dir,'job.json'),job);}throw e;}
 finally{if(release)await release();if(runRelease)await runRelease();}
}
