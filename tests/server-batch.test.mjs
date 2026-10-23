import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {createServerBatchQueue,BATCH_BODY_LIMIT} from '../src/server-batch.mjs';
import {startServer} from '../src/server.mjs';
import {resolveScript} from '../src/contracts.mjs';
import {atomicJSON} from '../src/jobs.mjs';
import {ROOT,digest} from '../src/library.mjs';

const catalog={edition:{pdfSha256:'a'.repeat(64)},templates:[{id:'book-duet',minComics:1,maxComics:1,speakers:['reader','friend'],scenes:['library','fireside']}],comics:[{id:'p1',sha256:'b'.repeat(64),pdfPage:5,verified:true}]};
const script=(overrides={})=>({version:1,template:'book-duet',title:'Authored scene',comics:['p1'],seed:31,scene:'fireside',characters:{reader:'olive',friend:'rust'},lines:[{speaker:'reader',text:'The original punchline.',emotion:'skeptical',gesture:'head_tilt',shot:'over-shoulder',pause:1.7,face:{brow_left:.4,blink:'once'},reaction:{actor:'friend',emotion:'pleased',gesture:'nod',at:'line_start',duration:1.3},audio:'takes/original.wav'}],output:{width:1920,height:1080,fps:30},endCard:{enabled:false,title:'Authored title',text:'Authored text',url:'www.goosnav.shop',seconds:8},...overrides});
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
const verified=id=>({id,status:'complete',video:`/output/${id}/${id}.mp4`});

test('desktop batch snapshots exact authored settings and serializes overlapping batches',async()=>{
 const entered=deferred(),release=deferred(),created=[],events=[];
 let active=0,maxActive=0;
 const queue=createServerBatchQueue({catalog,outputRoot:'/test/output',create:async(raw,options)=>{
  const id=`job-${created.length+1}`;created.push({id,script:structuredClone(raw),options});return {id};
 },process:async id=>{
  events.push(`start:${id}`);maxActive=Math.max(maxActive,++active);
  if(id==='job-1'){entered.resolve();await release.promise;}
  active--;events.push(`end:${id}`);
 },read:async id=>verified(id)});
 const original=script(),expected=resolveScript(structuredClone(original),catalog);
 const request={entries:[{name:'folder\\scene.json',script:original},{name:'folder/scene.json',script:original}],voice:'recorded'};
 const first=queue.submit(request);
 const second=queue.submit({entries:[{name:'third.json',script:script({title:'Third script'})}],voice:'kokoro'});
 original.output.width=128;original.characters.reader='blue';original.lines[0].text='An accidental editor change.';request.entries[1].name='renamed.json';
 await entered.promise;
 assert.equal(created.length,1);assert.equal(queue.list().find(batch=>batch.id===first.id).items[0].status,'running');
 assert.equal(queue.list().find(batch=>batch.id===second.id).items[0].status,'queued');
 // Callers cannot mutate the internal job through a returned progress snapshot.
 first.items[1].name='changed through public response';
 release.resolve();await queue.whenIdle();
 assert.equal(maxActive,1);
 assert.deepEqual(events,['start:job-1','end:job-1','start:job-2','end:job-2','start:job-3','end:job-3']);
 assert.deepEqual(created[0].script,expected);assert.deepEqual(created[1].script,expected);
 assert.deepEqual(created[0].options,{outputRoot:'/test/output',voice:'recorded'});
 assert.equal(created[2].options.voice,'kokoro');
 const finished=queue.list().find(batch=>batch.id===first.id);
 assert.equal(finished.status,'complete');assert.equal(finished.completed,2);assert.equal(finished.failed,0);assert.equal(finished.cancelled,0);assert.ok(finished.finishedAt);
 assert.deepEqual(finished.items.map(item=>item.filename),['001-scene.mp4','002-scene.mp4']);
 assert.equal(finished.items[1].name,'folder/scene.json');
 assert.equal(finished.items[0].video,'/output/job-1/job-1.mp4');
 assert.ok(finished.items.every(item=>!Object.hasOwn(item,'script')));
});

test('validation, creation, rendering and verification failures stay local to their items',async()=>{
 const titles=new Map(),created=[];
 const queue=createServerBatchQueue({catalog,create:async raw=>{
  created.push(raw.title);
  if(raw.title==='create failure')throw Error('Cannot create job directory');
  const id=`job-${created.length}`;titles.set(id,raw.title);return {id};
 },process:async id=>{if(titles.get(id)==='encode failure')throw Error('Encoder failed');},read:async id=>{
  if(titles.get(id)==='verification failure')return {id,status:'interrupted',error:'Completed video is missing or changed'};
  if(titles.get(id)==='unsafe result')return {...verified(id),video:'https://elsewhere.example/video.mp4'};
  return verified(id);
 }});
 const submitted=queue.submit({entries:[
  {name:'invalid.json',script:script({lines:[]})},
  ...['create failure','encode failure','verification failure','unsafe result','good'].map(title=>({name:title+'.json',script:script({title})}))
 ]});
 await queue.whenIdle();
 const batch=queue.list()[0];assert.equal(batch.id,submitted.id);assert.equal(batch.status,'partial');assert.equal(batch.completed,1);assert.equal(batch.failed,5);
 assert.equal(created.length,5,'invalid scripts never enter production');
 assert.match(batch.items[0].error,/lines/);assert.match(batch.items[1].error,/directory/);assert.match(batch.items[2].error,/Encoder/);assert.match(batch.items[3].error,/missing or changed/);assert.match(batch.items[4].error,/verification/);
 assert.ok(batch.items.slice(0,-1).every(item=>!item.video));assert.equal(batch.items.at(-1).status,'complete');
});

