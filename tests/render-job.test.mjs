import test from 'node:test';import assert from 'node:assert/strict';
import {makeRenderJob,readRenderJob} from '../src/render-job.mjs';
import {loadCatalog} from '../src/library.mjs';import {selectScript} from '../src/contracts.mjs';
test('portable job round trips resolved script and rejects tampering or asset mismatch',async()=>{const c=await loadCatalog(),s=selectScript('book-duet',42,c),job=await makeRenderJob(s,c);assert.deepEqual((await readRenderJob(job,c)).script,s);const bad=structuredClone(job);bad.payload.script.seed++;await assert.rejects(readRenderJob(bad,c),/integrity/);const changed=structuredClone(c);changed.assets.book.sha256='wrong';await assert.rejects(readRenderJob(job,changed),/matching asset/);await assert.rejects(readRenderJob({...job,version:2},c),/version/);});
