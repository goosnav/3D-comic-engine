// Portable intent job: bundled asset hashes resolve against an offline checkout.
// No renderer or subprocess imports: safe for the Cloudflare client bundle.
import {resolveScript} from './contracts.mjs';
export const RENDER_JOB_VERSION=1;
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(b=>b.toString(16).padStart(2,'0')).join('');
export async function makeRenderJob(raw,catalog,{music,voice='flite'}={}){
 const script=resolveScript(raw,catalog);
 if(script.lines.some(line=>line.audio))throw Error('This script uses recorded audio paths. Render the original JSON with its recordings beside it using the local CLI; browser jobs cannot package those files.');
 const assets=Object.fromEntries([...Object.values(catalog.assets),...catalog.comics].map(a=>[a.path,a.sha256]));
 let attachment;
 if(music){if(music.size>15*1024*1024)throw Error('Music exceeds 15 MiB');const bytes=new Uint8Array(await music.arrayBuffer());let text='';for(const byte of bytes)text+=String.fromCharCode(byte);attachment={name:music.name,base64:btoa(text)};}
 const payload={script,assets,voice,...(attachment?{music:attachment}:{})};
 return {kind:'goosnav-render-job',version:RENDER_JOB_VERSION,payload,sha256:await sha(payload)};
}
export async function readRenderJob(job,catalog){
 if(job?.kind!=='goosnav-render-job'||job.version!==RENDER_JOB_VERSION)throw Error('Unsupported portable render-job version');
 if(await sha(job.payload)!==job.sha256)throw Error('Portable render-job integrity mismatch');
 const assets=Object.fromEntries([...Object.values(catalog.assets),...catalog.comics].map(a=>[a.path,a.sha256]));
 for(const [name,hash] of Object.entries(job.payload.assets))if(assets[name]!==hash)throw Error(`Portable job requires matching asset: ${name}. Use the matching engine checkout.`);
 return {...job.payload,script:resolveScript(job.payload.script,catalog)};
}
