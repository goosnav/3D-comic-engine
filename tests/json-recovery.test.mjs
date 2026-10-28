import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveScript, repairScript} from '../src/contracts.mjs';
import {captionDefaults, captionCenter} from '../src/caption-defaults.mjs';
import {correctionNote} from '../src/script-normalization.mjs';
import {appendGeneratorNotes} from '../web/generator-notes.mjs';

const lock={id:'book2-004',sha256:'12dc83722817385d06f1ef1795695665963fc11aa71879444060e6b12041276e',pdfPage:8,pdfSha256:'0b9edc67fc3ba74f8ec257d1c2cc86b35c5e7b1fa894f0395b622cc3125bb3a5'};
const catalog={edition:{pdfSha256:lock.pdfSha256},variants:[{id:'glasses'},{id:'cowboy-beady'}],templates:[{id:'book-duet',minComics:1,maxComics:1,speakers:['reader','friend'],scenes:['tv-studio']}],comics:[{id:lock.id,sha256:lock.sha256,pdfPage:lock.pdfPage,verified:true}]};
const input=()=>({version:1,template:'book-duet',title:'Policy Violation',seed:2026102604,scene:'tv-studio',comics:[lock.id],sourceLock:[{...lock}],characters:{reader:'glasses',friend:'cowboy-beady'},captions:{enabled:true,position:'bottom'},lines:[{action:'open',seconds:1.2,shot:'book'},{speaker:'reader',text:'So this guy saw a sign and put his foot in his mouth?',emotion:'concerned',gesture:'page_glance',shot:'source'},{speaker:'friend',text:'What a stupid comic.',gesture:'concerned',shot:'medium',pause:.35},{action:'slam',seconds:.65}],endCard:{enabled:false}});
const resolve=(line,extra={})=>resolveScript({...input(),lines:[{speaker:'reader',text:'Unchanged words.',...line}],...extra},catalog);

