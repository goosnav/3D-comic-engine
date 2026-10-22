import {resolveScript,selectScript} from '../src/contracts.mjs';
import {verifyAssetCatalog} from './assets.mjs';

async function waitForAudio(promise,signal){
 let timer,abort;
 try{
  signal.throwIfAborted();
  return await Promise.race([promise,new Promise((_,reject)=>{
   abort=()=>reject(signal.reason??new Error('Export cancelled'));
   signal.addEventListener('abort',abort,{once:true});
   timer=setTimeout(()=>reject(new Error('Audio startup timed out. Tap Generate again to retry.')),10000);
  })]);
 }finally{clearTimeout(timer);if(abort)signal.removeEventListener('abort',abort);}
}

/** Same envelopes as loopback API, but no remote API requests or server jobs. */
export function createBrowserBackend({catalog,canvas,onChange=()=>{}}){
 const jobs=[],controllers=new Map(),urls=new Set();
 const api=async(route,data)=>{
  if(route==='/api/session')return {token:'on-device'};
  if(route==='/api/catalog')return structuredClone(catalog);
  if(route==='/api/select')return {script:selectScript(data.template,data.seed,catalog)};
  if(route==='/api/validate')return {script:resolveScript(data.script,catalog)};
  if(route==='/api/jobs')return {jobs:structuredClone(jobs)};
  if(route==='/api/draft')throw Error('Optional local AI writing is available in the desktop app. Browser authoring needs no AI.');
  if(route==='/api/cancel'){
   controllers.get(data.id)?.abort(new Error('Export cancelled. Your script is preserved; generate again to retry.'));return {ok:true};
  }
  if(route==='/api/render'){
   if(jobs.some(j=>j.status==='running'))throw Error('One browser export at a time. Finish or cancel the active export first.');
   if(data.voice!=='flite')throw Error('Browser mode uses on-device Flite. Use desktop for Kokoro or recorded files.');
   const script=resolveScript(data.script,catalog);
   if(script.lines.some(l=>l.audio))throw Error('Recorded audio paths need the desktop app. Remove audio fields to use browser speech.');
   const Audio=globalThis.AudioContext??globalThis.webkitAudioContext;
   if(!Audio||!globalThis.MediaRecorder||!canvas?.captureStream)throw Error('This browser cannot export video with audio. Try a current Chrome/Safari browser or use the desktop app.');
   // Called directly from the Generate click before the first awaited operation.
   const audioContext=new Audio();const resumed=audioContext.resume();
   const controller=new AbortController(),id=`device-${Date.now()}-${crypto.randomUUID().slice(0,8)}`;
   const job={id,status:'running',progress:'Checking source assets',script};jobs.unshift(job);controllers.set(id,controller);onChange();
   void(async()=>{
    let snapshot;
    try{
     await waitForAudio(resumed,controller.signal);controller.signal.throwIfAborted();
     snapshot=await verifyAssetCatalog(catalog,{signal:controller.signal});
     const {exportFilm}=await import('./export.mjs');
     const result=await exportFilm({canvas,script,catalog:snapshot.catalog,assetBase:'',audioContext,signal:controller.signal,onProgress:value=>{job.progress=typeof value==='object'?`${value.message} · ${Math.round(value.progress*100)}%`:value;onChange();}});
     controller.signal.throwIfAborted();
     job.video=URL.createObjectURL(result.blob);urls.add(job.video);
     job.filename=`${script.title.normalize('NFKD').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').slice(0,70)||'comic'}-${id}.${result.extension}`;
     job.status='complete';job.progress='Ready — download before closing this page.';
    }catch(e){job.status=controller.signal.aborted?'cancelled':'failed';job.error=e.message;}
    finally{snapshot?.dispose();if(audioContext.state!=='closed')await audioContext.close().catch(()=>{});controllers.delete(id);onChange();}
   })();
   return {id,status:job.status};
  }
  throw Error('Unknown on-device action');
 };
 api.ownsURL=url=>urls.has(url);
 api.dispose=()=>{for(const controller of controllers.values())controller.abort();for(const url of urls)URL.revokeObjectURL(url);urls.clear();};
 return api;
}
