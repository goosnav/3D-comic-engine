import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {resolveScript, GMOD_ACTIONS, ACTOR_ACTIONS, GESTURES} from '../src/contracts.mjs';
import {compileTimeline} from '../src/timeline.mjs';
import {createActor} from '../src/actor.mjs';
import {createStunts} from '../src/stunts.mjs';
import {createExtras} from '../src/extras.mjs';
import {generateChaos, INTENSITIES} from '../src/chaos.mjs';
import {sampleGesture} from '../src/gesture-performance.mjs';

const catalog = JSON.parse(await readFile(new URL('../assets/catalog.json', import.meta.url)));
const load = async rel => {
  const bytes = await readFile(new URL('../' + rel, import.meta.url));
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
};
const actorFor = async (variant, id = 'reader', i = 0) => {
  const asset = catalog.assets[catalog.variants.find(v => v.id === variant).asset];
  const actor = createActor((await load(asset.path)).scene, id, i);
  actor.root.position.x = i * .72;
  return actor;
};
const raw = {template: 'book-duet', title: 'Cast check', comics: ['book2-020'], seed: 3, endCard: {enabled: false}, lines: [{speaker: 'reader', text: 'Hello.'}]};

test('Little Billy and the gooby-hat guy are castable v10-rig characters with working faces and headgear', async () => {
  for (const id of ['billy', 'gooby']) assert.ok(catalog.variants.some(v => v.id === id), id);
  const billy = await actorFor('billy'), gooby = await actorFor('gooby');
  assert.ok(billy.stature < .6, 'Billy is a short character');
  assert.equal(gooby.stature, 1, 'gooby keeps the exact v10 face placement');
  assert.deepEqual(gooby.headShift.toArray(), [0, 0, 0]);
  for (const actor of [billy, gooby]) {
    assert.ok(actor.nose, 'the authored nose is extracted for nose actions');
    actor.apply({time: 1.5});
    assert.equal(actor.diagnostics().faceMode, 'oral-cavity');
  }
  // Brows follow Billy's lower head: they sit just above his eyes, not 0.8 m over his cap.
  billy.root.updateMatrixWorld(true);
  const head = billy.bones.head.getWorldPosition(new THREE.Vector3());
  const brows = [];
  billy.bones.head.traverse(o => { if (o.geometry?.type === 'CapsuleGeometry') brows.push(o.getWorldPosition(new THREE.Vector3())); });
  assert.equal(brows.length, 2);
  for (const brow of brows) assert.ok(brow.y - head.y > .1 && brow.y - head.y < .25, `brow height ${brow.y - head.y}`);
  // The propeller turns and the stalk wobbles over time, deterministically.
  const sample = (actor, bone, time) => { actor.apply({time}); return actor.bones[bone].quaternion.clone(); };
  const a = sample(billy, 'propeller', 1), b = sample(billy, 'propeller', 1.1);
  assert.ok(a.angleTo(b) > .3, 'propeller spins');
  assert.ok(sample(billy, 'propeller', 1).equals(a), 'propeller pose is a pure function of time');
  assert.ok(sample(gooby, 'hat_stalk3', 1).angleTo(sample(gooby, 'hat_stalk3', 1.4)) > .02, 'stalk wobbles');
});

test('extras validate, a goose chase brings its goose, and the timeline carries them', () => {
  const resolve = extra => resolveScript({...raw, ...extra}, catalog);
  assert.equal(resolve({}).extras, undefined, 'scripts without cameos keep their exact shape');
  assert.deepEqual(resolve({extras: ['glove-bot', 'goose']}).extras, ['glove-bot', 'goose']);
  for (const extras of [['dragon'], ['goose', 'goose'], 'goose', ['goose', 'walker', 'shoe-hat', 'glove-bot', 'goose']]) assert.throws(() => resolve({extras}));
  const chased = resolve({lines: [raw.lines[0], {action: 'goose_chase', actor: 'friend'}]});
  assert.deepEqual(chased.extras, ['goose']);
  assert.deepEqual(resolveScript(chased, catalog), chased, 'resolved scripts round-trip');
  assert.throws(() => resolve({extras: ['walker', 'shoe-hat', 'glove-bot', 'glove-bot']}));
  assert.throws(() => resolveScript({...raw, extras: ['goose']}, {...catalog, extras: undefined}), /extras\[0\]/);
  const takes = Object.fromEntries(chased.lines.map(l => [l.id, {duration: 1, mouth: []}]));
  assert.deepEqual(compileTimeline(chased, takes).extras, ['goose']);
  assert.equal(compileTimeline(resolve({}), {'beat-0': {duration: 1}}).extras, undefined);
});

