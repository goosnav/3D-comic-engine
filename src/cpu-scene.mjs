// Node-only asset adapter. Never imported by the hosted bundle.
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadImage} from '@napi-rs/canvas';
import {ROOT, safePath} from './library.mjs';
import {createSceneEvaluator, sceneAsset, actorAsset, validate} from './scene-evaluator.mjs';

export async function loadCPUScene(timeline, catalog) {
  const comics = validate(timeline,catalog);
  const loader = new GLTFLoader();
  loader.register(parser => ({name:'NODE_IMAGES', async loadTexture(index) {
    const def=parser.json.textures[index], source=parser.json.images[def.source];
    if (source.bufferView === undefined) throw Error('CPU adapter requires embedded GLB textures');
    const bytes=Buffer.from(await parser.getDependency('bufferView',source.bufferView));
    const texture=new THREE.Texture(await loadImage(bytes));
    texture.flipY=false; texture.userData.encoded=bytes; texture.needsUpdate=true;
    return texture;
  }}));
  const load=async asset=>{
    const file=await safePath(ROOT,asset.path), bytes=await fs.readFile(file);
    return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  };
  const selections=timeline.cast.map(id=>actorAsset(catalog,timeline,id)), actorModels=new Map();
  for(const {asset} of selections) if(!actorModels.has(asset.path)) actorModels.set(asset.path,(await load(asset)).scene);
  const environment=sceneAsset(catalog,timeline.scene), extraModels=new Map();
  for(const id of timeline.extras??[]) {const entry=catalog.extras.find(e=>e.id===id);if(!entry.procedural)extraModels.set(id,await load(catalog.assets[entry.asset]));}
  const scene=new THREE.Scene();scene.background=new THREE.Color(catalog.scenes?.find(s=>s.id===timeline.scene)?.backgroundColor??0x192929);
  const camera=new THREE.PerspectiveCamera(38,timeline.width/timeline.height,.04,500);
  return createSceneEvaluator({timeline,catalog,scene,camera,comics,selections,actorModels,extraModels,
    environmentRoot:environment?(await load(environment)).scene:null,bookGLTF:await load(catalog.assets.book)});
}
