#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT,loadCatalog,verifyCatalog} from '../src/library.mjs';
import {previewOutput,resolveScript,selectScript,GRADES,DITHERS} from '../src/contracts.mjs';
import {createJob,processJob,listJobs,readJob,runBatch,MAX_BATCH_JOBS,OUTPUT} from '../src/jobs.mjs';
import {run} from '../src/process.mjs';
import {openBrowser} from './open-browser.mjs';

const help=`Comic Theatre — local JSON-driven book cutscenes

  node bin/theatre.mjs gui [--port 8777] [--no-open] [--output-dir DIR]
  node bin/theatre.mjs select TEMPLATE [--seed NUMBER] [--out script.json]
  node bin/theatre.mjs chaos [--seed NUMBER] [--template T] [--intensity mild|wild|unhinged] [--out script.json]
  node bin/theatre.mjs chaos --count N --out-dir DIR [--seed FIRST] [--template T] [--intensity LEVEL]
  node bin/theatre.mjs validate script.json
  node bin/theatre.mjs render script.json [--voice flite|kokoro|recorded] [--preview] [--grade G] [--dither D] [--output-dir DIR]
  node bin/theatre.mjs batch manifest.json [--voice flite|kokoro|recorded] [--preview] [--grade G] [--dither D] [--output-dir DIR]
  node bin/theatre.mjs resume RUN_ID [--output-dir DIR]
  node bin/theatre.mjs status [RUN_ID] [--output-dir DIR]
  node bin/theatre.mjs draft script.json [--out draft.json]
  node bin/theatre.mjs draft --template TEMPLATE [--seed NUMBER] [--out draft.json]
  node bin/theatre.mjs assets
  node bin/theatre.mjs doctor

All commands accept --json: one JSON result on stdout, progress/errors on stderr.
Batch: [{"input":"relative.json","voice":"flite"}]; voice is optional.
Inputs resolve beneath the manifest directory; recordings resolve beside each script.
1–${MAX_BATCH_JOBS} jobs, sequential; failures are reported and later jobs continue.
Exit codes: 0 success; 1 production/runtime failure (including any failed batch item);
2 invalid command, input JSON/contract or manifest; Ctrl+C normally exits 130.
Flite is free bundled speech with no model/Python. Kokoro is optional local speech.
--grade muted|film|vivid and --dither subtle|crunchy|off override the scripts' look.
--backend auto|chromium-gpu|chromium-software|blender-cpu selects rendering independently of MP4 encoding.
Batch --resume reuses verified results from the same manifest/output directory.
Portable .render-job.json files are accepted by render.
Renders use the GPU when available (THEATRE_GPU=0 forces software rendering).
'chaos' writes complete seeded scripts (dialogue, stunts, cast, cameos) with no model.
Rendering calls no paid service. 'draft' explicitly enables an optional local model.
--preview preserves aspect ratio normally at up to 768 px / 12 fps. Default: Reels 1080×1920 / 24 fps.
Default output: ${OUTPUT}. Reuse --output-dir for status/resume of custom outputs.
First run: node tools/setup.mjs. See launchers/README.md and TUTORIAL.md.
`;
const args=process.argv.slice(2),json=args.includes('--json');
const controller=new AbortController();
process.on('SIGINT',()=>{controller.abort(new Error('Cancelled by Ctrl+C'));process.exitCode=130;});
const progress=message=>console.error(message);
const emit=(value,human)=>console.log(json?JSON.stringify(value):human??JSON.stringify(value,null,2));
class UsageError extends Error {}
const invalid=message=>{throw new UsageError(message);};
const readJSON=async(file,maxBytes=256000)=>{
 if(!file)invalid('Supply an input JSON filename');
 try{
  if((await fs.stat(file)).size>maxBytes)invalid(`JSON file exceeds the ${maxBytes}-byte limit`);
  return JSON.parse(await fs.readFile(file,'utf8'));
 }catch(e){invalid(e.message);}
};
try{
 const command=args.shift()??'help',positional=[],options={};
 const allowed={gui:['port','no-open','output-dir'],select:['seed','out'],chaos:['seed','out','template','intensity','count','out-dir'],validate:[],render:['backend','voice','preview','output-dir','grade','dither'],batch:['resume','backend','voice','preview','output-dir','grade','dither'],resume:['backend','output-dir'],status:['output-dir'],draft:['out','template','seed'],assets:[],doctor:[],help:[]};
 if(command==='--help'||command==='-h'||command==='help'){emit({help},help);}
 else{
  if(!Object.hasOwn(allowed,command))invalid(`Unknown command '${command}'`);
  for(let i=0;i<args.length;i++){
   const a=args[i];
   if(a==='--help'){options.help=true;continue;}
   if(a.startsWith('-')){
    const key=a.replace(/^--/,'');
    if(![...allowed[command],'json'].includes(key))invalid(`Unknown option ${a}`);
    if(Object.hasOwn(options,key))invalid(`Duplicate option ${a}`);
    if(['json','preview','no-open','resume'].includes(key))options[key]=true;
    else{if(!args[i+1]||args[i+1].startsWith('--'))invalid(`${a} needs a value`);options[key]=args[++i];}
   }else positional.push(a);
  }
  if(options.help){emit({help},help);}
  else{
   if(positional.length>1||(['gui','assets','doctor'].includes(command)&&positional.length))invalid('Too many positional arguments');
   if(options.backend&&!['auto','chromium-gpu','chromium-software','blender-cpu'].includes(options.backend))invalid('Invalid --backend');
   if(options.voice&&!['flite','kokoro','recorded'].includes(options.voice))invalid('--voice: choose flite, kokoro or recorded');
   if(options.grade&&!GRADES.includes(options.grade))invalid(`--grade: choose ${GRADES.join(', ')}`);
   if(options.dither&&!DITHERS.includes(options.dither))invalid(`--dither: choose ${DITHERS.join(', ')}`);
   const look={...(options.grade?{grade:options.grade}:{}),...(options.dither?{dither:options.dither}:{})};
   if(options.seed!==undefined&&(!Number.isInteger(Number(options.seed))||Number(options.seed)<0||Number(options.seed)>4294967295))invalid('--seed must be an integer from 0 to 4294967295');
   const outputRoot=path.resolve(options['output-dir']??OUTPUT);
   const save=async value=>{
    if(options.out){await fs.writeFile(path.resolve(options.out),JSON.stringify(value,null,2)+'\n',{flag:'wx'});emit({ok:true,path:path.resolve(options.out)},`Saved ${options.out}`);}
    else emit(value);
   };
   const validate=raw=>loadCatalog().then(catalog=>{try{return resolveScript(raw,catalog);}catch(e){invalid(e.message);}});
   if(command==='gui'){
    const port=options.port===undefined?8777:Number(options.port);
    if(!Number.isInteger(port)||port<0||port>65535)invalid('--port must be 0–65535');
    const {startServer}=await import('../src/server.mjs');
    const server=await startServer({port,outputRoot});
    controller.signal.addEventListener('abort',()=>{void server.close();},{once:true});
    emit({ok:true,url:server.url},`Comic Theatre: ${server.url}`);
    progress('Keep this terminal open. Ctrl+C stops the GUI; interrupted jobs can be resumed.');
    if(!options['no-open'])await openBrowser(server.url).catch(e=>progress(`Could not open browser: ${e.message}. Open ${server.url} manually.`));
   }else if(command==='assets'){
    const assets=await verifyCatalog(await loadCatalog());emit({ok:true,assets},`Verified ${assets.length} bundled assets.`);
   }else if(command==='select'){
    if(!positional[0])invalid('Supply a template: book-duet, fireside-reader, page-tour');
    const catalog=await loadCatalog();let selected;try{selected=selectScript(positional[0],options.seed===undefined?undefined:Number(options.seed),catalog);}catch(e){invalid(e.message);}await save(selected);
   }else if(command==='chaos'){
    const catalog=await loadCatalog(),{generateChaos,INTENSITIES}=await import('../src/chaos.mjs');
    if(positional.length)invalid('chaos takes options only');
    if(options.intensity&&!INTENSITIES.includes(options.intensity))invalid(`--intensity: choose ${INTENSITIES.join(', ')}`);
    if(options.template&&!catalog.templates.some(t=>t.id===options.template))invalid(`--template: choose ${catalog.templates.map(t=>t.id).join(', ')}`);
    const make=seed=>generateChaos(catalog,{seed,template:options.template,intensity:options.intensity??'wild'});
    const first=options.seed===undefined?globalThis.crypto.getRandomValues(new Uint32Array(1))[0]>>>1:Number(options.seed);
    if(options.count===undefined){if(options['out-dir'])invalid('--out-dir needs --count');await save(make(first));}
    else{
     const count=Number(options.count);
     if(!Number.isInteger(count)||count<1||count>MAX_BATCH_JOBS)invalid(`--count must be 1–${MAX_BATCH_JOBS}`);
     if(!options['out-dir']||options.out)invalid('--count writes files: use --out-dir DIR (not --out)');
     const dir=path.resolve(options['out-dir']);await fs.mkdir(dir,{recursive:true});
     const files=[];
     for(let i=0;i<count;i++){
      const seed=(first+i)%4294967296,name=`chaos-${seed}.json`;
      await fs.writeFile(path.join(dir,name),JSON.stringify(make(seed),null,2)+'\n',{flag:'wx'});files.push(name);
     }
     const manifest=path.join(dir,'batch.json');
     await fs.writeFile(manifest,JSON.stringify(files.map(input=>({input})),null,2)+'\n',{flag:'wx'});
     emit({ok:true,dir,files,manifest},`Wrote ${count} chaos scripts and ${manifest}\nRender: node bin/theatre.mjs batch ${manifest} --preview`);
    }
   }else if(command==='validate'){
    await verifyCatalog(await loadCatalog());const script=await validate(await readJSON(positional[0]));emit({ok:true,script},`Valid: ${script.title}; ${script.lines.length} beats; seed ${script.seed}.`);
   }else if(command==='draft'){
    if(options.template&&positional[0])invalid('Choose either a saved script or --template');
    const catalog=await loadCatalog(),{draftScript}=await import('../src/writer.mjs');
    let raw;if(options.template){try{raw=selectScript(options.template,options.seed===undefined?undefined:Number(options.seed),catalog);}catch(e){invalid(e.message);}}else raw=await validate(await readJSON(positional[0]));
    await save(await draftScript(raw,catalog));
   }else if(command==='render'){
    let raw=await readJSON(positional[0],24*1024*1024);let portable;
    if(raw?.kind==='goosnav-render-job'){portable=await (await import('../src/render-job.mjs')).readRenderJob(raw,await loadCatalog());raw=portable.script;}
    if(options.preview&&raw&&typeof raw==='object'&&!Array.isArray(raw))raw.output=previewOutput(raw.output);
    if(raw&&typeof raw==='object'&&!Array.isArray(raw))Object.assign(raw,look);
    await validate(raw);
    const job=await createJob(raw,{backend:options.backend??'auto',voice:options.voice??portable?.voice??'flite',inputRoot:path.dirname(path.resolve(positional[0])),outputRoot});
    if(portable?.music)await fs.writeFile(path.join(outputRoot,job.id,'music.bin'),Buffer.from(portable.music.base64,'base64'));
    progress(`Run ${job.id}`);const finished=await processJob(job.id,{outputRoot,progress,signal:controller.signal});emit(finished,finished.verification.path);
   }else if(command==='batch'){
    const entries=await readJSON(positional[0],1024*1024);
    if(!Array.isArray(entries)||entries.length<1||entries.length>MAX_BATCH_JOBS)invalid(`Batch manifest must be an array of 1–${MAX_BATCH_JOBS} entries`);
    const report=await runBatch(entries,{baseDir:path.dirname(path.resolve(positional[0])),outputRoot,voice:options.voice??'flite',preview:options.preview,resume:options.resume,look,backend:options.backend??'auto',signal:controller.signal,progress});
    emit(report);if(!report.ok)process.exitCode=1;
   }else if(command==='resume'){
    if(!positional[0])invalid('Supply RUN_ID from status');
    const job=await processJob(positional[0],{outputRoot,progress,backend:options.backend,signal:controller.signal});emit(job,job.verification?.path??job.status);
   }else if(command==='status'){
    emit(positional[0]?await readJob(positional[0],outputRoot):await listJobs(outputRoot));
   }else if(command==='doctor'){
    await run(process.env.FFMPEG??'ffmpeg',['-version']);await run(process.env.FFPROBE??'ffprobe',['-version']);await verifyCatalog(await loadCatalog());
    await WebAssembly.compile(await fs.readFile(new URL('../node_modules/@echogarden/flite-wasi/flite.wasm',import.meta.url)));
    const {selectBackend,probeCapability}=await import('../src/capabilities.mjs');const selected=await selectBackend();const encoder=await probeCapability('ffmpeg');if(!encoder.available)throw Error(encoder.error);
    emit({ok:true,node:process.version,root:ROOT,voice:'flite',...selected,encoder},`Backend: ${selected.backend}; FFmpeg, ffprobe, Flite and verified assets OK.`);
   }
  }
 }
}catch(e){
 process.exitCode=controller.signal.aborted?130:e instanceof UsageError?2:1;
 progress(`Error: ${e.message}\nUse --help for options. Completed run stages remain in their output directory.`);
 if(json)emit({ok:false,error:e.message,stage:e.stage??(e instanceof UsageError?'input':'output'),exitCode:process.exitCode});
}
