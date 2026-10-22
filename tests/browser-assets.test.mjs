import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadCatalog,ROOT} from '../src/library.mjs';
import {resolveScript} from '../src/contracts.mjs';

const reading=(catalog,options={})=>resolveScript({template:'book-duet',title:'Scoped assets',seed:12,comics:['book2-020'],lines:[{speaker:'reader',text:'A comment.',comic:'book2-020'}],endCard:{enabled:false},...options},catalog);
async function snapshotFor(catalog,options={}){
 const {verifyAssetCatalog}=await import('../browser/assets.mjs');const fetched=[],progress=[];
 const snapshot=await verifyAssetCatalog(catalog,{baseURL:'https://local.test/',fetchImpl:async url=>{fetched.push(new URL(url).pathname.slice(1));return new Response(await fs.readFile(ROOT+new URL(url).pathname));},onProgress:(message,detail)=>progress.push({message,...detail}),...options});
 return {snapshot,fetched,progress};
}

test('script snapshot fetches only its two actors, book and selected JPEG, preserving all other metadata',async()=>{
 const catalog=await loadCatalog(),before=structuredClone(catalog);
 const {snapshot,fetched,progress}=await snapshotFor(catalog,{script:reading(catalog)});
 try{
  assert.deepEqual(fetched.sort(),['assets/actor-blue.glb','assets/actor-rust.glb','assets/book.glb','assets/comics/book2-020.jpg'].sort());
  assert.deepEqual(catalog,before);assert.equal(snapshot.catalog.comics.length,catalog.comics.length);
  assert.equal(snapshot.catalog.assets.environment.path,catalog.assets.environment.path);
  assert.equal(snapshot.catalog.comics.find(c=>c.id==='book2-036').path,'assets/comics/book2-036.jpg');
  assert.match(snapshot.catalog.comics.find(c=>c.id==='book2-020').path,/^blob:/);
  assert.equal(progress.at(-1).progress,1);
  assert.ok(progress.every(p=>p.phase==='assets'&&p.message.includes('assets/')));
  assert.deepEqual(progress.map(p=>p.progress),[1/4,2/4,3/4,1]);
 }finally{snapshot.dispose();}
});

test('solo repeated variant deduplicates actor and enabled endcard adds only video/fonts',async()=>{
 const catalog=await loadCatalog();
 const {snapshot,fetched}=await snapshotFor(catalog,{script:reading(catalog,{characters:{reader:'olive-beady',friend:'olive-beady'},endCard:{enabled:true}})});
 try{assert.deepEqual(fetched.sort(),['assets/actor-olive-beady.glb','assets/book.glb','assets/comics/book2-020.jpg','assets/book2-item-browser.mp4','assets/fonts/LiberationSerif-Regular.ttf','assets/fonts/LiberationSans-Bold.ttf'].sort());
  assert.equal(snapshot.catalog.assets.endCardVideo.path,snapshot.catalog.assets.endCardVideoBrowser.path);
 }finally{snapshot.dispose();}
});

test('unselected invalid paths and stale script locks fail before any fetch',async()=>{
 const {verifyAssetCatalog}=await import('../browser/assets.mjs');const catalog=await loadCatalog(),script=reading(catalog);let calls=0;
 const options={script,baseURL:'https://local.test/',fetchImpl:async()=>{calls++;throw Error('unexpected fetch');}};
 catalog.assets.environment.path='assets/%2e%2e/private';
 await assert.rejects(verifyAssetCatalog(catalog,options),/path/i);assert.equal(calls,0);
 catalog.assets.environment.path='assets/library.glb';script.sourceLock[0].sha256='wrong';
 await assert.rejects(verifyAssetCatalog(catalog,options),/lock/i);assert.equal(calls,0);
});

test('scoped snapshot still rejects a valid JPEG mapped to the wrong book page',async()=>{
 const catalog=await loadCatalog();catalog.comics.find(c=>c.id==='book2-020').pdfPage=40;
 await assert.rejects(snapshotFor(catalog,{script:reading(catalog)}),/embedded book page/i);
});

test('browser snapshot verifies actual book/page bytes and revokes its owned URLs',async()=>{
 const {verifyAssetCatalog}=await import('../browser/assets.mjs');
 const catalog=await loadCatalog();
 const fetchImpl=async url=>new Response(await fs.readFile(ROOT+new URL(url).pathname));
 const snapshot=await verifyAssetCatalog(catalog,{baseURL:'https://local.test/',fetchImpl});
 assert.match(snapshot.catalog.assets.book.path,/^blob:/);
 assert.equal(catalog.assets.book.path,'assets/book.glb');
 assert.ok((await fetch(snapshot.catalog.assets.book.path)).ok);
 snapshot.dispose();await assert.rejects(fetch(snapshot.catalog.assets.book.path));
});
test('browser source checker rejects changed pages and cross-origin paths',async()=>{
 const {verifyAssetCatalog}=await import('../browser/assets.mjs');
 const catalog=await loadCatalog();
 await assert.rejects(verifyAssetCatalog(catalog,{baseURL:'https://local.test/',fetchImpl:async()=>new Response('bad bytes')}),/hash/i);
 catalog.assets.book.path='https://elsewhere.test/book.glb';
 await assert.rejects(verifyAssetCatalog(catalog,{baseURL:'https://local.test/',fetchImpl:async()=>{throw Error('must validate paths first');}}),/path|origin/i);
});