test('bad envelopes reject atomically while invalid script contents are failed items',async()=>{
 let created=0;
 const queue=createServerBatchQueue({catalog,create:async()=>{created++;return {id:'unexpected'};},process:async()=>{},read:async()=>verified('unexpected')});
 for(const request of [null,{},[],{entries:[]},{entries:Array.from({length:101},()=>({name:'x',script:script()}))},{entries:[{name:'x',script:script()}],voice:'other'},{entries:[{name:'x',script:script()},{name:'missing-script'}]},{entries:[{name:'',script:script()}]},{entries:[{name:'x',script:script(),extra:true}]}])assert.throws(()=>queue.submit(request),/Batch|entries|voice/);
 assert.equal(queue.list().length,0);
 const batch=queue.submit({entries:[{name:'null.json',script:null},{name:'array.json',script:[]},{name:'invalid-lock.json',script:script({sourceLock:[]})}]});
 await queue.whenIdle();assert.equal(created,0);assert.equal(batch.status,'failed');assert.equal(batch.failed,3);
});

test('cancel stops queued items after the current render, including a whole queued batch',async()=>{
 const entered=deferred(),release=deferred(),created=[];
 const queue=createServerBatchQueue({catalog,create:async raw=>{const id=`job-${created.length+1}`;created.push(raw.title);return {id};},process:async()=>{entered.resolve();await release.promise;},read:async id=>verified(id)});
 const first=queue.submit({entries:[{name:'one.json',script:script()},{name:'two.json',script:script()}]});
 const second=queue.submit({entries:[{name:'three.json',script:script()}]});
 await entered.promise;
 const cancelled=queue.cancel(first.id);assert.equal(cancelled.status,'running');assert.equal(cancelled.cancelled,1);assert.deepEqual(cancelled.items.map(item=>item.status),['running','cancelled']);
 assert.equal(queue.cancel(second.id).status,'cancelled');assert.throws(()=>queue.cancel('missing'),/Unknown batch/);
 release.resolve();await queue.whenIdle();
 const finished=queue.list().find(batch=>batch.id===first.id);assert.equal(finished.status,'cancelled');assert.equal(finished.completed,1);assert.equal(finished.cancelled,1);assert.equal(created.length,1);
 assert.deepEqual(queue.cancel(first.id),finished,'cancelling a finished batch is harmless');
});

test('batch download names are safe, deterministic and unique for duplicate filenames',async()=>{
 const queue=createServerBatchQueue({catalog,create:async()=>({id:'job'}),process:async()=>{},read:async id=>verified(id)});
 const batch=queue.submit({entries:['../../same.JSON','C:\\folder\\same.json','../.json','skit <one>?.json'].map(name=>({name,script:script()}))});
 await queue.whenIdle();
 assert.deepEqual(batch.items.map(item=>item.filename),['001-same.mp4','002-same.mp4','003-script.mp4','004-skit-one.mp4']);
});

function rawRequest(url,{headers={},body='{}'}={}){
 return new Promise((resolve,reject)=>{
  const req=http.request(url,{method:'POST',headers},res=>{const parts=[];res.on('data',part=>parts.push(part));res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(parts).toString()}));});
  req.on('error',reject);req.end(body);
 });
}

test('desktop batch routes preserve session/origin/Host checks and enforce request limits',async()=>{
 const server=await startServer();
 try{
  const {token}=await (await fetch(server.url+'/api/session')).json();
  const headers={'Content-Type':'application/json','X-Theatre-Token':token};
  const post=(route,body,extra={})=>fetch(server.url+route,{method:'POST',headers:{...headers,...extra},body});
  for(const route of ['/api/batch','/api/batch/cancel']){
   assert.equal((await fetch(server.url+route,{method:'POST',body:'{}'})).status,403);
   assert.equal((await post(route,'{}',{Origin:'https://evil.example'})).status,403);
  }
  assert.equal((await rawRequest(server.url+'/api/batch',{headers:{...headers,Host:'evil.example'}})).status,403);
  assert.equal((await post('/api/batch',JSON.stringify({entries:[]}))).status,400);
  const accepted=JSON.stringify({entries:[{name:'invalid.json',script:{}}]})+' '.repeat(260000);
  assert.equal((await post('/api/batch',accepted)).status,202,'batch accepts a body beyond the ordinary request limit');
  assert.equal((await post('/api/validate',accepted)).status,413);
  assert.equal((await rawRequest(server.url+'/api/validate',{headers:{...headers,'Transfer-Encoding':'chunked'},body:accepted})).status,413);
  assert.equal(BATCH_BODY_LIMIT,32*1024*1024);
  assert.equal((await rawRequest(server.url+'/api/batch',{headers:{...headers,'Content-Length':String(BATCH_BODY_LIMIT+1)}})).status,413);
  const {batches}=await (await fetch(server.url+'/api/batches')).json();assert.equal(batches.length,1);assert.equal(batches[0].status,'failed');
 }finally{await server.close();}
});

