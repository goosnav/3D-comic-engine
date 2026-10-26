import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createActor } from '../src/actor.mjs';
import { emotions, sampleExpression } from '../src/facial-performance.mjs';
import { EMOTIONS, GESTURES, resolveScript } from '../src/contracts.mjs';
const old = ['neutral','thoughtful','curious','skeptical','dry','pleased','concerned','exasperated'];
const added = ['angry','furious','panicked','manic','cosmic_rage','brain_static','overclocked'];
const gestures = ['arm_flail','fist_shake','double_point','despair','windmill','rubber_hose'];
const catalog = { edition: {pdfSha256:'a'}, templates:[{id:'duet',minComics:1,maxComics:1,speakers:['reader','friend'],scenes:['library']}], comics:[{id:'p1',sha256:'b',pdfPage:5,verified:true}] };
const resolve = (lines,options) => resolveScript({template:'duet',title:'Test',comics:['p1'],seed:41,lines},catalog,options);
const event = {type:'line',speaker:'reader',start:1,end:4,face:{blink:'off'},mouth:[{t:0,value:0},{t:.5,value:1},{t:1,value:0}]};
async function actor(variant = 'blue') {
  const b = await readFile(new URL(`../assets/actor-${variant}.glb`, import.meta.url));
  return createActor((await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene,'reader');
}
test('old presets retain exact sampled actor output and bone rotations', async () => {
  const a = await actor(), rows = [];
  for (const emotion of old) for (const gesture of ['none','explain','nod','head_tilt','shrug','page_glance']) for (const time of [1,1.1,1.5,2.7,3.9,4]) {
    a.apply({time,seed:41,line:{...event,emotion,gesture}});
    rows.push([a.diagnostics(),Object.values(a.bones).map(b=>b.quaternion.toArray())]);
  }
  assert.equal(createHash('sha256').update(JSON.stringify(rows)).digest('hex'),'e450a890773f39aa40331511d25066b052c872906a595aefc600844728ab3af8');
  a.apply({time:2,line:event}); const implicit = a.diagnostics();
  a.apply({time:2,line:{...event,emotion:'neutral',gesture:'none'}}); assert.deepEqual(a.diagnostics(),implicit);
});
test('new emotions and gestures resolve through shared contract enums', () => {
  assert.deepEqual(EMOTIONS,Object.keys(emotions));
  for (const emotion of added) {
    assert.ok(EMOTIONS.includes(emotion), emotion);
    assert.notDeepEqual(sampleExpression(emotion),sampleExpression('neutral'));
    const zero = sampleExpression(emotion,{},0);
    assert.ok([...zero.brows,zero.tilt,zero.smile].every(v => v === 0));
    assert.equal(zero.eyeOpen,1);
    for (const gesture of gestures) assert.equal(resolve([{speaker:'reader',text:'Hi',emotion,gesture}]).lines[0].gesture,gesture);
  }
  assert.ok(gestures.every(g => GESTURES.includes(g)));
});
test('reaction gestures cut abruptly at the authored end and then restore the rest pose', async () => {
  const a = await actor();
  const snapshot = () => Object.values(a.bones).flatMap(b=>b.quaternion.toArray());
  for (const gesture of gestures) for (const at of ['line_start','line_end']) {
    const line = {...event,type:at === 'line_end' ? 'hold' : 'line',speaker:'friend',reaction:{actor:'reader',gesture,at,duration:.7}};
    a.apply({time:1.7-1e-6,line,listening:true}); const before = snapshot();
    a.apply({time:1.7+1e-6,line,listening:true});
    assert.ok(snapshot().some((v,i)=>Math.abs(v-before[i])>.01),gesture);
    const after=snapshot();a.apply({time:1.7+1e-6,line:{...line,reaction:undefined},listening:true});assert.deepEqual(snapshot(),after);
  }
});
test('strict auditing rejects held reader arm gestures including listener reactions, but allows friend arms', () => {
  for (const gesture of ['explain','shrug',...gestures]) {
    assert.throws(()=>resolve([{action:'hold'},{speaker:'reader',text:'Hi',gesture}],{repair:false}),/hands|held/);
    assert.throws(()=>resolve([{action:'hold'},{speaker:'friend',text:'Hi',reaction:{actor:'reader',gesture}}],{repair:false}),/hands|held/);
    assert.doesNotThrow(()=>resolve([{action:'hold'},{speaker:'friend',text:'Hi',gesture}]));
  }
});
test('actor suppresses held arms even when validation is bypassed; extreme poses seek exactly and stay silent', async () => {
  for (const variant of ['blue','blue-beady']) {
    const a = await actor(variant);
    const rotations = () => Object.fromEntries(Object.entries(a.bones).map(([k,b])=>[k,b.quaternion.toArray()]));
    for (const gesture of ['explain','shrug','point','offer',...gestures]) {
      for (const reaction of [false,true]) {
        const makeLine = g => reaction ? {...event,speaker:'friend',reaction:{actor:'reader',at:'line_start',duration:2,gesture:g}} : {...event,gesture:g};
        a.apply({time:1.6,line:makeLine('none'),held:.51,listening:reaction}); const baseline = rotations();
        a.apply({time:1.6,line:makeLine(gesture),held:.51,listening:reaction});
        for (const bone of ['upper_armL','forearmL','upper_armR','forearmR']) assert.deepEqual(rotations()[bone],baseline[bone],gesture);
      }
    }
    for (const [i,emotion] of added.entries()) {
      const line = {...event,emotion,gesture:gestures[i%gestures.length],mouth:[]};
      a.apply({time:1.6,line,seed:41}); const first = rotations();
      assert.deepEqual(a.diagnostics().visemes,{open:0,round:0,wide:0});
      a.apply({time:3.9,line,seed:41}); a.apply({time:1.1,line,seed:41}); a.apply({time:1.6,line,seed:41});
      assert.deepEqual(rotations(),first);
      a.apply({time:1.6,line:{...line,gesture:'none'},seed:41});
      if (!['cosmic_rage','brain_static','overclocked'].includes(emotion)) assert.notDeepEqual(rotations().upper_armR,first.upper_armR);
    }
  }
});
