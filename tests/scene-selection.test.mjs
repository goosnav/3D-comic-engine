import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveScript, selectScript} from '../src/contracts.mjs';

const legacy = ['library','fireside'];
const extra = ['basement','diner','moon-base','tv-studio'];
const catalog = () => ({
  edition:{pdfSha256:'a'},
  scenes:[...legacy.map(id=>({id})),...extra.map(id=>({id,default:false}))],
  variants:[{id:'blue'},{id:'rust'},{id:'astronaut',allowedScenes:['moon-base','tv-studio']}],
  templates:[
    {id:'duet',minComics:1,maxComics:1,speakers:['reader','friend'],scenes:[...legacy,...extra]},
    {id:'solo',minComics:1,maxComics:1,speakers:['reader'],scenes:[...legacy,...extra]},
  ],
  comics:[{id:'p1',pdfPage:5,sha256:'b',verified:true}],
});
const input = (more={}) => ({template:'duet',title:'Test',seed:41,comics:['p1'],lines:[{speaker:'reader',text:'Hi'}],...more});

test('expanded optional scenes preserve exact old seed choices in resolve and selection', () => {
  // Literal results sampled before scene-routing changes, with the two old scenes.
  for (const [seed,scene] of [[0,'library'],[1,'library'],[41,'library'],[42,'library'],[1000,'fireside'],[12345,'library'],[99999,'fireside'],[2147483647,'fireside'],[4294967295,'library']]) {
    assert.equal(resolveScript(input({seed}),catalog()).scene,scene);
    assert.equal(selectScript('duet',seed,catalog()).scene,scene);
  }
  const c = catalog(); delete c.scenes;
  c.templates.forEach(t=>{t.scenes=[...legacy];});
  assert.equal(resolveScript(input({seed:1000}),c).scene,'fireside','legacy catalogs need no scene metadata');
});

test('default:false affects automatic choice only; explicit compatible scenes remain valid', () => {
  for (const scene of extra) assert.equal(resolveScript(input({scene}),catalog()).scene,scene);
  const c = catalog(); c.scenes.find(s=>s.id==='library').default=false;
  assert.equal(resolveScript(input(),c).scene,'fireside');
});

test('astronaut automatically selects only compatible template scenes, deterministically', () => {
  for (const role of ['reader','friend']) for (const [seed,want] of [[41,'moon-base'],[1000,'tv-studio']]) {
    const raw = input({seed,characters:{[role]:'astronaut'}});
    const result = resolveScript(raw,catalog());
    assert.equal(result.scene,want);
    assert.deepEqual(resolveScript(result,catalog()),result);
  }
  const c = catalog(); c.templates[0].scenes=['library','tv-studio'];
  assert.equal(resolveScript(input({characters:{reader:'astronaut'}}),c).scene,'tv-studio');
});

test('explicit incompatible scene identifies actor, variant, and compatible alternatives', () => {
  assert.throws(()=>resolveScript(input({scene:'library',characters:{reader:'astronaut'}}),catalog()), error =>
    /reader/.test(error.message) && /astronaut/.test(error.message) && /library/.test(error.message) && /moon-base/.test(error.message) && /tv-studio/.test(error.message));
  assert.throws(()=>resolveScript(input({scene:'unknown',characters:{reader:'astronaut'}}),catalog()),/scene/);
});

test('active cast restrictions intersect and empty intersections fail descriptively', () => {
  const c = catalog(); c.variants.push({id:'presenter',allowedScenes:['tv-studio']});
  const raw = input({characters:{reader:'astronaut',friend:'presenter'}});
  assert.equal(resolveScript(raw,c).scene,'tv-studio');
  c.variants.at(-1).allowedScenes=['diner'];
  assert.throws(()=>resolveScript(raw,c),/compatible.*scene|scene.*compatible/i);
  c.variants.at(-1).allowedScenes=[];
  assert.throws(()=>resolveScript(raw,c),/compatible.*scene|scene.*compatible/i);
});

test('inactive saved cast preferences do not constrain solo scenes', () => {
  assert.equal(resolveScript(input({template:'solo',scene:'library',characters:{friend:'astronaut'}}),catalog()).scene,'library');
  assert.equal(resolveScript(input({template:'solo',characters:{friend:'astronaut'}}),catalog()).scene,'library');
});

test('compatible defaults are preferred; an unrestricted cast cannot auto-select opt-in-only scenes', () => {
  const c = catalog(); c.variants[0].allowedScenes=['fireside','moon-base'];
  assert.equal(resolveScript(input(),c).scene,'fireside');
  delete c.variants[0].allowedScenes;
  c.templates[0].scenes=[...extra];
  assert.throws(()=>resolveScript(input(),c),/default.*scene|scene.*explicit/i);
  assert.equal(resolveScript(input({scene:'diner'}),c).scene,'diner');
});
