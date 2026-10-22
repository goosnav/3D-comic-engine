import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {resolve, sep, extname, join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const ids=['diner','basement','moon-base','tv-studio'];
const review=join(tmpdir(),'theatre-scene-integration');

async function fixture(t){
 const catalog=JSON.parse(await readFile(resolve(root,'assets/catalog.json'),'utf8'));
 catalog.scenes=[{id:'library'},{id:'fireside'},...ids.map(id=>({id,label:id,asset:'scene-'+id,default:false}))];
 catalog.templates=catalog.templates.map(t=>({...t,scenes:[...new Set([...t.scenes,...ids])]}));
 for(const id of ids){
  const path=`assets/environments/theatre-${id}.glb`;
  catalog.assets['scene-'+id]={path,sha256:createHash('sha256').update(await readFile(resolve(root,path))).digest('hex')};
 }
 const server=createServer(async(req,res)=>{
  try{
   const pathname=new URL(req.url,'http://localhost').pathname;
   if(pathname==='/'){
    res.setHeader('Content-Type','text/html');
    return res.end('<style>body{margin:0}canvas{display:block}</style><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script><canvas></canvas>');
   }
   const path=resolve(root,'.'+pathname);
   if(!path.startsWith(root.replace(/\/$/,'')+sep))throw Error('outside fixture');
   res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.glb':'model/gltf-binary','.jpg':'image/jpeg'})[extname(path)]||'application/octet-stream');
   res.end(await readFile(path));
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:432,height:768}});
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.evaluate(async()=>{
  const T=await import('three');window.T=T;
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const original=GLTFLoader.prototype.loadAsync;
  window.resources=[];window.contexts=0;window.loadContexts=[];
  GLTFLoader.prototype.loadAsync=async function(...args){
   const gltf=await original.apply(this,args);
   if(gltf.scene.getObjectByName('Table_top')){
    window.loadContexts.push(window.contexts);
    const seen=new Set();
    gltf.scene.traverse(o=>{
     for(const resource of [o.geometry,...(Array.isArray(o.material)?o.material:[o.material])]){
      if(!resource||seen.has(resource))continue;seen.add(resource);
      const record={count:0};window.resources.push(record);
      resource.addEventListener('dispose',()=>record.count++);
     }
    });
   }
   return gltf;
  };
  const getContext=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(type,...args){
   if(type==='webgl2'||type==='webgl')window.contexts++;
   return getContext.call(this,type,...args);
  };
  T.Scene.prototype.onBeforeRender=function(renderer,scene,camera){window.drawnScene=scene;window.drawnCamera=camera;};
 });
 const timeline={fps:12,frames:72,width:432,height:768,scene:'diner',seed:11,cast:['reader','friend'],
  sources:['book2-020'],events:[
   {type:'line',speaker:'reader',shot:'two-shot',start:0,end:1},
   {type:'line',speaker:'reader',shot:'speaker',start:1,end:2},
   {type:'line',speaker:'friend',shot:'speaker',start:2,end:3},
   {type:'line',speaker:'reader',shot:'over-shoulder',start:3,end:4},
   {type:'source',comic:'book2-020',shot:'book',start:4,end:5},
   {type:'source',comic:'book2-020',shot:'source',start:5,end:6},
  ]};
 return {page,catalog,timeline};
}

test('real E1 sets render at existing cameras, with one table and disposable geometry', {timeout:180000},async t=>{
 const {page,catalog,timeline}=await fixture(t);await mkdir(review,{recursive:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const id of ids){
  const loaded=await page.evaluate(async({catalog,timeline,id})=>{
   window.player?.dispose();window.resources=[];window.contexts=0;window.loadContexts=[];
   const {verifyAssetCatalog}=await import('/browser/assets.mjs');
   window.snapshot?.dispose();
   window.snapshot=await verifyAssetCatalog(catalog,{script:{template:'book-duet',title:'Environment review',scene:id,
    seed:12,comics:['book2-020'],lines:[{speaker:'reader',text:'A comment.',comic:'book2-020'}],endCard:{enabled:false}}});
   const {createPlayer}=await import('/src/player.mjs');
   window.player=await createPlayer(document.querySelector('canvas'),{timeline:{...timeline,scene:id},catalog:window.snapshot.catalog});
   const tops=[];drawnScene.traverse(o=>{if(o.name==='Table_top')tops.push(o);});
   const bounds=new T.Box3().setFromObject(tops[0]);
   return {tops:tops.length,topY:bounds.max.y,loadContexts:window.loadContexts,
    warnings:window.player.diagnostics().warnings,
    rootMeshes:drawnScene.children.filter(o=>o.isMesh).map(o=>o.name),
    shadows:tops[0].castShadow&&tops[0].receiveShadow};
  },{catalog,timeline,id});
  assert.equal(loaded.tops,1);assert.ok(Math.abs(loaded.topY-.816)<1e-5);
  assert.deepEqual(loaded.loadContexts,[0],'environment must finish loading before GPU allocation');
  assert.deepEqual(loaded.rootMeshes,[],'no procedural table/floor mixed into the asset set');
  assert.equal(loaded.shadows,true);
  assert.ok(loaded.warnings.every(w=>!w.includes('environment GLB is not used')),
   `${id}: diagnostics must not claim the loaded environment is unused`);
  for(const [name,frame]of [['two-shot',6],['reader',18],['friend',30],['over-shoulder',42],['book',54],['source',66]]){
   const state=await page.evaluate(async frame=>{
    await window.player.renderAt(frame);
    const hits=[];
    if(drawnCamera.isPerspectiveCamera){
     const ray=new T.Raycaster();
     for(const x of [-.8,-.4,0,.4,.8])for(const y of [-.5,0,.4]){
      ray.setFromCamera(new T.Vector2(x,y),drawnCamera);
      let o=ray.intersectObject(drawnScene,true)[0]?.object;
      while(o){if(o.name.startsWith('actor-'))hits.push(o.name);o=o.parent;}
     }
    }
    return {shot:window.player.diagnostics().shot,hits};
   },frame);
   if(['reader','friend'].includes(name))assert.ok(state.hits.includes('actor-'+name),`${id}: ${name} visible`);
   if(name==='two-shot'||name==='over-shoulder')for(const actor of ['reader','friend'])assert.ok(state.hits.includes('actor-'+actor),`${id}: ${name} sees ${actor}`);
   await page.locator('canvas').screenshot({path:join(review,`${id}-${name}.png`)});
  }
  const disposed=await page.evaluate(()=>{
   window.player.dispose();window.player.dispose();window.snapshot.dispose();
   return window.resources.map(r=>r.count);
  });
  assert.ok(disposed.length>20);assert.ok(disposed.every(count=>count===1),'set resources disposed exactly once');
 }
 assert.deepEqual(errors,[]);
 console.log('Scene screenshots:',review);
});

test('missing scene and later loading failure reject before GPU and release loaded set resources',{timeout:60000},async t=>{
 const {page,catalog,timeline}=await fixture(t);
 const result=await page.evaluate(async({catalog,timeline})=>{
  const {createPlayer}=await import('/src/player.mjs');
  const missing=structuredClone(catalog);delete missing.assets['scene-diner'];
  let missingError,laterError;
  try{await createPlayer(document.querySelector('canvas'),{timeline,catalog:missing});}catch(e){missingError=e.message;}
  const broken=structuredClone(catalog);broken.assets.book.path='assets/missing-book.glb';
  try{await createPlayer(document.querySelector('canvas'),{timeline,catalog:broken});}catch(e){laterError=e.message;}
  return {missingError,laterError,contexts:window.contexts,resources:window.resources.map(r=>r.count)};
 },{catalog,timeline});
 assert.match(result.missingError,/Missing scene asset.*diner/);
 assert.match(result.laterError,/404|fetch|load/i);
 assert.equal(result.contexts,0);
 assert.ok(result.resources.length>20);assert.ok(result.resources.every(n=>n===1));
});

test('native tall hats and astronaut headgear fit existing conversation shots through large gestures',{timeout:300000},async t=>{
 const {page,catalog,timeline}=await fixture(t);await mkdir(review,{recursive:true});
 for(const [variant,scene]of [['crooked','tv-studio'],['cowboy','diner'],['astronaut','moon-base']]){
  await page.evaluate(async({catalog,timeline,variant,scene})=>{
   window.player?.dispose();
   const {createPlayer}=await import('/src/player.mjs');
   window.player=await createPlayer(document.querySelector('canvas'),{catalog,timeline:{...timeline,scene,
    characters:{reader:variant,friend:variant+'-beady'},
    events:timeline.events.slice(0,4).map((e,i)=>({...e,gesture:i<2?'windmill':'rubber_hose',
     mouth:[{t:0,value:0},{t:.3,value:.7},{t:.6,value:.3},{t:1,value:0}]}))}});
  },{catalog,timeline,variant,scene});
  for(const [name,frame,actors]of [['two-shot',6,['reader','friend']],['reader',18,['reader']],['friend',30,['friend']],['over-shoulder',42,['reader']]]){
   const check=await page.evaluate(async({frame,actors})=>{
    await window.player.renderAt(frame);
    return actors.map(id=>{
     const root=drawnScene.getObjectByName('actor-'+id),bounds=new T.Box2();
     root.traverse(o=>{
      if(!o.isSkinnedMesh)return;
      const head=o.skeleton.bones.findIndex(b=>b.name==='head');
      const indices=o.geometry.attributes.skinIndex,weights=o.geometry.attributes.skinWeight;
      for(let i=0;i<indices.count;i++){
       let weight=0;
       for(let j=0;j<4;j++)if(indices.getComponent(i,j)===head)weight+=weights.getComponent(i,j);
       if(weight<.5)continue;
       const p=o.getVertexPosition(i,new T.Vector3()).applyMatrix4(o.matrixWorld).project(drawnCamera);
       bounds.expandByPoint(new T.Vector2(p.x,p.y));
      }
     });
     return {id,scale:root.scale.toArray(),min:bounds.min.toArray(),max:bounds.max.toArray()};
    });
   },{frame,actors});
   await page.locator('canvas').screenshot({path:join(review,`${variant}-${name}.png`)});
   for(const b of check){
    assert.deepEqual(b.scale,[1,1,1],'native actor scale is preserved');
    assert.ok(b.min[0]>-.95&&b.max[0]<.95&&b.min[1]>-.95&&b.max[1]<.95,
     `${variant} ${name} ${b.id} complete head/hat bounds: ${JSON.stringify(b)}`);
   }
  }
  // Optional frame-exact short-film review; ordinary regression runs stay small.
  if(process.env.THEATRE_REVIEW_VIDEO==='1'){
   const folder=join(review,variant+'-motion');await mkdir(folder,{recursive:true});
   await page.evaluate(async({catalog,timeline,variant,scene})=>{
    window.player.dispose();const {createPlayer}=await import('/src/player.mjs');
    window.player=await createPlayer(document.querySelector('canvas'),{catalog,timeline:{...timeline,scene,
     characters:{reader:variant,friend:variant+'-beady'},events:[
      {type:'line',speaker:'reader',shot:'two-shot',gesture:'windmill',start:0,end:3,
       reaction:{actor:'friend',gesture:'windmill',at:'line_start',duration:3}},
      {type:'line',speaker:'friend',shot:'two-shot',gesture:'rubber_hose',start:3,end:6,
       reaction:{actor:'reader',gesture:'rubber_hose',at:'line_start',duration:3}},
     ]}});
   },{catalog,timeline,variant,scene});
   for(let frame=0;frame<72;frame++){
    const data=await page.evaluate(async frame=>{await window.player.renderAt(frame);return document.querySelector('canvas').toDataURL('image/png').split(',')[1];},frame);
    await writeFile(join(folder,String(frame).padStart(3,'0')+'.png'),Buffer.from(data,'base64'));
   }
   await promisify(execFile)('ffmpeg',['-y','-loglevel','error','-framerate','12','-i',join(folder,'%03d.png'),
    '-c:v','libx264','-pix_fmt','yuv420p',join(review,variant+'-motion.mp4')]);
  }
 }
 await page.evaluate(()=>window.player.dispose());
});
