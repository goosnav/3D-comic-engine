import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {ROOT} from '../src/library.mjs';

function execute(command,args,options={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,options);let stdout='',stderr='';
  child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
  child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));
 });
}

test('setup explains prerequisites without loading installed packages',async()=>{
 const result=await execute(process.execPath,[path.join(ROOT,'tools/setup.mjs'),'--help'],{cwd:os.tmpdir()});
 assert.equal(result.code,0,result.stderr);assert.match(result.stdout,/Node.*22/);assert.match(result.stdout,/FFmpeg/i);assert.match(result.stdout,/Chromium/);
});

test('setup reports npm install failure, exits nonzero and does not stamp success',{skip:process.platform==='win32'},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'theatre-setup-failure-'));
 try{
  await fs.mkdir(path.join(root,'tools'));await fs.mkdir(path.join(root,'commands'));
  await fs.copyFile(path.join(ROOT,'tools/setup.mjs'),path.join(root,'tools/setup.mjs'));
  await fs.writeFile(path.join(root,'package.json'),'{}');await fs.writeFile(path.join(root,'package-lock.json'),'{}');
  await fs.writeFile(path.join(root,'commands/npm'),'#!/bin/sh\nif [ "$1" = "--version" ]; then echo 10.0.0; exit 0; fi\necho "fixture install failed" >&2\nexit 17\n',{mode:0o755});
  const result=await execute(process.execPath,[path.join(root,'tools/setup.mjs')],{cwd:os.tmpdir(),env:{...process.env,PATH:path.join(root,'commands')}});
  assert.equal(result.code,1);assert.match(result.stderr,/fixture install failed/);assert.match(result.stderr,/17/);
  await assert.rejects(fs.stat(path.join(root,'.cache/setup.json')),{code:'ENOENT'});
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('failed first-run Chromium download is reported and cannot mark setup complete',{skip:process.platform==='win32'},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'theatre-browser-install-'));
 try{
  for(const directory of ['tools','commands','node_modules/playwright'])await fs.mkdir(path.join(root,directory),{recursive:true});
  await fs.copyFile(path.join(ROOT,'tools/setup.mjs'),path.join(root,'tools/setup.mjs'));
  await fs.writeFile(path.join(root,'package.json'),'{}');await fs.writeFile(path.join(root,'package-lock.json'),'{}');
  for(const command of ['npm','ffmpeg','ffprobe'])await fs.writeFile(path.join(root,'commands',command),'#!/bin/sh\nexit 0\n',{mode:0o755});
  await fs.writeFile(path.join(root,'node_modules/playwright/package.json'),JSON.stringify({type:'module',main:'index.mjs'}));
  await fs.writeFile(path.join(root,'node_modules/playwright/index.mjs'),`export const chromium={executablePath:()=>${JSON.stringify(path.join(root,'missing-chromium'))}};\n`);
  await fs.writeFile(path.join(root,'node_modules/playwright/cli.js'),"console.error('fixture Chromium download failed');process.exit(19);\n");
  const result=await execute(process.execPath,[path.join(root,'tools/setup.mjs')],{env:{...process.env,PATH:path.join(root,'commands'),THEATRE_BROWSER:''}});
  assert.equal(result.code,1);assert.match(result.stderr,/fixture Chromium download failed/);assert.match(result.stderr,/19/);
  await assert.rejects(fs.stat(path.join(root,'.cache/setup.json')),{code:'ENOENT'});
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('POSIX launchers locate checkout with spaces and stop before GUI when setup fails',{skip:process.platform==='win32'},async()=>{
 for(const filename of ['start-linux.sh','start-macos.command']){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'theatre launchers '));
  try{
   await fs.mkdir(path.join(root,'launchers'));await fs.mkdir(path.join(root,'commands'));await fs.mkdir(path.join(root,'tools'));await fs.mkdir(path.join(root,'bin'));
   await fs.copyFile(path.join(ROOT,'launchers',filename),path.join(root,'launchers',filename));
   await fs.writeFile(path.join(root,'commands/node'),`#!${process.execPath}\nrequire('fs').appendFileSync(process.env.CALL_LOG,JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)})+'\\n');process.exit(process.env.SETUP_FAIL&&process.argv[2].endsWith('setup.mjs')?7:0);\n`,{mode:0o755});
   const log=path.join(root,'calls.jsonl'),env={...process.env,PATH:path.join(root,'commands')+path.delimiter+process.env.PATH,CALL_LOG:log};
   const result=await execute('/bin/sh',[path.join(root,'launchers',filename),'--port','0'],{cwd:os.tmpdir(),env});
   assert.equal(result.code,0,result.stderr);
   const calls=(await fs.readFile(log,'utf8')).trim().split('\n').map(JSON.parse);
   assert.equal(calls.length,2);assert.equal(calls[0].cwd,root);assert.match(calls[0].args[0],/tools\/setup.mjs$/);
   assert.deepEqual(calls[1].args.slice(1),['gui','--port','0']);
   await fs.writeFile(log,'');
   const failed=await execute('/bin/sh',[path.join(root,'launchers',filename)],{cwd:os.tmpdir(),env:{...env,SETUP_FAIL:'1'}});
   assert.notEqual(failed.code,0);assert.equal((await fs.readFile(log,'utf8')).trim().split('\n').length,1);
  }finally{await fs.rm(root,{recursive:true,force:true});}
 }
});

test('GUI opens the local URL automatically and serves the GUI',{skip:process.platform!=='linux',timeout:20000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'theatre-opener-'));let child;
 try{
  const opened=path.join(root,'opened.txt');
  await fs.writeFile(path.join(root,'xdg-open'),`#!${process.execPath}\nrequire('fs').writeFileSync(process.env.OPENED_URL,process.argv[2]);\n`,{mode:0o755});
  child=spawn(process.execPath,[path.join(ROOT,'bin/theatre.mjs'),'gui','--port','0','--json'],{env:{...process.env,PATH:root+path.delimiter+process.env.PATH,OPENED_URL:opened}});
  let errors='';child.stderr.on('data',b=>errors+=b);
  const line=await new Promise((resolve,reject)=>{let text='';child.stdout.on('data',b=>{text+=b;if(text.includes('\n'))resolve(text.split('\n')[0]);});child.on('error',reject);child.on('exit',code=>reject(Error(`GUI exited ${code}: ${errors}`)));});
  const {url}=JSON.parse(line);assert.equal((await fetch(url)).status,200);
  let actual;for(let i=0;i<50;i++){try{actual=await fs.readFile(opened,'utf8');break;}catch{await new Promise(r=>setTimeout(r,50));}}
  assert.equal(actual,new URL(url).href);
 }finally{if(child&&!child.killed){child.kill();await new Promise(resolve=>child.once('close',resolve));}await fs.rm(root,{recursive:true,force:true});}
});
