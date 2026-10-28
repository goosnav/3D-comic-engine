import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserBackend} from '../browser/backend.mjs';
const catalog={edition:{pdfSha256:'pdf'},templates:[{id:'book-duet',minComics:1,maxComics:1,speakers:['reader','friend'],scenes:['library']}],comics:[{id:'p1',sha256:'page',pdfPage:5,verified:true}]};
const raw=()=>({template:'book-duet',title:'Recovery',seed:12,comics:['p1'],lines:[{speaker:'friend',text:'Unchanged.',gesture:'concerned'}]});
function runtime(t, fail=false){
 const original={AudioContext:globalThis.AudioContext,MediaRecorder:globalThis.MediaRecorder};
 globalThis.AudioContext=class {state='running';resume(){return Promise.resolve();}async close(){this.state='closed';}};
 globalThis.MediaRecorder=class {static isTypeSupported(type){return type.startsWith('video/mp4;');}};
 const seen=[];
 const api=createBrowserBackend({catalog,canvas:{captureStream(){}},verifyAssets:async catalog=>({catalog,dispose(){}}),loadExporter:async()=>({exportFilm:async({script})=>{
  seen.push(script);if(fail)throw Error('Deliberate encoder failure');
  return {blob:new Blob(['test fixture, not a video'],{type:'video/mp4'}),extension:'mp4',mimeType:'video/mp4'};
 }})});
 t.after(()=>{api.dispose();Object.assign(globalThis,original);});return {api,seen};
}
async function settled(api,route,key){
 for(let i=0;i<100;i++){
  const result=(await api(route))[key];
  if(result.length&&result.every(item=>!['running','queued'].includes(item.status)))return result;
  await new Promise(resolve=>setTimeout(resolve,5));
 }
 throw Error('Mock export did not settle');
}
test('single browser export uses repaired acting and includes completion corrections',async t=>{
 const {api,seen}=runtime(t);const original=raw();
 await api('/api/render',{script:original,voice:'flite'});
 const [job]=await settled(api,'/api/jobs','jobs');assert.equal(job.status,'complete');
 assert.equal(seen[0].lines[0].gesture,'none');assert.equal(seen[0].lines[0].emotion,'concerned');
 assert.equal(seen[0].captions.position,'top');assert.equal(job.warnings.length,2);assert.match(job.exitNote,/Automatic JSON corrections/);
 assert.equal(original.lines[0].gesture,'concerned');
});
test('validation before generation does not lose or duplicate correction history',async t=>{
 const {api}=runtime(t);const validated=await api('/api/validate',{script:raw()});
 await api('/api/render',{script:validated.script,voice:'flite'});
 const [job]=await settled(api,'/api/jobs','jobs');assert.deepEqual(job.warnings,validated.script.warnings);
 assert.match(job.exitNote,/gesture: "concerned" -> "none"/);
});
test('batch entries carry independent corrections through completion',async t=>{
 const {api,seen}=runtime(t),clean=raw();clean.lines[0].gesture='nod';clean.captions={position:'bottom',colors:{friend:'#123456'}};
 await api('/api/batch',{entries:[{name:'bad-gesture.json',script:raw()},{name:'clean.json',script:clean}],voice:'flite'});
 const [batch]=await settled(api,'/api/batches','batches');assert.equal(batch.status,'complete');assert.equal(batch.completed,2);
 assert.equal(batch.items[0].warnings.length,2);assert.match(batch.items[0].exitNote,/Automatic JSON corrections/);
 assert.deepEqual(batch.items[1].warnings,[]);assert.equal(batch.items[1].exitNote,'No automatic JSON corrections.');
 assert.equal(seen[1].captions.position,'bottom');assert.equal(seen[1].captions.colors.friend,'#123456');
});
test('real production failures still fail and keep diagnostic corrections',async t=>{
 const {api}=runtime(t,true);await api('/api/render',{script:raw(),voice:'flite'});
 const [job]=await settled(api,'/api/jobs','jobs');assert.equal(job.status,'failed');assert.match(job.error,/encoder failure/);assert.equal(job.warnings.length,2);assert.equal(job.video,undefined);
});
