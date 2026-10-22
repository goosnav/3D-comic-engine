import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadCatalog,ROOT} from '../src/library.mjs';

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
