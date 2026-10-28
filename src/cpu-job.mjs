import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import {createCanvas, loadImage, GlobalFonts} from '@napi-rs/canvas';
import {loadCPUScene} from './cpu-scene.mjs';
import {ROOT,digest} from './library.mjs';
import {createCaptions} from './captions.mjs';
import {createEndcard,endCardFields} from './endcard.mjs';
import {parseFramePack} from './endcard-frames.mjs';
import {atomicJSON} from './jobs.mjs';
export const CPU_WARNINGS = ['Scene lights are approximated by three area lights and ambient illumination; per-scene practical lights are not reproduced.', 'PBR base color, texture, opacity, roughness and metalness are transferred; normal, occlusion, emissive textures, transmission, clearcoat and custom shaders are not reproduced.','Cycles CPU lighting and material response differ from Three.js; stage grade, grain and ordered dither are not reproduced.', 'Rig, morphs, procedural props and stunts are evaluated in JavaScript and baked to mesh samples; Blender does not reimplement their animation.', 'Endcard uses the bundled 540px frame pack; captions use native canvas font rasterization.'];
const matrix=o=>o.matrixWorld.toArray();
export async function writeCPUJob({dir,timeline,catalog,inputKey,progress=()=>{},signal}) {
  const folder=path.join(dir,'cpu-job');await fs.mkdir(folder,{recursive:true});
  const stage=await loadCPUScene(timeline,catalog);stage.evaluate(0);
  for(const [key,name] of [['sansFont','ComicTheatreSans'],['serifFont','ComicTheatreTimes']])if(catalog.assets[key])GlobalFonts.registerFromPath(path.join(ROOT,catalog.assets[key].path),name);
  // Canvas is a local native 2D rasterizer for existing overlays, never a browser.
  const previous=globalThis.document;
  globalThis.document={createElement:tag=>{if(tag!=='canvas')throw Error(`Unsupported CPU DOM element ${tag}`);return createCanvas(1,1);}};
  let captions,card;
  try {captions=createCaptions(timeline.width,timeline.height,timeline.captions,timeline.dither); 
    if(timeline.events.some(e=>e.type==='endcard')){
      const b=await fs.readFile(path.join(ROOT,catalog.assets.endCardFrames.path));const pack=parseFramePack(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
      const frameSource={...pack,getFrame:async seconds=>{const i=Math.floor(seconds*pack.fps)%pack.frames.length;return {image:await loadImage(Buffer.from(pack.frames[i])),time:i/pack.fps};}};
      card=createEndcard({width:timeline.width,height:timeline.height,card:endCardFields(timeline,timeline.events.find(e=>e.type==='endcard')),frameSource});
    }
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
  const meshes=[],definitions=[],materials=[],materialMap=new Map(),textures=new Map();
  async function mat(m){
    if(materialMap.has(m.uuid))return materialMap.get(m.uuid);
    const index=materials.length;materialMap.set(m.uuid,index);
    let texture;
    if(m.map){
      if(!textures.has(m.map.uuid)){
        const name=`texture-${textures.size}.png`,c=createCanvas(m.map.image.width,m.map.image.height);c.getContext('2d').drawImage(m.map.image,0,0);
        await fs.writeFile(path.join(folder,name),c.toBuffer('image/png'));textures.set(m.map.uuid,name);
      }texture=textures.get(m.map.uuid);
    }
    materials.push({color:m.color?.toArray()??[1,1,1],roughness:m.roughness??.8,metalness:m.metalness??0,alpha:m.opacity??1,emission:!!m.isMeshBasicMaterial,texture,flipY:m.map?.flipY??false});return index;
  }
  stage.scene.traverse(o=>{if(o.isMesh)meshes.push(o);});
  for(const o of meshes){
    if(Array.isArray(o.material))throw Error(`CPU material groups unsupported: ${o.name}`);
    const g=o.geometry,positions=Array.from(g.attributes.position.array),indices=g.index?Array.from(g.index.array):Array.from({length:positions.length/3},(_,i)=>i);
    definitions.push({name:o.name,positions,indices,uv:g.attributes.uv?Array.from(g.attributes.uv.array):null,material:await mat(o.material),dynamic:!!o.isSkinnedMesh||!!o.morphTargetInfluences||o.material.name==='eye_white'||o.material.name==='eye_black'});
  }
  const job={version:1,kind:'goosnav-evaluated-scene',coordinates:'right-handed Y-up meters; column-major matrices; camera -Z, +Y up',inputKey,timeline,materials,meshes:definitions,warnings:CPU_WARNINGS,frames:[]};
  const vector=new THREE.Vector3();
  for(let f=0;f<timeline.frames;f++){
    signal?.throwIfAborted();const state=stage.evaluate(f),name=String(f).padStart(6,'0');
    const overlay=path.join(folder,`overlay-${name}.png`);let full=false;
    if(state.endEvent){await card.renderAt(state.time-state.endEvent.start);await fs.writeFile(overlay,card.scene.children[0].material.map.image.toBuffer('image/png'));full=true;}
    else if(state.shot==='source'&&state.source){
      const c=createCanvas(timeline.width,timeline.height),ctx=c.getContext('2d'),img=await loadImage(path.join(ROOT,state.source.path));ctx.fillStyle='#eee9df';ctx.fillRect(0,0,c.width,c.height);const scale=Math.min(c.width*.95/img.width,c.height*.95/img.height);ctx.drawImage(img,(c.width-img.width*scale)/2,(c.height-img.height*scale)/2,img.width*scale,img.height*scale);captions.draw(state.active,state.time);ctx.drawImage(captions.scene.children[0].material.map.image,0,0);await fs.writeFile(overlay,c.toBuffer('image/png'));full=true;
    }else{captions.draw(state.active,state.time);await fs.writeFile(overlay,captions.scene.children[0].material.map.image.toBuffer('image/png'));}
    const arrays=[],objects=meshes.map((o,i)=>{
      let visible=true;for(let p=o;p;p=p.parent)visible&&=p.visible;
      const item={matrix:matrix(o),visible};
      if(definitions[i].dynamic){o.skeleton?.update();const a=new Float32Array(o.geometry.attributes.position.count*3);for(let v=0;v<a.length/3;v++){o.getVertexPosition(v,vector);vector.toArray(a,v*3);}arrays.push(Buffer.from(a.buffer));}
      return item;
    });
    const bytes=Buffer.concat(arrays);await fs.writeFile(path.join(folder,`vertices-${name}.bin`),bytes);
    job.frames.push({rigs:stage.actors.map(a=>({id:a.root.name,bones:Object.fromEntries(Object.entries(a.bones).map(([name,b])=>[name,{position:b.position.toArray(),quaternion:b.quaternion.toArray(),scale:b.scale.toArray()}])),morphs:a.skeletons.length?(()=>{const result=[];a.root.traverse(o=>{if(o.morphTargetInfluences)result.push({name:o.name,weights:o.morphTargetInfluences.slice()});});return result;})():[]})),objects,full,sha256:digest(bytes),camera:{matrix:matrix(stage.camera),fov:stage.camera.fov,near:stage.camera.near,far:stage.camera.far}});
    if(f%timeline.fps===0)await progress(`Evaluating CPU frame ${f+1}/${timeline.frames}`);
  }
  await atomicJSON(path.join(folder,'scene.json'),job);return {folder,job};
}
