import test from 'node:test';
import assert from 'node:assert/strict';

// Dynamic loading makes a missing public API an explicit red assertion.
const module = await import('../src/gesture-performance.mjs').catch(() => ({}));
const ids = ['arm_flail', 'fist_shake', 'double_point', 'despair', 'windmill', 'rubber_hose'];
const values = pose => Object.values(pose).flat();
test('public sampler returns bounded, seeded, rest-relative offsets without frame history', () => {
  assert.equal(typeof module.sampleGesture, 'function');
  const { sampleGesture } = module;
  for (const gesture of ids) {
    const opts = { gesture, time: 1, start: 0, duration: 3, seed: 41 };
    const first = sampleGesture(opts);
    assert.deepEqual(Object.keys(first), ['upper_armL', 'forearmL', 'upper_armR', 'forearmR', 'chest', 'head']);
    assert.ok(values(first).some(v => Math.abs(v) > .1));
    assert.notDeepEqual(first, sampleGesture({ ...opts, seed: 42 }));
    for (const time of [2.9, 2, .1, 0, -1, 3, 4]) sampleGesture({ ...opts, time });
    assert.deepEqual(sampleGesture(opts), first);
    for (const time of [-1, 0, 3, 4]) assert.ok(values(sampleGesture({ ...opts, time })).every(v => v === 0));
    for (const time of [1e-6, 3 - 1e-6]) assert.ok(values(sampleGesture({ ...opts, time })).every(v => Math.abs(v) < 1e-8));
    for (const amplitude of [-1, 0, 1, 2, 100, NaN, Infinity]) {
      for (const time of [NaN, Infinity, -Infinity, 1e308, .3, 1.7]) {
        const pose = sampleGesture({ ...opts, time, amplitude });
        for (const [bone, xyz] of Object.entries(pose)) assert.ok(xyz.every(v => Number.isFinite(v) && Math.abs(v) <= (['head', 'chest'].includes(bone) ? .5 : 2.6)));
      }
    }
    assert.ok(values(sampleGesture({ ...opts, amplitude: 0 })).every(v => v === 0));
    const half = values(sampleGesture({ ...opts, amplitude: .5 }));
    assert.deepEqual(half, values(first).map(v => v * .5));
    for (const field of ['start', 'duration', 'attack', 'release', 'seed']) {
      for (const value of [NaN, Infinity, -Infinity, 0, -1, 1e308]) assert.ok(values(sampleGesture({ ...opts, [field]: value })).every(Number.isFinite));
    }
  }
  assert.ok(values(sampleGesture({ gesture: 'unknown', time: 1, duration: 3 })).every(v => v === 0));
});
test('custom attack/release scale the pose and authored lateral arm signs oppose each other', () => {
  assert.equal(typeof module.sampleGesture, 'function');
  const { sampleGesture } = module;
  const opts = {gesture:'double_point',time:.18,duration:3,seed:41};
  const full = sampleGesture(opts), half = sampleGesture({...opts,attack:.36});
  values(half).forEach((v,i)=>assert.ok(Math.abs(v-values(full)[i]*.5)<1e-12));
  assert.ok(full.upper_armL[2] > 0 && full.upper_armR[2] < 0);
  const release = sampleGesture({...opts,time:2.88});
  const longRelease = sampleGesture({...opts,time:2.88,release:.48});
  values(longRelease).forEach((v,i)=>assert.ok(Math.abs(v-values(release)[i]*.3125)<1e-12));
  const samples = [0,.1,1,2,2.9,3].map(time=>sampleGesture({...opts,time}));
  assert.deepEqual([3,2.9,2,1,.1,0].map(time=>sampleGesture({...opts,time})).reverse(),samples);
});


test('chaotic gestures step sharply and head controls remain independent of held arms',()=>{
 const opts={gesture:'arm_flail',start:0,duration:3,seed:4};
 assert.deepEqual(module.sampleGesture({...opts,time:1.01}),module.sampleGesture({...opts,time:1.04}));
 assert.notDeepEqual(module.sampleGesture({...opts,time:1.04}),module.sampleGesture({...opts,time:1.08}));
 for(const gesture of ['head_spin','head_jerk']){
  assert.ok(!module.ARM_GESTURES.includes(gesture));
  const pose=module.sampleGesture({...opts,gesture,time:1});assert.ok(pose.head.some(v=>Math.abs(v)>.5));
  assert.ok(pose.upper_armL.every(v=>v===0));
  assert.ok(values(module.sampleGesture({...opts,gesture,time:1e307,duration:1e308})).every(Number.isFinite));
 }
 assert.ok(module.ARM_GESTURES.includes('cry'));
});
