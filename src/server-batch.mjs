import {BACKENDS} from './capabilities.mjs';
import {randomUUID} from 'node:crypto';
import {resolveScript} from './contracts.mjs';
import {scriptWarnings,correctionNote} from './script-normalization.mjs';
import {OUTPUT,MAX_BATCH_JOBS,createJob,processJob,readJob} from './jobs.mjs';

export const BATCH_BODY_LIMIT=32*1024*1024;
const voices=['flite','kokoro','recorded'];
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const message=error=>error instanceof Error?error.message:String(error);

function outputFilename(name,index){
 const basename=name.replaceAll('\\','/').split('/').at(-1).replace(/\.json$/i,'');
 const safe=basename.normalize('NFKD').replace(/[^A-Za-z0-9_.-]+/g,'-').replace(/^[.-]+|[.-]+$/g,'').slice(0,100)||'script';
 return `${String(index+1).padStart(3,'0')}-${safe}.mp4`;
}

function snapshotEntries(data){
 if(!isObject(data)||Object.keys(data).some(key=>!['entries','voice','backend'].includes(key)))throw Error('Batch must contain entries and an optional voice');
 if(!Array.isArray(data.entries)||data.entries.length<1||data.entries.length>MAX_BATCH_JOBS)throw Error(`Batch must contain 1–${MAX_BATCH_JOBS} scripts`);
 if(!BACKENDS.includes(data.backend??'auto'))throw Error('Invalid backend');
 if(!voices.includes(data.voice??'flite'))throw Error('voice: choose flite, kokoro or recorded');
 // Check the complete envelope before adding any work to the queue. Invalid
 // script contents belong to their own item, rather than rejecting the batch.
 for(const [index,entry] of data.entries.entries()){
  if(!isObject(entry)||Object.keys(entry).some(key=>!['name','script'].includes(key))||typeof entry.name!=='string'||!entry.name.trim()||entry.name.length>1024||!Object.hasOwn(entry,'script'))throw Error(`entries[${index}] must contain a name and script`);
 }
 return data.entries.map((entry,index)=>{
  const item={index,name:entry.name,filename:outputFilename(entry.name,index),status:'queued'};
  try{item.script=structuredClone(entry.script);}catch(error){item.status='failed';item.error=`Script cannot be copied: ${message(error)}`;}
  return item;
 });
}

/** A server-owned queue: page reloads do not interrupt production. */
export function createServerBatchQueue({catalog,outputRoot=OUTPUT,create=createJob,process=processJob,read=readJob}={}){
 const batches=new Map();
 let draining=false,idle=Promise.resolve();

 function publicBatch(batch){
  const items=batch.items.map(({script,...item})=>({...item}));
  return {id:batch.id,status:batch.status,createdAt:batch.createdAt,...(batch.finishedAt?{finishedAt:batch.finishedAt}:{}),total:items.length,completed:items.filter(item=>item.status==='complete').length,failed:items.filter(item=>item.status==='failed').length,cancelled:items.filter(item=>item.status==='cancelled').length,items};
 }

 function finish(batch){
  if(batch.items.some(item=>item.status==='queued'||item.status==='running'))return;
  const completed=batch.items.some(item=>item.status==='complete'),failed=batch.items.some(item=>item.status==='failed');
  batch.status=batch.items.some(item=>item.status==='cancelled')?'cancelled':failed?(completed?'partial':'failed'):'complete';
  batch.finishedAt??=new Date().toISOString();
 }

 async function drain(){
  // All submitted batches share this worker. processJob also retains its
  // existing cross-process production lock for CLI and individual GUI jobs.
  for(;;){
   const batch=[...batches.values()].find(batch=>batch.items.some(item=>item.status==='queued'));
   if(!batch)return;
   const item=batch.items.find(item=>item.status==='queued');
   item.status='running';
   try{
    const job=await create(item.script,{outputRoot,voice:batch.voice,backend:batch.backend});
    if(typeof job?.id!=='string'||!/^[A-Za-z0-9_-]{1,180}$/.test(job.id))throw Error('Renderer did not create a valid job');
    item.jobId=job.id;
    await process(job.id,{outputRoot});
    // Re-read through the existing SHA verification path. Never offer a
    // download just because an encoder promise happened to resolve.
    const verified=await read(job.id,outputRoot);
    const prefix=`/output/${job.id}/`;
    if(verified.status!=='complete'||verified.id!==job.id||typeof verified.video!=='string'||!verified.video.startsWith(prefix)||!/^[A-Za-z0-9_.-]+\.mp4$/.test(verified.video.slice(prefix.length)))throw Error(verified.error||'Rendered video did not pass verification');
    item.status='complete';item.video=verified.video;
    item.exitNote=verified.exitNote||(correctionNote(item)||'No automatic JSON corrections.');
   }catch(error){item.status='failed';item.error=message(error);}
   finally{delete item.script;finish(batch);}
  }
 }

 function schedule(){
  if(draining)return;
  draining=true;
  idle=Promise.resolve().then(drain).finally(()=>{
   draining=false;
   // A request may have arrived in the microtask between drain returning and
   // its completion handler. Do not leave that newly submitted batch waiting.
   if([...batches.values()].some(batch=>batch.items.some(item=>item.status==='queued')))schedule();
  });
 }

 return {
  submit(data){
   const items=snapshotEntries(data);
   // Resolve the copied inputs once before any asynchronous work. This fixes
   // omitted seeds/defaults for the run without changing authored settings.
   for(const item of items){
    if(item.status==='failed')continue;
    try{item.script=resolveScript(item.script,catalog);item.warnings=scriptWarnings(item.script);}catch(error){item.status='failed';item.error=message(error);delete item.script;}
   }
   const batch={id:`batch-${randomUUID()}`,createdAt:new Date().toISOString(),status:'running',voice:data.voice??'flite',backend:data.backend??'auto',items};
   batches.set(batch.id,batch);finish(batch);schedule();
   return publicBatch(batch);
  },
  list(){return [...batches.values()].reverse().map(publicBatch);},
  cancel(id){
   if(typeof id!=='string'||!batches.has(id))throw Error('Unknown batch');
   const batch=batches.get(id);
   for(const item of batch.items)if(item.status==='queued'){item.status='cancelled';delete item.script;}
   finish(batch);
   return publicBatch(batch);
  },
  async whenIdle(){while(draining)await idle;}
 };
}
