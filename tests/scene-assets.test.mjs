import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {verifyAssetCatalog} from '../browser/assets.mjs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createActor} from '../src/actor.mjs';
import {frameCamera, headgearFraming} from '../src/player.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const ids=['diner','basement','moon-base','tv-studio'];
async function fixture(){
 const catalog=JSON.parse(await readFile(root+'assets/catalog.json','utf8'));
 catalog.scenes=[{id:'library'},{id:'fireside'},...ids.map(id=>({id,label:id,asset:'scene-'+id,default:false}))];
 // Local fixture supports the agreed schema while catalog/contracts are owned elsewhere.
 catalog.templates=catalog.templates.map(t=>({...t,scenes:[...new Set([...t.scenes,...ids])]}));
 for(const id of ids){
  const path=`assets/environments/theatre-${id}.glb`;
  // Before delivery this deliberately fails on the missing canonical copy.
  const bytes=await readFile(root+path);
  catalog.assets['scene-'+id]={path,sha256:createHash('sha256').update(bytes).digest('hex')};
 }
 const script={template:'book-duet',title:'Scene subset',seed:12,scene:'diner',comics:['book2-020'],
  lines:[{speaker:'reader',text:'A comment.',comic:'book2-020'}],endCard:{enabled:false}};
 return {catalog,script};
}

test('selected scene is verified and snapshotted; unused scenes are never fetched',async()=>{
 const {catalog,script}=await fixture(),before=structuredClone(catalog),fetched=[];
 const snapshot=await verifyAssetCatalog(catalog,{script,baseURL:'https://local.test/',fetchImpl:async url=>{
  fetched.push(url.pathname.slice(1));return new Response(await readFile(root+url.pathname.slice(1)));
 }});
 const sceneURL=snapshot.catalog.assets['scene-diner'].path;
 try{
  assert.deepEqual(fetched.filter(p=>p.includes('/environments/')),['assets/environments/theatre-diner.glb']);
  assert.equal(fetched.length,5);
  assert.match(sceneURL,/^blob:/);
  assert.equal(snapshot.catalog.assets['scene-basement'].path,catalog.assets['scene-basement'].path);
  assert.deepEqual(catalog,before);
  assert.ok((await fetch(sceneURL)).ok);
 }finally{snapshot.dispose();snapshot.dispose();}
 await assert.rejects(fetch(sceneURL));
});

test('missing selected scene asset fails before fetching rather than silently using a legacy set',async()=>{
 for(const missing of ['entry','reference']){
  const {catalog,script}=await fixture();let calls=0;
  if(missing==='entry')delete catalog.assets['scene-diner'];
  else delete catalog.scenes.find(s=>s.id==='diner').asset;
  await assert.rejects(verifyAssetCatalog(catalog,{script,baseURL:'https://local.test/',
   fetchImpl:async()=>{calls++;throw Error('unexpected fetch');}}),/Missing scene asset.*diner/);
  assert.equal(calls,0);
 }
});

test('scene hash failure revokes all snapshots already allocated',async t=>{
 const {catalog,script}=await fixture(),urls=[];
 const original=URL.createObjectURL;
 t.mock.method(URL,'createObjectURL',function(blob){const url=original.call(this,blob);urls.push(url);return url;});
 catalog.assets['scene-diner'].sha256='0'.repeat(64);
 await assert.rejects(verifyAssetCatalog(catalog,{script,baseURL:'https://local.test/',fetchImpl:async url=>
  new Response(await readFile(root+url.pathname.slice(1)))}),/theatre-diner.glb: source hash mismatch/);
 for(const url of urls)await assert.rejects(fetch(url));
});

test('legacy scenes do not fetch any new environment',async()=>{
 const {catalog,script}=await fixture();script.scene='fireside';const fetched=[];
 const snapshot=await verifyAssetCatalog(catalog,{script,baseURL:'https://local.test/',fetchImpl:async url=>{
  fetched.push(url.pathname);return new Response(await readFile(root+url.pathname.slice(1)));
 }});
 try{assert.equal(fetched.length,4);assert.ok(fetched.every(p=>!p.includes('/environments/')));}
 finally{snapshot.dispose();}
});