test('server owns queue progress, cancel and verified MP4 downloads across independent requests',async()=>{
 const outputRoot=await fs.mkdtemp(path.join(os.tmpdir(),'comic-batch-'));
 const entered=deferred(),release=deferred(),source=Buffer.from('verified fixture video bytes');let nextID=0;
 const server=await startServer({outputRoot,batchJobs:{create:async(raw,{voice})=>{
  const id=`fixture-${++nextID}`,job={id,status:'queued',voice,created:new Date().toISOString()};
  await atomicJSON(path.join(outputRoot,id,'script.json'),raw);await atomicJSON(path.join(outputRoot,id,'job.json'),job);return job;
 },process:async id=>{
  entered.resolve();await release.promise;
  await fs.writeFile(path.join(outputRoot,id,id+'.mp4'),source);
  const job={...verified(id),verification:{sha256:digest(source)}};
  await atomicJSON(path.join(outputRoot,id,'job.json'),job);return job;
 }}});
 try{
  const {token}=await (await fetch(server.url+'/api/session')).json();const headers={'Content-Type':'application/json','X-Theatre-Token':token};
  const raw=script({comics:['book2-005']});
  const response=await fetch(server.url+'/api/batch',{method:'POST',headers,body:JSON.stringify({entries:[{name:'first.json',script:raw},{name:'second.json',script:raw}]})});
  assert.equal(response.status,202);const {batch}=await response.json();await entered.promise;
  const before=(await (await fetch(server.url+'/api/batches')).json()).batches[0];
  assert.equal(before.id,batch.id);assert.deepEqual(before.items.map(item=>item.status),['running','queued']);assert.equal(before.items[0].jobId,'fixture-1');
  const saved=JSON.parse(await fs.readFile(path.join(outputRoot,'fixture-1','script.json'),'utf8'));assert.deepEqual(saved.output,raw.output);assert.deepEqual(saved.characters,raw.characters);assert.equal(saved.lines[0].audio,'takes/original.wav');
  const cancelled=await (await fetch(server.url+'/api/batch/cancel',{method:'POST',headers,body:JSON.stringify({id:batch.id})})).json();assert.equal(cancelled.batch.cancelled,1);assert.equal(cancelled.batch.status,'running');
  release.resolve();
  let finished;
  for(let i=0;i<100;i++){
   finished=(await (await fetch(server.url+'/api/batches')).json()).batches[0];
   if(finished.status!=='running')break;
   await delay(5);
  }
  assert.equal(finished.status,'cancelled');assert.equal(finished.completed,1);assert.equal(nextID,1);
  const result=finished.items[0];assert.equal(result.filename,'001-first.mp4');
  const download=await fetch(server.url+result.video);assert.equal(download.status,200);assert.equal(download.headers.get('content-type'),'video/mp4');assert.deepEqual(Buffer.from(await download.arrayBuffer()),source);
  const range=await fetch(server.url+result.video,{headers:{Range:'bytes=0-7'}});assert.equal(range.status,206);assert.deepEqual(Buffer.from(await range.arrayBuffer()),source.subarray(0,8));
  assert.equal((await fetch(server.url+'/output/fixture-1/other.mp4')).status,404);
  await fs.writeFile(path.join(outputRoot,'fixture-1','fixture-1.mp4'),'changed');
  assert.equal((await fetch(server.url+result.video)).status,404,'changed output is not downloadable');
 }finally{release.resolve();await server.close();await fs.rm(outputRoot,{recursive:true,force:true});}
});

test('desktop example library serves only indexed validated standalone scripts',async()=>{
 const server=await startServer();
 try{
  const index=await (await fetch(server.url+'/api/examples')).json();
  assert.deepEqual(await (await fetch(server.url+'/examples/index.json')).json(),index);
  assert.ok(index.examples.filter(example=>example.group==='pages').length>=25);
  assert.ok(index.examples.some(example=>example.group==='tours'));
  const example=index.examples[0],response=await fetch(server.url+'/'+example.path);
  assert.equal(response.status,200);assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),await fs.readFile(path.join(ROOT,'examples',example.name)));
  for(const name of ['README.md','pages-001-025.batch.json','missing.json','%2e%2e%2fpackage.json'])assert.equal((await fetch(server.url+'/examples/'+name)).status,404,name);
 }finally{await server.close();}
});
