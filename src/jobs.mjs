import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import lockfile from 'proper-lockfile';
import {ROOT,digest,loadCatalog,verifyCatalog,safePath} from './library.mjs';
import {resolveScript} from './contracts.mjs';
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
export async function createJob(raw,{outputRoot=OUTPUT,inputRoot=ROOT,voice='flite'}={}){
 if(!['flite','kokoro','recorded'].includes(voice))throw Error('voice: choose flite, kokoro or recorded');
 outputRoot=path.resolve(outputRoot);inputRoot=path.resolve(inputRoot);
 const catalog=await loadCatalog();await verifyCatalog(catalog);const script=resolveScript(raw,catalog);
 const slug=script.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'comic';
 const id=`${slug}-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`;
 const dir=path.join(outputRoot,id);await fs.mkdir(dir,{recursive:true});await atomicJSON(path.join(dir,'script.json'),script);
 const job={id,status:'queued',created:new Date().toISOString(),title:script.title,voice,inputRoot,pid:process.pid,progress:'Waiting for production slot'};
 await atomicJSON(path.join(dir,'job.json'),job);return job;
}
export const MAX_BATCH_JOBS=100;
export async function runBatch(entries,{baseDir=ROOT,outputRoot=OUTPUT,voice='flite',preview=false,progress=()=>{}}={}){
 if(!Array.isArray(entries)||entries.length<1||entries.length>MAX_BATCH_JOBS)throw Error(`Batch manifest must be an array of 1–${MAX_BATCH_JOBS} entries`);
 const results=[];
 for(const [index,entry] of entries.entries()){
  let job;
  try{
   if(!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).some(k=>!['input','voice'].includes(k)))throw Error('Batch entry must contain input and optional voice');
   const input=await safePath(baseDir,entry.input);
   if((await fs.stat(input)).size>256000)throw Error('Script exceeds the 256000-byte limit');
   const raw=JSON.parse(await fs.readFile(input,'utf8'));
   if(preview)raw.output={width:432,height:540,fps:12};
   job=await createJob(raw,{outputRoot,inputRoot:path.dirname(input),voice:entry.voice??voice});
   progress(`[${index+1}/${entries.length}] Run ${job.id}`);
   const finished=await processJob(job.id,{outputRoot,progress:message=>progress(`[${index+1}/${entries.length}] ${message}`)});
   results.push({input:entry.input,status:'complete',job:finished});
  }catch(error){
   results.push({input:entry?.input??null,status:'failed',...(job?{id:job.id}:{}),error:error.message});
   progress(`[${index+1}/${entries.length}] Failed: ${error.message}`);
  }
 }
 const failed=results.filter(r=>r.status==='failed').length;
 return {ok:failed===0,succeeded:results.length-failed,failed,results};
}
export async function processJob(id,{outputRoot=OUTPUT,progress=()=>{}}={}){
 checkID(id);const dir=path.join(outputRoot,id);let job=await readJob(id,outputRoot),release,runRelease;
 if(job.status==='complete')return job;
 const update=async(status,message)=>{job={...job,status,progress:message,pid:process.pid,updated:new Date().toISOString()};delete job.error;await atomicJSON(path.join(dir,'job.json'),job);progress(message);};
 try{
  runRelease=await lockfile.lock(dir,{stale:30000,update:5000});
  await update('queued','Waiting for production slot');
  // One queue coordinates separate CLI processes in this project. This does not
  // claim coordination with the parent Blender harness; use a dedicated worker.
  release=await lockfile.lock(outputRoot,{stale:30000,update:5000,retries:{retries:3600,factor:1,minTimeout:1000,maxTimeout:1000}});
  const catalog=await loadCatalog();await verifyCatalog(catalog);const script=resolveScript(JSON.parse(await fs.readFile(path.join(dir,'script.json'))),catalog);
  await update('audio','Preparing measured voice takes');
  const takes=await prepareAudio(script,{mode:job.voice,inputRoot:job.inputRoot,progress});
  const timeline=compileTimeline(script,takes);await writeMix(timeline,takes,path.join(dir,'mix.wav'));await atomicJSON(path.join(dir,'timeline.json'),timeline);
  // Cache identity includes every renderer/compiler byte and exact voice content.
  const sources=await fs.readdir(path.join(ROOT,'src'));const code=[];for(const f of sources.filter(f=>f.endsWith('.mjs')).sort())code.push([f,digest(await fs.readFile(path.join(ROOT,'src',f)))]);
  const inputKey=digest(JSON.stringify({script,catalog,timeline,takes:Object.values(takes).map(t=>t.sha256),code,lock:digest(await fs.readFile(path.join(ROOT,'package-lock.json')))}));
  await update('rendering',`${timeline.frames} frames, ${timeline.duration.toFixed(1)} seconds`);
  const {captureVideo}=await import('./capture.mjs');const video=await captureVideo({dir,id,script,timeline,catalog,inputKey,progress:async message=>update('rendering',message)});
  job={...job,status:'complete',progress:'Complete video verified locally; not uploaded',video:`/output/${id}/${path.basename(video.path)}`,verification:video,updated:new Date().toISOString()};await atomicJSON(path.join(dir,'job.json'),job);return job;
 }catch(e){if(runRelease){job={...job,status:'failed',error:e.message,progress:'Stopped with checkpoints preserved',updated:new Date().toISOString()};await atomicJSON(path.join(dir,'job.json'),job);}throw e;}
 finally{if(release)await release();if(runRelease)await runRelease();}
}
