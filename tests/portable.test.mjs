import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {loadCatalog} from '../src/library.mjs';
import {resolveScript,selectScript} from '../src/contracts.mjs';

test('shared contracts bundle for a browser without Node polyfills',async()=>{
 const result=await build({entryPoints:['src/contracts.mjs'],bundle:true,platform:'browser',write:false,format:'esm',logLevel:'silent'});
 assert.ok(result.outputFiles[0].contents.length>100);
 const c=await loadCatalog(),s=selectScript('book-duet',7,c);delete s.seed;
 const resolved=resolveScript(s,c);assert.ok(Number.isInteger(resolved.seed));
 assert.deepEqual(resolveScript(resolved,c),resolved);
});