test('chaos generator writes complete, valid, seeded scripts with no model', () => {
  assert.deepEqual(INTENSITIES, ['mild', 'wild', 'unhinged']);
  const titles = new Set(), actions = new Set(), cast = new Set();
  for (const intensity of INTENSITIES) for (let seed = 0; seed < 60; seed++) {
    const script = generateChaos(catalog, {seed, intensity});
    const resolved = resolveScript(script, catalog);
    assert.equal(resolved.seed, seed);
    titles.add(script.title); Object.values(script.characters).forEach(v => cast.add(v));
    script.lines.filter(l => l.action).forEach(l => actions.add(l.action));
    const texts = script.lines.filter(l => l.text).map(l => l.text);
    assert.equal(new Set(texts).size, texts.length, 'no repeated dialogue inside one film');
  }
  assert.deepEqual(generateChaos(catalog, {seed: 99}), generateChaos(catalog, {seed: 99}), 'same seed, same film');
  assert.notDeepEqual(generateChaos(catalog, {seed: 99}), generateChaos(catalog, {seed: 100}));
  assert.ok(titles.size > 8 && cast.has('billy') && cast.has('gooby'));
  for (const action of GMOD_ACTIONS) assert.ok(actions.has(action), `generator uses ${action}`);
  for (const template of ['fireside-reader', 'page-tour']) assert.equal(generateChaos(catalog, {seed: 5, template}).template, template);
  const solo = generateChaos(catalog, {seed: 8, template: 'fireside-reader', intensity: 'unhinged'});
  assert.ok(solo.lines.every(l => !l.target && (l.speaker ?? 'reader') === 'reader'));
  assert.throws(() => generateChaos(catalog, {intensity: 'calm'}), /intensity/);
  assert.throws(() => generateChaos(catalog, {template: 'nope'}), /template/);
});

test('gmod stunts are deterministic and each does its visible thing', async () => {
  const actors = [await actorFor('blue', 'reader', 0), await actorFor('billy', 'friend', 1)];
  const stunts = createStunts(actors);
  const sample = (rail, p, actor = 'reader') => {
    stunts.reset(); actors.forEach(a => a.apply({time: p * 2}));
    stunts.apply({rail, actor, target: actor === 'reader' ? 'friend' : 'reader', start: 0, end: 2}, p * 2);
    actors.forEach(a => a.root.updateMatrixWorld(true));
    return actors.map(a => ({p: a.root.position.toArray(), q: a.root.quaternion.toArray(), bones: Object.values(a.bones).map(b => [...b.quaternion.toArray(), ...b.scale.toArray()])}));
  };
  for (const rail of GMOD_ACTIONS) {
    assert.ok(ACTOR_ACTIONS.includes(rail));
    const first = sample(rail, .5); sample(rail, .9); sample(rail, .1);
    assert.deepEqual(sample(rail, .5), first, `${rail} seeks exactly`);
  }
  const [guy, billy] = actors;
  sample('t_pose', .5); assert.ok(guy.bones.handL.getWorldPosition(new THREE.Vector3()).y > 1.15, 'arms out in a T');
  sample('ragdoll', .6); assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(guy.root.quaternion).y < .2, 'lying down');
  sample('noclip', .25); assert.ok(guy.root.position.y < -.8, 'sunk into the floor');
  sample('noclip', .98); assert.ok(guy.root.position.z < -5, 'drifted through the back wall');
  sample('big_head', .5); assert.ok(guy.bones.head.scale.x > 2.5);
  sample('big_head', .95); assert.equal(guy.bones.head.scale.x, 1, 'snaps back before the cut');
  sample('jitter', .99); assert.ok(guy.root.position.y > 30, 'flung by the physics');
  sample('helicopter', .95, 'friend'); assert.ok(billy.root.position.y > 8);
  sample('goose_chase', .95, 'friend'); assert.ok(billy.root.position.x > 5, 'friend flees off-frame');
  sample('goose_chase', .95); assert.ok(guy.root.position.x < -5, 'reader flees the other way');
  // Billy hops to meet a tall partner's high five.
  sample('high_five', .5);
  const wrists = actors.map(a => a.bones.handR.getWorldPosition(new THREE.Vector3()));
  assert.ok(wrists[0].distanceTo(wrists[1]) < .08, `hands meet (${wrists[0].distanceTo(wrists[1])})`);
});

test('snap_pose holds each random pose for several frames, then snaps', () => {
  assert.ok(GESTURES.includes('snap_pose'));
  const at = time => sampleGesture({gesture: 'snap_pose', time, duration: 9, seed: 4}).upper_armR;
  const frames = Array.from({length: 48}, (_, i) => JSON.stringify(at((i + .5) / 24)));
  const changes = frames.filter((f, i) => i && f !== frames[i - 1]).length;
  assert.ok(changes >= 3 && changes <= 12, `${changes} snaps in two seconds`);
  assert.deepEqual(at(1.3), at(1.3));
});

