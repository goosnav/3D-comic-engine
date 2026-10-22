import test from 'node:test';
import assert from 'node:assert/strict';
import {writerPacket,acceptDraft,draftScript} from '../src/writer.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {digest} from '../src/library.mjs';
import {loadCatalog} from '../src/library.mjs';
import {selectScript,resolveScript} from '../src/contracts.mjs';
test('optional writer rejects remote providers before making any request',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'theatre-local-writer-'));
 try {
  const configFile=path.join(root,'writer.json');
  await fs.writeFile(configFile,JSON.stringify({endpoint:'https://api.example.com/v1/chat/completions',model:'example',local:true}));
  const c=await loadCatalog();let calls=0;
  await assert.rejects(draftScript(selectScript('book-duet',8,c),c,{configFile,fetchImpl:async()=>{calls++;throw Error('Network should not be used');}}),/loopback|local computer/i);
  assert.equal(calls,0);
 }finally{await fs.rm(root,{recursive:true});}
});
test('writer receives selected exact source and cannot switch comic or template',async()=>{
 const c=await loadCatalog(),s=selectScript('book-duet',8,c),p=writerPacket(s,c);assert.equal(p.sources.length,1);assert.equal(p.sources[0].id,s.comics[0]);assert.deepEqual(p.sources[0].transcript,c.comics.find(c=>c.id===s.comics[0]).transcript);
 assert.throws(()=>acceptDraft({...s,comics:['bad']},s,c),/selection|source/i);
 const proposed={title:'A thought',lines:[{speaker:'reader',text:'That is quite a choice.',comic:s.comics[0]}]};const out=acceptDraft(proposed,s,c);assert.deepEqual(out.sourceLock,s.sourceLock);
});
test('new source pages carry explicit untranscribed status to the optional writer',async()=>{
 const c=await loadCatalog(),s=resolveScript({template:'book-duet',title:'Page one',comics:['book2-001'],lines:[{speaker:'reader',text:'A reading.'}]},c);
 const p=writerPacket(s,c);
 assert.equal(p.sources[0].transcriptStatus,'not-transcribed');
 assert.deepEqual(p.sources[0].transcript,[]);
 assert.equal(p.sources[0].pdfPage,5);
});
test('optional producer attaches exact selected images and repairs invalid JSON once',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'theatre-writer-'));
 try{
  const configFile=path.join(root,'writer.json');await fs.writeFile(configFile,JSON.stringify({endpoint:'http://127.0.0.1:1/unused',model:'test-only',local:true,keyEnv:'THEATRE_TEST_UNUSED_KEY'}));
  const c=await loadCatalog(),selected=selectScript('book-duet',8,c);let calls=0;
  const result=await draftScript(selected,c,{configFile,fetchImpl:async(_url,options)=>{
   calls++;const body=JSON.parse(options.body),content=body.messages[1].content;
   const image=content.find(c=>c.type==='image_url').image_url.url;
   assert.equal(digest(Buffer.from(image.split(',')[1],'base64')),selected.sourceLock[0].sha256);
   return new Response(JSON.stringify({choices:[{message:{content:calls===1?'invalid':JSON.stringify({title:'A second opinion',lines:[{speaker:'reader',text:'An unusual opinion.',comic:selected.comics[0]}]})}}]}),{status:200});
  }});
  assert.equal(calls,2);assert.deepEqual(result.sourceLock,selected.sourceLock);
 }finally{await fs.rm(root,{recursive:true});}
});
