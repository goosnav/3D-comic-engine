// Local-only session capability cache; failed backends are not retried per clip.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {run,withDeadline} from './process.mjs';
const cache=new Map();
export const BACKENDS=['auto','chromium-gpu','chromium-software','blender-cpu'];
export function invalidateCapability(name,error){cache.set(name,Promise.resolve({available:false,error:error.message,stage:error.stage??'renderer startup'}));}
export async function probeCapability(name){
 if(cache.has(name))return cache.get(name);
 const operation=(async()=>{try{
  if(name==='ffmpeg'){
   const encoders=(await run(process.env.FFMPEG??'ffmpeg',['-hide_banner','-encoders'])).toString();
   if(!/\blibx264\b/.test(encoders)||!/\baac\b/.test(encoders))throw Error('FFmpeg requires libx264 and AAC encoders');
   await run(process.env.FFPROBE??'ffprobe',['-version']);
  }else if(name==='blender-cpu'){
   const dir=await fs.mkdtemp(path.join(os.tmpdir(),'theatre-cpu-probe-'));
   try{await run(process.env.BLENDER??'blender',['--background','--factory-startup','--python-exit-code','1','--python-expr',`import bpy; s=bpy.context.scene; s.render.engine='CYCLES'; s.cycles.device='CPU'; s.cycles.samples=1; s.cycles.use_denoising=False; s.render.resolution_x=8; s.render.resolution_y=8; s.render.resolution_percentage=100; s.render.threads_mode='FIXED'; s.render.threads=2; s.render.filepath=${JSON.stringify(path.join(dir,'probe.png'))}; bpy.ops.render.render(write_still=True)`],{timeout:60000});await fs.access(path.join(dir,'probe.png'));}finally{await fs.rm(dir,{recursive:true,force:true});}
  }else{
   const {chromium}=await import('playwright');let browser;
   try{browser=await chromium.launch({headless:true,timeout:15000,...(process.env.THEATRE_BROWSER?{executablePath:process.env.THEATRE_BROWSER}:{}),args:name==='chromium-gpu'?['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist']:['--enable-unsafe-swiftshader']});const page=await browser.newPage();const graphics=await withDeadline(page.evaluate(()=>{const c=document.createElement('canvas');const gl=c.getContext('webgl2');if(!gl||gl.isContextLost())return null;const info=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};}),10000,'WebGL probe',()=>browser.close());if(!graphics)throw Error('WebGL2 context unavailable');if(name==='chromium-gpu'&&/swiftshader|llvmpipe|software|warp/i.test(graphics.renderer))throw Error(`Accelerated context unavailable: ${graphics.renderer}`);}finally{await browser?.close();}
  }
  return {available:true};
 }catch(e){return {available:false,error:e.message,stage:/EACCES|EPERM|Operation not permitted|Permission denied|socket\(\) failed/i.test(e.message)?'permissions':'renderer startup'};}})();
 cache.set(name,operation);return operation;
}
export async function selectBackend(request='auto'){
 if(!BACKENDS.includes(request))throw Object.assign(Error(`Unknown backend: ${request}`),{stage:'input'});
 const candidates=request==='auto'?(process.env.THEATRE_GPU==='0'?['chromium-software','blender-cpu']:BACKENDS.slice(1)):[request],attempts=[];
 for(const backend of candidates){const capability=await probeCapability(backend);attempts.push({backend,...capability});if(capability.available)return {backend,attempts};
  // Startup denial or missing executable cannot be fixed by SwiftShader.
  if(backend==='chromium-gpu'&&/permissions|executable.*doesn.t exist|ENOENT/i.test(capability.stage+' '+capability.error))invalidateCapability('chromium-software',Object.assign(Error(capability.error),{stage:capability.stage}));
 }
 throw Object.assign(Error('No rendering backend available. Install Blender for offline CPU rendering. '+attempts.map(a=>`${a.backend}: ${a.error}`).join('; ')),{stage:'renderer startup',attempts});
}