test('extras follow seeded schedules that seek exactly; the goose chases the victim', async () => {
  const scene = new THREE.Scene();
  const actors = [await actorFor('blue', 'reader', 0), await actorFor('rust', 'friend', 1)];
  const models = new Map([['glove-bot', await load(catalog.assets['extra-glove-bot'].path)]]);
  const timeline = {duration: 30, fps: 24, frames: 720, seed: 9, extras: ['goose', 'glove-bot']};
  const extras = createExtras({scene, timeline, catalog, models, actors});
  assert.equal(extras.roots.length, 2);
  const snapshot = t => { extras.apply(t); return extras.roots.map(r => [r.visible, ...r.position.toArray(), r.rotation.y]); };
  const first = [3, 11.5, 22].map(snapshot);
  snapshot(29); snapshot(.1);
  assert.deepEqual([3, 11.5, 22].map(snapshot), first, 'pure functions of time');
  const behaviours = new Set();
  for (let t = 0; t < 30; t += .25) for (const s of extras.apply(t)) behaviours.add(`${s.id}:${s.behaviour}`);
  assert.ok(behaviours.has('glove-bot:cross') && [...behaviours].filter(b => b.startsWith('goose:')).length >= 4, [...behaviours].join());
  // During a chase the goose is placed on the fleeing actor's heels.
  const stunts = createStunts(actors), chase = {rail: 'goose_chase', actor: 'friend', start: 0, end: 2};
  stunts.reset(); stunts.apply(chase, 1.8);
  const [goose] = extras.apply(1.8, chase);
  assert.equal(goose.behaviour, 'goose_chase');
  assert.ok(Math.abs(goose.position[0] - actors[1].root.position.x) < 1, 'right behind the victim');
  // A camera inside a cameo hides it rather than filling the frame.
  const camera = new THREE.PerspectiveCamera();
  extras.apply(0); camera.position.copy(extras.roots[0].position).add(new THREE.Vector3(0, .3, 0));
  assert.equal(extras.apply(0, null, camera)[0].hiddenForCamera, true);
});

test('chaos CLI writes one script or a folder of scripts with a batch manifest', async () => {
  const run = promisify(execFile), bin = new URL('../bin/theatre.mjs', import.meta.url).pathname;
  const one = JSON.parse((await run(process.execPath, [bin, 'chaos', '--seed', '12', '--intensity', 'mild', '--json'])).stdout);
  assert.deepEqual(one, generateChaos(catalog, {seed: 12, intensity: 'mild'}));
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'theatre-chaos-'));
  try {
    const result = JSON.parse((await run(process.execPath, [bin, 'chaos', '--count', '3', '--seed', '40', '--out-dir', dir, '--json'])).stdout);
    assert.deepEqual(result.files, ['chaos-40.json', 'chaos-41.json', 'chaos-42.json']);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, 'batch.json'), 'utf8')), result.files.map(input => ({input})));
    for (const file of result.files) resolveScript(JSON.parse(await fs.readFile(path.join(dir, file), 'utf8')), catalog);
    await assert.rejects(run(process.execPath, [bin, 'chaos', '--intensity', 'calm']), e => e.code === 2);
    for (const flag of [['--dither', 'max'], ['--grade', 'sepia']]) await assert.rejects(run(process.execPath, [bin, 'render', path.join(dir, 'chaos-40.json'), ...flag]), e => e.code === 2 && new RegExp(flag[0]).test(e.stderr));
  } finally { await fs.rm(dir, {recursive: true, force: true}); }
});

test('colour grade is optional, validated, and carried to the timeline', async () => {
  const {GRADES} = await import('../src/contracts.mjs');
  const {GRADE_IDS, DEFAULT_GRADE} = await import('../src/grade.mjs');
  assert.deepEqual(GRADES, GRADE_IDS);
  assert.equal(DEFAULT_GRADE, 'muted');
  const plain = resolveScript(raw, catalog);
  assert.equal(plain.grade, undefined, 'omitted grade keeps the resolved shape (renders muted)');
  for (const grade of GRADES) {
    const resolved = resolveScript({...raw, grade}, catalog);
    assert.equal(resolved.grade, grade);
    assert.deepEqual(resolveScript(resolved, catalog), resolved);
    assert.equal(compileTimeline(resolved, {'beat-0': {duration: 1}}).grade, grade);
  }
  assert.throws(() => resolveScript({...raw, grade: 'sepia'}, catalog,{repair:false}), /grade/);
});

test('dither is optional, validated, and carried to the timeline', async () => {
  const {DITHERS} = await import('../src/contracts.mjs');
  const {DITHER_IDS, DEFAULT_DITHER, ditherScale} = await import('../src/grade.mjs');
  assert.deepEqual(DITHERS, DITHER_IDS);
  assert.equal(DEFAULT_DITHER, 'subtle');
  assert.equal(resolveScript(raw, catalog).dither, undefined);
  for (const dither of DITHERS) {
    const resolved = resolveScript({...raw, dither}, catalog);
    assert.deepEqual(resolveScript(resolved, catalog), resolved);
    assert.equal(compileTimeline(resolved, {'beat-0': {duration: 1}}).dither, dither);
  }
  assert.throws(() => resolveScript({...raw, dither: 'max'}, catalog,{repair:false}), /dither/);
  assert.equal(ditherScale(1080, 1920), 2);
  assert.equal(ditherScale(432, 768), 1);
});
