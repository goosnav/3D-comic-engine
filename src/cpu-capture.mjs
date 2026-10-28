import fs from 'node:fs/promises';
import path from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {ROOT,digest} from './library.mjs';
import {run} from './process.mjs';
import {writeCPUJob,CPU_WARNINGS} from './cpu-job.mjs';
import {probeVideo} from './capture.mjs';
export async function captureCPU(options){
 const {dir,id,timeline,progress=()=>{},signal}=options;
 const {folder,job}=await writeCPUJob(options);
 await progress('Backend: blender-cpu · H.264/AAC MP4 · reduced fidelity: '+CPU_WARNINGS.join(' '));
 let progressChain=Promise.resolve();
 await run(process.env.BLENDER??'blender',['--background','--factory-startup','--python-exit-code','1','--python',path.join(ROOT,'renderers/blender_cpu.py'),'--',folder],{timeout:24*60*60*1000,maxBytes:256*1024*1024,signal,onStdout:bytes=>{const frames=bytes.toString().match(/CPU_FRAME (\d+)/g);if(frames)progressChain=progressChain.then(()=>progress(`Blender CPU ${frames.at(-1)} / ${timeline.frames}`));}});
 await progressChain;
 const canvas=createCanvas(timeline.width,timeline.height),ctx=canvas.getContext('2d');
 for(let f=0;f<timeline.frames;f++){
  signal?.throwIfAborted();const name=String(f).padStart(6,'0');ctx.clearRect(0,0,canvas.width,canvas.height);
  if(!job.frames[f].full)ctx.drawImage(await loadImage(path.join(folder,`render-${name}.png`)),0,0);
  ctx.drawImage(await loadImage(path.join(folder,`overlay-${name}.png`)),0,0);
  await fs.writeFile(path.join(folder,`frame-${name}.png`),canvas.toBuffer('image/png'));
 }
 const partial=path.join(dir,'final.partial.mp4'),dest=path.join(dir,id+'.mp4');
 await progress('Encoding CPU frames and measured audio to H.264/AAC MP4');
 await run(process.env.FFMPEG??'ffmpeg',['-nostdin','-v','error','-y','-framerate',String(timeline.fps),'-i',path.join(folder,'frame-%06d.png'),'-i',path.join(dir,'mix.wav'),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-threads','2','-c:a','aac','-af','apad','-t',String(timeline.frames/timeline.fps),'-movflags','+faststart',partial],{signal});
 const p=await probeVideo(partial),v=p.streams.find(s=>s.codec_type==='video'),a=p.streams.find(s=>s.codec_type==='audio');
 if(v?.codec_name!=='h264'||a?.codec_name!=='aac'||v.width!==timeline.width||v.height!==timeline.height||Number(v.nb_read_frames)!==timeline.frames||Math.abs(Number(p.format.duration)-timeline.frames/timeline.fps)>.1)throw Object.assign(Error('CPU final audio/video verification failed'),{stage:'encoding'});
 await run(process.env.FFMPEG??'ffmpeg',['-nostdin','-v','error','-i',partial,'-f','null','-'],{signal});signal?.throwIfAborted();await fs.rename(partial,dest);
 return {path:dest,sha256:digest(await fs.readFile(dest)),backend:'blender-cpu',format:'mp4',reducedFidelity:CPU_WARNINGS,frames:timeline.frames,duration:Number(p.format.duration),width:v.width,height:v.height,sources:timeline.sources,delivery:'local-only'};
}
