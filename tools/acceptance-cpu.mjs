// Explicit integration acceptance; actual offline CPU frames, speech and captions.
import fs from 'node:fs/promises';import path from 'node:path';
import {ROOT} from '../src/library.mjs';import {runBatch} from '../src/jobs.mjs';import {probeVideo} from '../src/capture.mjs';
const dir=path.resolve(process.argv[2]??'/tmp/goosnav-seven-cpu');await fs.mkdir(dir,{recursive:true});
process.env.THEATRE_BROWSER='/chromium-intentionally-unavailable';
const sources=['parasite.json','chaotic-comedy.json','cursor-chaos.json'];
const base=JSON.parse(await fs.readFile(path.join(ROOT,'examples',sources[0])));
const entries=[];
for(let i=0;i<7;i++){
 const raw=structuredClone(base);raw.title=`CPU acceptance ${i+1}`;raw.seed=420+i;raw.output={width:320,height:480,fps:12};raw.scene=i===1?'fireside':'library';raw.endCard={enabled:true,seconds:1};
 raw.lines=[{speaker:i%2?'friend':'reader',text:['Look at this book.','That is a good point.','What happened here?','This page is strange.','I am listening.','Look over there.','Goodbye for now.'][i],shot:['two-shot','speaker','wide','medium','over-shoulder','close-up','two-shot'][i],gesture:['explain','nod','shrug','explain','head_tilt','explain','nod'][i]}];
 if(i===6)raw.lines.push({action:'head_spin',actor:'reader',seconds:.8});
 const input=`scene-${i+1}.json`;await fs.writeFile(path.join(dir,input),JSON.stringify(raw));entries.push({input});
}
await fs.writeFile(path.join(dir,'batch.json'),JSON.stringify(entries));const start=performance.now();
const report=await runBatch(entries,{baseDir:dir,outputRoot:path.join(dir,'output'),backend:'auto',resume:true,progress:console.error});
for(const item of report.results)if(item.status==='complete'){const p=await probeVideo(item.job.verification.path);item.probe={streams:p.streams.map(s=>({type:s.codec_type,codec:s.codec_name,width:s.width,height:s.height,frames:s.nb_read_frames,duration:s.duration})),duration:p.format.duration};}
report.elapsedSeconds=(performance.now()-start)/1000;report.resolution='320x480';report.fps=12;report.samples=process.env.THEATRE_CPU_SAMPLES??8;
await fs.writeFile(path.join(dir,'acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.ok)process.exitCode=1;