test('reported lines[2] failure preserves intended emotion, dialogue and source identity',()=>{
 const raw=input(),before=structuredClone(raw),result=resolveScript(raw,catalog);
 assert.equal(result.lines[2].emotion,'concerned');assert.equal(result.lines[2].gesture,'none');
 assert.deepEqual(result.lines.filter(l=>l.text).map(l=>l.text),raw.lines.filter(l=>l.text).map(l=>l.text));
 assert.deepEqual(result.sourceLock,raw.sourceLock);assert.deepEqual(raw,before);
 assert.equal(result.warnings.length,2);assert.match(correctionNote(result),/lines\[2\]\.gesture: "concerned" -> "none"/);
 assert.deepEqual(resolveScript(result,catalog),result);
});
test('normalization is repeatable and warnings survive editor, validation and reload',()=>{
 const first=repairScript(input()),second=repairScript(JSON.parse(JSON.stringify(first)));
 assert.deepEqual(first,second);assert.deepEqual(resolveScript(second,catalog).warnings,first.warnings);
 assert.equal(new Set(second.warnings).size,second.warnings.length);
});
test('valid explicit emotion wins, misplaced values swap without losing intent',()=>{
 assert.equal(resolve({emotion:'angry',gesture:'concerned'}).lines[0].emotion,'angry');
 const swap=resolve({emotion:'head_tilt',gesture:'concerned'}).lines[0];
 assert.equal(swap.emotion,'concerned');assert.equal(swap.gesture,'head_tilt');
});
test('common aliases and spelling variants resolve deterministically',()=>{
 const line=resolve({emotion:' HAPPY ',gesture:'Head-Tilt',shot:'closeup',gaze:{reader:'look_at_book'}}).lines[0];
 assert.equal(line.emotion,'pleased');assert.equal(line.gesture,'head_tilt');assert.equal(line.shot,'close-up');assert.equal(line.gaze.reader,'book');
});
test('unknown optional enums fall back in dialogue and nested listener reactions',()=>{
 const result=resolve({emotion:'smuggg',gesture:'teleport',shot:'wrong',gaze:{reader:'wall'},reaction:{actor:'friend',emotion:'nope',gesture:'what',at:'later',gaze:'nowhere',duration:'many'}});
 const line=result.lines[0];assert.equal(line.emotion,'neutral');assert.equal(line.gesture,'none');assert.equal(line.shot,'auto');assert.equal(line.gaze.reader,'auto');
 assert.equal(line.reaction.emotion,'neutral');assert.equal(line.reaction.gesture,'none');assert.equal(line.reaction.at,'line_start');assert.equal(line.reaction.duration,.8);assert.equal(line.reaction.gaze,'auto');
 assert.ok(result.warnings.length>=9);
});
test('face and timing values are clamped or defaulted, with one audit per change',()=>{
 const line=resolve({face:{eye_open:'4',brow_left:-8,mouth_curve:'bad',blink:'sometimes'},pause:'99',reaction:{actor:'friend',duration:-1,face:{eye_open:null}}}).lines[0];
 assert.deepEqual(line.face,{eye_open:1,brow_left:-1,blink:'auto'});assert.equal(line.pause,5);
 assert.equal(line.reaction.duration,.1);assert.deepEqual(line.reaction.face,{});
});
test('invalid optional objects recover instead of crashing',()=>{
 const result=resolve({face:[],reaction:'surprised',gaze:'book'},{captions:false,grade:'bright',dither:'extreme'});
 assert.deepEqual(result.lines[0].face,{});assert.deepEqual(result.lines[0].gaze,{});assert.equal(result.lines[0].reaction,undefined);
 assert.deepEqual(result.captions,captionDefaults());assert.equal(result.grade,'muted');assert.equal(result.dither,'subtle');
});
test('omitted caption settings default to top quarter, primary yellow and forest green',()=>{
 const raw=input();delete raw.captions;const result=resolveScript(raw,catalog);
 assert.equal(result.captions.position,'top');assert.deepEqual(result.captions.colors,{reader:'#FFFF00',friend:'#228B22'});
 assert.equal(captionCenter(1920),240);
 for(const [width,height] of [[1080,1920],[1080,1350],[1920,1080],[1080,1080]]){
  const size=Math.min(width*.078,height*.075),halfBlock=(.575+.5+.09)*size;
  assert.ok(captionCenter(height)-halfBlock>=0);assert.ok(captionCenter(height)+halfBlock<=height*.25);
 }
});
test('explicit bottom and custom colors are not overwritten',()=>{
 const result=resolve({},{captions:{position:'bottom',colors:{reader:'#123456',friend:'#abcdef'}}});
 assert.equal(result.captions.position,'bottom');assert.deepEqual(result.captions.colors,{reader:'#123456',friend:'#abcdef'});
 assert.equal(captionCenter(1000,'bottom'),875);
});
test('invalid caption fields and shorthand colors recover with audit notes',()=>{
 const result=resolve({},{captions:{enabled:'true',position:'middle',colors:{reader:'#ff0',friend:'lime'}},endCard:{enabled:'false',seconds:0}});
 assert.deepEqual(result.captions,{enabled:true,position:'top',colors:{reader:'#FFFF00',friend:'#228B22'}});
 assert.equal(result.endCard.enabled,false);assert.equal(result.endCard.seconds,1);
 assert.ok(result.warnings.some(w=>w.startsWith('captions.position:')));
});
test('held book replaces conflicting arm gestures, including listener gestures',()=>{
 const result=resolveScript({...input(),lines:[{action:'hold'},{speaker:'reader',text:'Hi',gesture:'arm_flail'},{speaker:'friend',text:'Hello',reaction:{actor:'reader',gesture:'shrug'}}]},catalog);
 assert.equal(result.lines[1].gesture,'none');assert.equal(result.lines[2].reaction.gesture,'none');assert.equal(result.warnings.length,2);
});
test('strict mode remains available for contract auditing',()=>{
 assert.throws(()=>resolveScript(input(),catalog,{repair:false}),/gesture/);
 assert.throws(()=>resolveScript({...input(),lines:[{speaker:'reader',text:'Hi',emotion:'happy'}]},catalog,{repair:false}),/emotion/);
});
test('source identity, actors, text, actions and book transitions are never guessed',()=>{
 for(const extra of [{sourceLock:[{...lock,sha256:'wrong'}]},{comics:['unknown']},{lines:[{speaker:'ghost',text:'Hi'}]},{lines:[{speaker:'reader',text:''}]},{lines:[{action:'unknown'}]},{lines:[{action:'place'},{speaker:'reader',text:'Hi'}]},{lines:[{action:'close'},{speaker:'reader',text:'Hi'}]},{output:{width:129}},{template:'unknown'}]){
  assert.throws(()=>resolveScript({...input(),...extra},catalog));
 }
 assert.throws(()=>resolve({face:{jaw:9}}),/face/);
 assert.throws(()=>resolve({gaze:{ghost:'book'}}),/gaze/);
 assert.throws(()=>resolve({reaction:{actor:'reader'}}),/different/);
});
test('valid scripts add no correction warnings and defaults are independently copied',()=>{
 const a=resolve({}),b=resolve({});assert.equal(a.warnings,undefined);
 a.captions.colors.reader='#000000';assert.equal(b.captions.colors.reader,'#FFFF00');
 assert.equal(correctionNote(b),'');
});
test('generator notes use text nodes, not injectable HTML',()=>{
 const previous=globalThis.document;
 const make=tag=>({tag,children:[],style:{},append(...children){this.children.push(...children);}});
 globalThis.document={createElement:make};
 try{
  const box=make('div');appendGeneratorNotes(box,{warnings:['<img src=x onerror=alert(1)>']});
  assert.equal(box.children.length,1);const details=box.children[0];assert.equal(details.open,true);
  assert.match(details.children[1].textContent,/<img/);assert.equal(details.children[1].innerHTML,undefined);
  const clean=make('div');appendGeneratorNotes(clean,{exitNote:'No automatic JSON corrections.',warnings:[]});assert.equal(clean.children.length,1);
 }finally{globalThis.document=previous;}
});
