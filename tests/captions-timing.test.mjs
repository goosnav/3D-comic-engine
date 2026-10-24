import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {speechBounds,captionCues} from '../src/speech-timing.mjs';
import {resolveScript,SHOTS} from '../src/contracts.mjs';
import {compileTimeline} from '../src/timeline.mjs';
const catalog=JSON.parse(await readFile(new URL('../assets/catalog.json',import.meta.url)));
const raw={template:'book-duet',title:'Captions',comics:['book2-020'],seed:1,endCard:{enabled:false},lines:[{speaker:'reader',text:'These are the first five words and here are another five.'},{speaker:'friend',text:'Yes indeed.'}]};
test('speech trims edge silence but preserves a consonant margin and internal pauses',()=>{
 const samples=new Float32Array(1000);samples[200]=.1;samples[800]=.5;
 assert.deepEqual(speechBounds(samples,1000),[175,826]);
 assert.deepEqual(speechBounds(new Float32Array(100),1000),[0,100]);
});
test('captions cover all words in two-to-five-word phrases with ordered energy timing',()=>{
 for(let n=1;n<=200;n++){
  const text=Array.from({length:n},(_,i)=>`word${i}`).join(' '),cues=captionCues(text,{duration:3,mouth:[{t:0,value:0},{t:.5,value:.6},{t:2.5,value:0}]});
  assert.equal(cues.map(c=>c.text).join(' '),text);assert.equal(cues[0].start,0);assert.equal(cues.at(-1).end,3);
  cues.forEach((c,i)=>{assert.ok(c.end>c.start);assert.ok(c.text.split(' ').length<=5);if(n>1)assert.ok(c.text.split(' ').length>=2);if(i)assert.equal(c.start,cues[i-1].end);});
 }
});
test('caption controls validate, persist through timeline, and speech has no default gap',()=>{
 const script=resolveScript(raw,catalog),timeline=compileTimeline(script,{'beat-0':{duration:2},'beat-1':{duration:1}});
 assert.equal(timeline.duration,3);assert.ok(!timeline.events.some(e=>e.type==='hold'));
 assert.deepEqual(timeline.captions,script.captions);assert.equal(timeline.events.find(e=>e.id==='beat-1').start,2);
 assert.deepEqual(resolveScript(script,catalog),script);
 for(const captions of [null,{enabled:1},{position:'middle'},{colors:{reader:'red'}},{colors:{reader:'#abc'}},{colors:{ghost:'#ffffff'}},{unknown:true}])assert.throws(()=>resolveScript({...raw,captions},catalog));
 for(const shot of SHOTS)assert.doesNotThrow(()=>resolveScript({...raw,lines:raw.lines.map(l=>({...l,shot}))},catalog));
 const disabled=resolveScript({...raw,captions:{enabled:false,position:'top',colors:{reader:'#123456'}}},catalog);
 assert.equal(disabled.captions.colors.friend,'#6ee7ff');assert.equal(disabled.captions.enabled,false);
});
