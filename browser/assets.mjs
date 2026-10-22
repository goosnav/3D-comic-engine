import {resolveScript} from '../src/contracts.mjs';
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const mime=p=>p.endsWith('.glb')?'model/gltf-binary':p.endsWith('.frames')?'application/octet-stream':p.endsWith('.mp4')?'video/mp4':p.endsWith('.ttf')?'font/ttf':'image/jpeg';
function pathURL(p,base){
 if(typeof p!=='string'||!p.startsWith('assets/')||/[%\\?#\x00-\x1f]/.test(p)||p.split('/').some(x=>!x||['.','..','archive','archives','archived'].includes(x.toLowerCase())))throw Error('Invalid asset path');
 const url=new URL(p,base);if(url.origin!==new URL(base).origin)throw Error('External asset origin is not allowed');return url;
}
function glb(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length<28||v.getUint32(0,true)!==0x46546c67||v.getUint32(4,true)!==2||v.getUint32(8,true)!==bytes.length)throw Error('Invalid GLB');
 const n=v.getUint32(12,true);const json=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+n)));
 if([...(json.buffers??[]),...(json.images??[])].some(r=>r.uri))throw Error('External GLB dependencies are not allowed');
 return {json,offset:28+n,bytes};
}
/** Own immutable bytes for this render; the caller must dispose even on errors. */
export async function verifyAssetCatalog(input,{script,onProgress=()=>{},baseURL=location.href,fetchImpl=fetch,signal}={}){
 const catalog=structuredClone(input),urls=[];
 const dispose=()=>{for(const url of urls)URL.revokeObjectURL(url);urls.length=0;};
 if(catalog.version!==1||!catalog.edition?.pdfSha256||!catalog.assets?.book||!Array.isArray(catalog.comics))throw Error('Invalid source catalog');
 const allEntries=[...Object.values(catalog.assets),...catalog.comics];
 // Validate the entire catalog before fetching, including unused metadata paths.
 const paths=new Map(allEntries.map(e=>[e,pathURL(e.path,baseURL)]));
 let entries=allEntries,comics=catalog.comics;
 if(script!==undefined){
  const resolved=resolveScript(script,catalog),keys=new Set(['book']);
  for(const {id}of resolved.cast){
   const key=catalog.variants?catalog.variants.find(v=>v.id===resolved.characters[id])?.asset:'actor';
   if(!key||!catalog.assets[key])throw Error(`Missing actor asset: ${id}`);
   keys.add(key);
  }
  if(resolved.endCard.enabled){
   if(!catalog.assets.endCardFrames)throw Error('Endcard frame asset is missing. Reload the updated application.');
   keys.add('endCardFrames');
   for(const key of ['serifFont','sansFont'])if(catalog.assets[key])keys.add(key);
  }
  comics=resolved.comics.map(id=>catalog.comics.find(c=>c.id===id));
  entries=[...keys].map(key=>catalog.assets[key]).concat(comics);
 }
 let book;
 try{
  for(const [i,entry]of entries.entries()){
   const timeout=AbortSignal.timeout(60000);
   const response=await fetchImpl(paths.get(entry),{signal:signal?AbortSignal.any([signal,timeout]):timeout,redirect:'error'});
   if(!response.ok)throw Error(`Asset load failed: ${entry.path} (HTTP ${response.status})`);
   const bytes=new Uint8Array(await response.arrayBuffer());
   if(await hash(bytes)!==entry.sha256)throw Error(`${entry.path}: source hash mismatch; reload the verified asset catalog`);
   if(entry.path.endsWith('.glb')){const data=glb(bytes);if(entry===catalog.assets.book)book=data;}
   const originalPath=entry.path;
   const url=URL.createObjectURL(new Blob([bytes],{type:mime(entry.path)}));urls.push(url);entry.path=url;
   const message=`Verified ${originalPath}`;
   onProgress(message,{phase:'assets',progress:(i+1)/entries.length,message,done:i+1,count:entries.length});
  }
  for(const comic of comics){
   const j=book.json,material=j.materials?.find(m=>m.name===`Comic page ${String(comic.pdfPage-2).padStart(2,'0')}`);
   const texture=j.textures?.[material?.pbrMetallicRoughness?.baseColorTexture?.index];
   const image=j.images?.[texture?.source],view=j.bufferViews?.[image?.bufferView];
   if(!view||await hash(book.bytes.subarray(book.offset+(view.byteOffset??0),book.offset+(view.byteOffset??0)+view.byteLength))!==comic.sha256)throw Error(`${comic.id}: embedded book page does not match source`);
  }
  return {catalog,dispose};
 }catch(e){dispose();throw e;}
}
