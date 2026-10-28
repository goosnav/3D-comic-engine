import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root = fileURLToPath(new URL('../',import.meta.url));
// This exercises seven scenes with hundreds of CPU SwiftShader draws. Keep a
// bounded budget that also permits software-only hosts; assertions are unchanged.
test('fitted assets, supported hands and cartoon actions render and seek', {timeout:600000}, async t=>{
 const catalog=JSON.parse(await readFile(resolve(root,'assets/catalog.json')));
 const server=createServer(async(req,res)=>{try{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end('<style>body{margin:0}</style><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script><canvas></canvas>');}
  const path=resolve(root,'.'+req.url);if(!path.startsWith(root))throw Error('path');
  res.setHeader('Content-Type',/\.m?js$/.test(path)?'text/javascript':'application/octet-stream');res.end(await readFile(path));
 }catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:540,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 const geometry=await page.evaluate(async catalog=>{
  const T=await import('three'),{GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const {createActor}=await import('/src/actor.mjs'),{createBook}=await import('/src/book.mjs');
  const actor=createActor((await new GLTFLoader().loadAsync('/assets/actor-crooked.glb')).scene,'reader');
  actor.root.position.set(-.64,0,-.02);actor.root.rotation.y=.3;
  const book=createBook(await new GLTFLoader().loadAsync('/assets/book.glb'),{sources:['book2-020'],events:[{type:'action',rail:'hold',start:0,end:1,bookState:'held-open'}]},new Map(catalog.comics.map(c=>[c.id,c])));
  const samples=[];
  for(const time of [.25,.5,.75,1,2]){
   const state=book.evaluate(time);actor.apply({time,held:state.held});book.apply(time,actor);actor.root.updateMatrixWorld(true);
   const inverse=book.root.matrixWorld.clone().invert();let max=-Infinity,count=0;
   actor.root.traverse(o=>{if(!o.isSkinnedMesh)return;o.skeleton.update();const indices=o.geometry.attributes.skinIndex,weights=o.geometry.attributes.skinWeight;
    for(let i=0;i<indices.count;i++){
     let hand=0;for(let j=0;j<4;j++)if(/^(hand|f\d|thumb)/.test(o.skeleton.bones[indices.getComponent(i,j)].name))hand+=weights.getComponent(i,j);
     if(hand<.5)continue;const p=o.getVertexPosition(i,new T.Vector3()).applyMatrix4(o.matrixWorld).applyMatrix4(inverse);
     if(Math.abs(p.x)<.235&&Math.abs(p.z)<.078){max=Math.max(max,p.y);count++;}
    }
   });samples.push({time,max,count,errors:book.diagnostics().gripErrors});
  }
  book.root.updateMatrixWorld(true);let spineTop=-Infinity;
  const inverse=book.root.matrixWorld.clone().invert();
  book.root.getObjectByName('Spine').traverse(o=>{if(o.isMesh)for(let i=0;i<o.geometry.attributes.position.count;i++)spineTop=Math.max(spineTop,o.getVertexPosition(i,new T.Vector3()).applyMatrix4(o.matrixWorld).applyMatrix4(inverse).y);});
  return {samples,spineTop};
 },catalog);
 t.diagnostic(JSON.stringify(geometry));
 assert.ok(geometry.spineTop<-.003,'folded binding remains below the printed pages');
 for(const sample of geometry.samples.filter(s=>s.time>=1)){assert.ok(sample.max<-.008,`hand vertices stay below paper: ${sample.max}`);assert.ok(sample.errors.every(e=>e<.065));}
 const timeline={version:1,width:540,height:960,fps:24,duration:15,frames:360,seed:12,scene:'library',cast:['reader','friend'],characters:{reader:'crooked',friend:'glasses'},sources:['book2-020'],endCard:{enabled:false},events:[
  {id:'hold',type:'action',rail:'hold',start:0,end:1,bookState:'held-open'},
  {id:'book',type:'line',speaker:'reader',comic:'book2-020',shot:'book',start:1,end:3,mouth:[]},
  {id:'held',type:'line',speaker:'reader',comic:'book2-020',shot:'two-shot',start:3,end:5,mouth:[]},
  {id:'throw',type:'action',rail:'throw',start:5,end:7,bookState:'table-closed'},
  {id:'punch',type:'action',rail:'punch',actor:'reader',target:'friend',start:7,end:10},
  {id:'explode',type:'action',rail:'explode',actor:'reader',start:10,end:13},
  {id:'open',type:'action',rail:'open',comic:'book2-020',start:13,end:15,bookState:'table-open'},
 ]};
 await page.evaluate(async({timeline,catalog})=>{const {createPlayer}=await import('/src/player.mjs');window.player=await createPlayer(document.querySelector('canvas'),{timeline,catalog});},{timeline,catalog});
 const render=async time=>page.evaluate(async time=>{await window.player.renderAt(Math.round(time*24));return window.player.diagnostics();},time);
 await mkdir(resolve(root,'.local/review'),{recursive:true});
 for(const [name,time] of [['held-page',2],['accessories',4],['throw',6],['punch',8.7],['strike',7.9],['explode',11.5],['open',14.9]]){const d=await render(time);await page.screenshot({path:resolve(root,`.local/review/${name}.png`)});assert.ok(d.book.position.every(Number.isFinite));}
 const first=await render(8.7);
 const pixels=await page.locator('canvas').screenshot();
 await render(10.9);assert.deepEqual(await render(8.7),first);
 assert.deepEqual(await page.locator('canvas').screenshot(),pixels,'invisible burst fragments cannot affect later camera framing');
 assert.equal((await render(11.5)).stunt.action,'explode');
 for(const [start,end] of [[5.2,6.9],[7.1,9.9],[10.1,12.9]])assert.deepEqual((await render(start)).camera,(await render(end)).camera,'camera stays fixed throughout each stunt');
 assert.ok((await render(6.95)).book.position[0]>20,'thrown book stays outside the frame');
 await page.evaluate(async ({catalog})=>{
  const {createPlayer}=await import('/src/player.mjs');window.player.dispose();
  const events=[
   {type:'line',id:'flail',speaker:'reader',text:'These captions should stay readable while the arms go completely wild.',gesture:'arm_flail',shot:'medium',start:0,end:3,mouth:[],captions:[{text:'These captions should stay readable',start:0,end:1.5},{text:'while the arms go wild.',start:1.5,end:3}]},
   {type:'line',id:'cry',speaker:'friend',gesture:'cry',shot:'close-up',start:3,end:5,mouth:[],captions:[{text:'My entire argument is gone.',start:0,end:2}]},
   ...['flatten','nose_off','head_spin','head_jerk','walk_away'].map((rail,i)=>({type:'action',id:rail,rail,actor:'reader',shot:'medium',start:5+i*2,end:7+i*2})),
   {type:'line',id:'wide',speaker:'reader',shot:'wide',start:15,end:16,mouth:[]},
   {type:'line',id:'far',speaker:'reader',shot:'extreme-wide',start:16,end:17,mouth:[]}
  ];
  window.player=await createPlayer(document.querySelector('canvas'),{catalog,timeline:{width:540,height:960,fps:24,frames:408,duration:17,seed:12,scene:'library',cast:['reader','friend'],characters:{reader:'cowboy',friend:'glasses'},sources:['book2-020'],captions:{enabled:true,position:'bottom',colors:{reader:'#ffe35b',friend:'#6ee7ff'}},events}});
 },{catalog});
 for(const [name,time]of [['captions-flail',1],['captions-cry',4],['flatten',6.5],['nose-off',8],['head-spin',10],['head-jerk',12],['walk-away',14],['wide',15.5],['extreme-wide',16.5]]){
  await render(time);await page.screenshot({path:resolve(root,`.local/review/${name}.png`)});
 }
 assert.deepEqual((await render(.2)).camera,(await render(2.8)).camera,'wild arms never move the camera');
 assert.equal((await render(1)).captions.color,'#ffe35b');assert.equal((await render(4)).captions.color,'#6ee7ff');assert.equal((await render(6)).captions,null);
 assert.ok((await render(16.5)).camera.position[2]>(await render(15.5)).camera.position[2]*2);
 const late=await render(8);await render(14);assert.deepEqual(await render(8),late);
 for(const scene of ['space','black-pyramids','red-mesas','backrooms','starter-overgrown-courtyard']) {
  const state=await page.evaluate(async({catalog,scene})=>{
   window.player.dispose();const {createPlayer}=await import('/src/player.mjs');
   const actions=['nose_touch','high_five','handshake','dance','ascend','punch'];
   const events=actions.map((rail,i)=>({type:'action',id:rail,rail,actor:'reader',target:'friend',shot:'two-shot',start:i*2,end:i*2+2}));
   events.push({type:'line',id:'rage',speaker:'reader',text:'This is a completely reasonable response.',emotion:'cosmic_rage',gesture:'none',shot:'medium',start:12,end:14,mouth:[]});
   window.player=await createPlayer(document.querySelector('canvas'),{catalog,timeline:{width:540,height:960,fps:24,frames:336,duration:14,seed:81,scene,cast:['reader','friend'],characters:{reader:scene==='space'?'astronaut':'cowboy',friend:scene==='space'?'astronaut-beady':'glasses'},sources:['book2-020'],events}});
   await window.player.renderAt(0);return window.player.diagnostics();
  },{catalog,scene});
  assert.ok(state.camera.position.every(Number.isFinite));
  for(const [name,time]of [['nose-touch',1],['high-five',3],['handshake',5],['dance',6.7],['ascend-early',8.2],['ascend',8.5],['punch',10.2],['cosmic-rage',12.5]]) {
   const d=await render(time);await page.screenshot({path:resolve(root,`.local/review/${scene}-${name}.png`)});
   if(name==='ascend')assert.ok(d.stunt.trackingPitch<-1);
  }
  for(let start=0;start<14;start+=2)assert.deepEqual((await render(start+.2)).camera,(await render(start+1.8)).camera,`${scene} camera is static`);
 }
 assert.deepEqual(errors,[]);
});