test('bulky OTS clears the central speaking face while retaining the near shoulder, without changing legacy cameras',async()=>{
 for(const variant of ['astronaut','astronaut-beady','blue']){
  const bytes=await readFile(root+`assets/actor-${variant}.glb`);
  const model=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  const scene=new THREE.Scene();
  const actors=['reader','friend'].map((id,i)=>{
   const a=createActor(model,id,i);a.root.position.set(i?.08:-.64,0,-.02);a.root.rotation.y=i?-.3:.3;
   scene.add(a.root);a.headgearFrame=headgearFraming(a);return a;
  });
  for(const aspect of [432/768,432/540])for(const focusId of ['reader','friend']){
   const camera=new THREE.PerspectiveCamera(38,aspect,.04,30);
   for(const time of [.25,.5,.75]){
    const line={type:'line',speaker:focusId,start:0,end:1,gesture:'rubber_hose',mouth:[{t:0,value:.7},{t:1,value:.7}]};
    actors.forEach((a,i)=>a.apply({time,line,listening:a.root.name!==`actor-${focusId}`,gaze:i?-.32:.32,seed:11}));
    scene.updateMatrixWorld(true);actors.forEach(a=>a.skeletons.forEach(s=>s.update()));
    frameCamera(camera,{shot:'over-shoulder',focusId,actors,time});camera.updateMatrixWorld(true);
    if(variant==='blue'){
     const side=focusId==='reader'?-1:1,listenerX=focusId==='reader'?.08:-.64;
     assert.deepEqual(camera.position.toArray(),[listenerX-side*.8*Math.max(1,.7/aspect),1.76,-.92]);
     continue;
    }
    const speaker=actors.find(a=>a.root.name===`actor-${focusId}`),listener=actors.find(a=>a!==speaker);
    // Bake the actual evaluated vertices once per pose for CPU-only raycasts;
    // repeated SkinnedMesh raycasts would reskin every triangle for every ray.
    const baked=actor=>{
     const group=new THREE.Group();actor.root.traverse(o=>{
      if(!o.isMesh)return;const g=o.geometry.clone(),positions=g.attributes.position;
      for(let i=0;i<positions.count;i++){
       const p=o.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(o.matrixWorld);
       positions.setXYZ(i,p.x,p.y,p.z);
      }
      g.morphAttributes={};g.computeBoundingBox();g.computeBoundingSphere();
      group.add(new THREE.Mesh(g,o.material));
     });group.updateMatrixWorld(true);return group;
    };
    const speakingMesh=baked(speaker),listeningMesh=baked(listener);
    const ray=new THREE.Raycaster();let face=0,clear=0,shoulder=0;
    const material=hit=>Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;
    // Compare rays that actually hit the speaker's eyes/mouth alone against
    // the complete two-actor scene, rather than merely projecting a head box.
    for(let x=-.9;x<=.9;x+=.025)for(let y=-.8;y<=.8;y+=.025){
     ray.setFromCamera(new THREE.Vector2(x,y),camera);
     const target=ray.intersectObject(speakingMesh,true)[0];
     const foreground=ray.intersectObject(listeningMesh,true)[0];
     if(foreground&&(!target||foreground.distance<target.distance))shoulder++;
     if(!target||!/(eye_white|eye_black|mouth_dark|tongue)/.test(material(target)?.name||''))continue;
     face++;if(!foreground||foreground.distance>target.distance-.001)clear++;
    }
    assert.ok(face>5,`${variant} ${focusId}: enough actual face rays (${face})`);
    assert.ok(clear/face>.9,`${variant} ${focusId} aspect ${aspect} t=${time}: only ${clear}/${face} facial rays clear`);
    assert.ok(shoulder>10,'retain visible near actor: this is still an over-shoulder shot');
    for(const group of [speakingMesh,listeningMesh])group.traverse(o=>o.geometry?.dispose());
   }
  }
 }
});
