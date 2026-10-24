import * as THREE from 'three';
import { seeded } from './contracts.mjs';
import { createGoose } from './goose.mjs';

// Background cameos. Each extra gets a seeded schedule of short behaviours
// for the whole film, planned once from the timeline. Every frame is then a
// pure function of absolute time, so seeking and re-rendering stay exact.
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const ease = v => { const x = clamp(v); return x * x * (3 - 2 * x); };
const lerp = THREE.MathUtils.lerp;
// The cast stands near x -0.64 / 0.08, z 0. Cameos use the floor around them.
const AREA = { x: [-1.7, 1.5], z: [-.85, .85] };
const BACK_Z = [-1.05, -.7];
const GOOSE_MOVES = ['waddle', 'waddle', 'waddle', 'honk', 'flap', 'peck', 'stare', 'spin', 'tpose', 'noclip', 'zoom', 'ragdoll'];
const CAMEO_MOVES = ['cross', 'cross', 'trick', 'away', 'away'];

function plan(duration, random, kinds, first) {
  const segments = [];
  let t = 0, kind = first;
  while (t < duration) {
    const length = kind === 'away' ? 1.5 + random() * 3 : kind === 'cross' ? 4 + random() * 3 : .9 + random() * 2.2;
    segments.push({ kind, start: t, end: t + length, u: random(), v: random(), w: random() });
    t += length;
    kind = kinds[Math.floor(random() * kinds.length)];
  }
  return segments;
}
const at = (segments, time) => segments.find(s => time >= s.start && time < s.end) ?? segments.at(-1);
const spot = (u, v) => new THREE.Vector3(lerp(AREA.x[0], AREA.x[1], u), 0, lerp(AREA.z[0], AREA.z[1], v));

function gooseLife(timeline, random) {
  const segments = plan(timeline.duration ?? timeline.frames / timeline.fps, random, GOOSE_MOVES, 'waddle');
  // Chain waypoints: each segment starts where the previous one stopped.
  let from = spot(random(), random()), heading = random() * Math.PI * 2;
  for (const s of segments) {
    s.from = from.clone(); s.heading = heading;
    const travels = ['waddle', 'tpose', 'noclip', 'zoom'].includes(s.kind);
    s.to = travels ? spot(s.u, s.v) : from.clone();
    if (s.kind === 'zoom') s.to = spot(s.u < .5 ? 0 : 1, s.v);
    if (travels) heading = Math.atan2(s.to.x - from.x, s.to.z - from.z);
    s.toHeading = s.kind === 'stare' ? 0 : heading;
    from = s.to.clone();
  }
  return segments;
}

