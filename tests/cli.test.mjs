import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {ROOT} from '../src/library.mjs';
import {createJob, readJob} from '../src/jobs.mjs';
import {run} from '../src/process.mjs';

function cli(args, cwd=ROOT) {
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[path.join(ROOT,'bin/theatre.mjs'),...args],{cwd});
  let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
  child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));
 });
}
const script={template:'fireside-reader',title:'CLI fixture',comics:['book2-020'],seed:4,output:{width:128,height:128,fps:12},endCard:{enabled:false},lines:[{speaker:'reader',text:'Hello.',audio:'take.wav',pause:0}]};

test('CLI JSON reports usage errors with exit 2 and no stdout diagnostics',async()=>{
 for(const args of [['render','--wat','--json'],['render','--voice','bad','--json'],['render','--json'],['status','--output-dir','--json']]){
  const result=await cli(args);assert.equal(result.code,2,result.stderr);
  assert.equal(JSON.parse(result.stdout).ok,false);assert.match(result.stderr,/Error:/);
 }
});

test('CLI status and selection emit one JSON value from any working directory',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'theatre-cli-'));
 try{
  const selected=await cli(['select','fireside-reader','--seed','2','--json'],root);
  assert.equal(selected.code,0,selected.stderr);assert.equal(JSON.parse(selected.stdout).template,'fireside-reader');
  const status=await cli(['status','--output-dir',path.join(root,'films'),'--json'],root);
  assert.equal(status.code,0,status.stderr);assert.deepEqual(JSON.parse(status.stdout),[]);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('new jobs default to Flite and reject unknown engines before creating output',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'theatre-cli-jobs-'));
 try{
  await assert.rejects(createJob(script,{outputRoot:root,voice:'bogus'}),/voice/i);
  assert.deepEqual(await fs.readdir(root),[]);
  const job=await createJob(script,{outputRoot:root});assert.equal(job.voice,'flite');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('batch bounds reject oversized manifests before creating jobs',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'theatre-cli-bound-'));
 try{
  await fs.writeFile(path.join(root,'batch.json'),JSON.stringify(Array.from({length:101},()=>({input:'good.json'}))));
  const result=await cli(['batch','batch.json','--json','--output-dir','films'],root);
  assert.equal(result.code,2,result.stderr);assert.match(JSON.parse(result.stdout).error,/100/);
  await assert.rejects(fs.stat(path.join(root,'films')), {code:'ENOENT'});
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('invalid JSON and non-object preview inputs return input errors without creating jobs',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'theatre-cli-invalid-'));
 try{
  for(const contents of ['{broken','null','[]']){
   await fs.writeFile(path.join(root,'invalid.json'),contents);
   const result=await cli(['render','invalid.json','--preview','--json','--output-dir','films'],root);
   assert.equal(result.code,2,result.stderr);assert.equal(JSON.parse(result.stdout).ok,false);
   await assert.rejects(fs.stat(path.join(root,'films')),{code:'ENOENT'});
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('mixed batch uses real sequential jobs, continues failures, confines output and keeps stdout JSON',{timeout:180000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'theatre-cli-batch-'));
 try{
  await run(process.env.FFMPEG??'ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','sine=frequency=330:duration=0.1',path.join(root,'take.wav')]);
  await fs.writeFile(path.join(root,'good.json'),JSON.stringify(script));
  await fs.writeFile(path.join(root,'speech.json'),JSON.stringify({...script,lines:[{speaker:'reader',text:'Hello.',pause:0}]}));
  await fs.writeFile(path.join(root,'bad.json'),'{}');
  await fs.writeFile(path.join(root,'missing-take.json'),JSON.stringify({...script,lines:[{...script.lines[0],audio:'missing.wav'}]}));
  await fs.writeFile(path.join(root,'batch.json'),JSON.stringify([{input:'bad.json'},{input:'good.json',voice:'recorded'},{input:'missing-take.json',voice:'recorded'},{input:'speech.json'}]));
  const result=await cli(['batch','batch.json','--output-dir','films','--json'],root);
  assert.equal(result.code,1,result.stderr);const report=JSON.parse(result.stdout);
  assert.equal(report.ok,false);assert.equal(report.succeeded,2);assert.equal(report.failed,2);
  assert.deepEqual(report.results.map(r=>r.status),['failed','complete','failed','complete']);
  assert.match(result.stderr,/Preparing measured voice takes/);
  assert.equal((await readJob(report.results[2].id,path.join(root,'films'))).status,'failed','production failure preserves its job receipt');
  const a=report.results[1].job,b=report.results[3].job;
  assert.equal(b.voice,'flite');
  assert.ok(b.created>=a.updated,'next job starts after previous completion');
  for(const job of [a,b]){
   assert.equal((await readJob(job.id,path.join(root,'films'))).status,'complete');
   assert.equal(path.dirname(path.dirname(job.verification.path)),path.join(root,'films'));
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
