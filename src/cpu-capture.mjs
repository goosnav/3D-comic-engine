import fs from 'node:fs/promises';
import path from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {ROOT,digest} from './library.mjs';
import {run} from './process.mjs';
import {writeCPUJob,CPU_WARNINGS} from './cpu-job.mjs';
import {probeVideo} from './capture.mjs';
import {applyDigitalCartoon} from './digital-look.mjs';
export function composeCPUFrame(ctx,{stage,overlay,full,cartoon}) {
 ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
 if(!full){ctx.drawImage(stage,0,0);applyDigitalCartoon(ctx,cartoon);}
 ctx.drawImage(overlay,0,0);
}
const describeCPU=actual=>`CPU ${actual.quality} quality · ${actual.cpuSamples} samples${actual.cpuSamplesOverridden?' (THEATRE_CPU_SAMPLES override)':''} · ${actual.bounces} bounces`;
export async function captureCPU(options){
 const {dir,id,timeline,progress=()=>{},signal}=options;
 const {folder,job}=await writeCPUJob(options);
 const settings=job.renderSettings;
 await progress(`Backend: blender-cpu · ${settings.quality} quality · H.264/AAC MP4 · reduced fidelity: `+CPU_WARNINGS.join(' '));
 let progressChain=Promise.resolve(),pending='';
 await run(process.env.BLENDER??'blender',['--background','--factory-startup','--python-exit-code','1','--python',path.join(ROOT,'renderers/blender_cpu.py'),'--',folder],{timeout:24*60*60*1000,maxBytes:256*1024*1024,signal,onStdout:bytes=>{
  pending+=bytes.toString();const lines=pending.split('\n');pending=lines.pop();
  for(const line of lines){
   if(line.startsWith('CPU_SETTINGS ')){const actual=JSON.parse(line.slice(13));progressChain=progressChain.then(()=>progress(describeCPU(actual)));}
   if(/^CPU_FRAME \d+/.test(line))progressChain=progressChain.then(()=>progress(`Blender CPU ${line.trim()} / ${timeline.frames}`));
  }
 }}).catch(error=>{throw Object.assign(error,{stage:/EACCES|EPERM|Operation not permitted|Permission denied/i.test(error.message)?'permissions':'frame rendering'});});
 await progressChain;
 const actual=JSON.parse(await fs.readFile(path.join(folder,'render-info.json'),'utf8'));
 const canvas=createCanvas(timeline.width,timeline.height),ctx=canvas.getContext('2d');
 for(let f=0;f<timeline.frames;f++){
  signal?.throwIfAborted();const name=String(f).padStart(6,'0'),full=job.frames[f].full;
  const stage=full?null:await loadImage(path.join(folder,`render-${name}.png`));
  const overlay=await loadImage(path.join(folder,`overlay-${name}.png`));
  composeCPUFrame(ctx,{stage,overlay,full,cartoon:timeline.cartoon});
  await fs.writeFile(path.join(folder,`frame-${name}.png`),canvas.toBuffer('image/png'));
 }
 const partial=path.join(dir,'final.partial.mp4'),dest=path.join(dir,id+'.mp4');
 await progress(`Encoding CPU frames and measured audio to H.264/AAC MP4 · ${settings.quality} · CRF ${settings.crf} · ${settings.preset}`);
 await run(process.env.FFMPEG??'ffmpeg',['-nostdin','-v','error','-y','-framerate',String(timeline.fps),'-i',path.join(folder,'frame-%06d.png'),'-i',path.join(dir,'mix.wav'),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset',settings.preset,'-crf',String(settings.crf),'-pix_fmt','yuv420p','-threads','2','-c:a','aac','-af','apad','-t',String(timeline.frames/timeline.fps),'-movflags','+faststart',partial],{signal}).catch(error=>{throw Object.assign(error,{stage:'encoding'});});
 const p=await probeVideo(partial).catch(error=>{throw Object.assign(error,{stage:'encoding'});}),v=p.streams.find(s=>s.codec_type==='video'),a=p.streams.find(s=>s.codec_type==='audio');
 if(v?.codec_name!=='h264'||a?.codec_name!=='aac'||v.width!==timeline.width||v.height!==timeline.height||Number(v.nb_read_frames)!==timeline.frames||Math.abs(Number(p.format.duration)-timeline.frames/timeline.fps)>.1)throw Object.assign(Error('CPU final audio/video verification failed'),{stage:'encoding'});
 await run(process.env.FFMPEG??'ffmpeg',['-nostdin','-v','error','-i',partial,'-f','null','-'],{signal}).catch(error=>{throw Object.assign(error,{stage:'encoding'});});signal?.throwIfAborted();await fs.rename(partial,dest).catch(error=>{throw Object.assign(error,{stage:'output'});});
 return {path:dest,sha256:digest(await fs.readFile(dest)),backend:'blender-cpu',format:'mp4',renderQuality:actual.quality,cpuSamples:actual.cpuSamples,cpuBounces:actual.bounces,cpuSamplesOverridden:actual.cpuSamplesOverridden,reducedFidelity:CPU_WARNINGS,frames:timeline.frames,duration:Number(p.format.duration),width:v.width,height:v.height,sources:timeline.sources,delivery:'local-only'};
}