export function createExtras({ scene, timeline, catalog, models = new Map(), actors = [] }) {
  const ids = timeline.extras ?? [];
  const random = seeded(((timeline.seed ?? 0) ^ 0x6005e) >>> 0);
  const cast = [];
  for (const id of ids) {
    const entry = catalog.extras?.find(e => e.id === id);
    if (!entry) throw new Error(`Unknown extra: ${id}`);
    if (id === 'goose') {
      const goose = createGoose();
      scene.add(goose.root);
      cast.push({ id, goose, root: goose.root, segments: gooseLife(timeline, random) });
      continue;
    }
    const gltf = models.get(id);
    if (!gltf) throw new Error(`Missing model for extra: ${id}`);
    const root = new THREE.Group(); root.name = `extra-${id}`;
    root.add(gltf.scene);
    gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    scene.add(root);
    const mixer = new THREE.AnimationMixer(gltf.scene);
    const actions = new Map(gltf.animations.map(clip => {
      const action = mixer.clipAction(clip); action.play(); action.enabled = false; return [clip.name, action];
    }));
    const take = name => actions.get(name) ?? actions.get(entry.idle) ?? actions.values().next().value;
    const segments = plan(timeline.duration ?? timeline.frames / timeline.fps, random, CAMEO_MOVES, cast.length % 2 ? 'away' : 'cross');
    for (const s of segments) {
      s.side = s.u < .5 ? -1 : 1;
      s.z = lerp(BACK_Z[0], BACK_Z[1], s.v);
      s.trick = entry.tricks?.[Math.floor(s.w * entry.tricks.length)] ?? entry.idle;
    }
    cast.push({ id, entry, root, mixer, actions, take, segments });
  }
  let state = [];

  function chase(time, action) {
    if (action?.rail !== 'goose_chase') return null;
    const victim = actors.find(a => a.root.name === `actor-${action.actor}`);
    if (!victim) return null;
    const p = clamp((time - action.start) / (action.end - action.start || 1));
    victim.root.updateMatrixWorld(true);
    const target = victim.root.position.clone(); target.y = 0;
    // Charge in from the side the victim is not fleeing toward, then stay on its heels.
    const flee = actors.indexOf(victim) === 0 ? -1 : 1;
    const gap = lerp(3.6, .55, ease(p / .22));
    return { position: target.add(new THREE.Vector3(-flee * gap, 0, .15)), heading: flee * Math.PI / 2, p };
  }

  const bounds = new THREE.Box3();
  // Never let a cameo swallow the camera (over-shoulder sits in the back lane).
  function clearCamera(extra, camera) {
    if (!camera || !extra.root.visible) return false;
    extra.root.updateMatrixWorld(true);
    if (!bounds.setFromObject(extra.root).expandByScalar(.3).containsPoint(camera.position)) return false;
    extra.root.visible = false; return true;
  }
  function apply(time, action, camera) {
    state = cast.map(extra => ({ ...place(extra, time, action), hiddenForCamera: clearCamera(extra, camera) }));
    return state;
  }
  function place(extra, time, action) {
    {
      const s = at(extra.segments, time);
      const age = time - s.start, length = s.end - s.start, p = clamp(age / length);
      const tick = Math.floor(time * 24);
      if (extra.goose) {
        const { goose, root } = extra;
        root.visible = true; root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.scale.setScalar(1);
        const chasing = chase(time, action);
        if (chasing) {
          root.position.copy(chasing.position); root.rotation.y = chasing.heading;
          goose.pose({ walk: time * 26, stride: 1, honk: 1, flap: 1, flapPhase: time * 30, wingsOut: .6, lean: .35 });
          return { id: extra.id, behaviour: 'goose_chase', position: root.position.toArray() };
        }
        const travel = s.kind === 'zoom' ? ease(p) : s.kind === 'noclip' ? p : ease(p);
        root.position.copy(s.from).lerp(s.to, ['waddle', 'tpose', 'noclip', 'zoom'].includes(s.kind) ? travel : 0);
        root.rotation.y = lerp(s.heading, s.toHeading, ease(p / .2));
        const look = Math.sin(time * .9 + s.u * 6) * .6;
        if (s.kind === 'waddle') goose.pose({ walk: time * 11, stride: 1, look, flapPhase: time * 8 });
        else if (s.kind === 'honk') goose.pose({ honk: ease(p / .1) * ease((1 - p) / .1), flapPhase: time * 18, flap: .35, wingsOut: .25 });
        else if (s.kind === 'flap') { goose.pose({ flap: 1, flapPhase: time * 28, wingsOut: .45, neck: .6 }); root.position.y = Math.abs(Math.sin(time * 9)) * .12; }
        else if (s.kind === 'peck') goose.pose({ neck: -Math.abs(Math.sin(Math.floor(time * 6) * 1.7)), look: look * .3 });
        else if (s.kind === 'stare') goose.pose({ neck: 1, look: 0 });
        else if (s.kind === 'spin') { goose.pose({ honk: .5, flapPhase: time * 20 }); root.rotation.y += tick * 1.9; }
        else if (s.kind === 'tpose') { goose.pose({ wingsOut: 1, stiff: 1, neck: 1 }); root.position.y = .04; }
        else if (s.kind === 'noclip') { goose.pose({ walk: time * 11, stride: 1 }); root.position.y = -.55 * Math.sin(p * Math.PI); }
        else if (s.kind === 'zoom') goose.pose({ walk: time * 40, stride: 1, lean: .55, honk: 1, flapPhase: time * 30, wingsOut: .9 });
        else if (s.kind === 'ragdoll') {
          const fall = ease(p / .15) * (1 - ease((p - .85) / .15));
          goose.pose({ wingsOut: .8 * fall, neck: -.4 * fall, walk: tick * 2.3, stride: fall * (Math.floor(time * 8) % 3 === 0 ? .8 : 0) });
          root.rotation.z = fall * Math.PI / 2; root.position.y = fall * .18;
        }
        return { id: extra.id, behaviour: s.kind, position: root.position.toArray() };
      }
      const { entry, root, mixer, take } = extra;
      root.visible = s.kind !== 'away'; root.position.set(0, 0, s.z); root.rotation.set(0, 0, 0);
      let clip, local = age;
      if (s.kind === 'cross') {
        // Walk across the back of the set, entering and leaving off-frame.
        const distance = 9, speed = distance / length;
        root.position.x = s.side * (p * distance - distance / 2);
        root.rotation.y = s.side * Math.PI / 2;
        clip = take(entry.walk); local = age * clamp(speed / (entry.speed || 1), .6, 2.2);
      } else if (s.kind === 'trick') {
        root.position.x = lerp(-1.6, 1.4, s.u); root.rotation.y = (s.v - .5) * .8;
        clip = take(s.trick);
      } else clip = take(entry.idle);
      for (const action of extra.actions.values()) action.enabled = action === clip;
      clip.weight = 1; clip.time = local % clip.getClip().duration; mixer.update(0);
      return { id: extra.id, behaviour: s.kind, visible: root.visible, clip: clip.getClip().name, position: root.position.toArray() };
    }
  }
  return { apply, diagnostics: () => structuredClone(state), roots: cast.map(e => e.root), plans: cast.map(e => ({ id: e.id, segments: e.segments.map(({ kind, start, end }) => ({ kind, start, end })) })) };
}
