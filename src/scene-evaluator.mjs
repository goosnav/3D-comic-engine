import * as THREE from 'three';
import { createActor } from './actor.mjs';
import { GRADES, DITHERS } from './contracts.mjs';
import { createStunts } from './stunts.mjs';
import { createExtras } from './extras.mjs';
import { createBook } from './book.mjs';
import { endCardFields } from './endcard.mjs';
const material = color => new THREE.MeshStandardMaterial({ color, roughness: .83 });

export function sceneAsset(catalog, id) {
  const entry = catalog?.scenes?.find(s => s.id === id);
  if (entry?.asset !== undefined || !['library', 'fireside'].includes(id)) {
    if (!entry) throw new Error(`Unknown scene treatment: ${id}`);
    const asset = catalog.assets?.[entry.asset];
    if (!entry.asset || !asset?.path) throw new Error(`Missing scene asset: ${id}`);
    return asset;
  }
  return null;
}

export function actorAsset(catalog, timeline, id) {
  if (!catalog.variants) {
    if (!catalog.assets.actor?.path) throw new Error('Legacy catalog must supply actor GLB');
    return { asset: catalog.assets.actor, variant: null };
  }
  const variant = timeline.characters?.[id] ?? (id === 'reader' ? 'blue' : 'rust');
  const entry = catalog.variants.find(v => v.id === variant);
  const asset = catalog.assets[entry?.asset];
  if (!asset?.path) throw new Error(`Unknown or unavailable actor variant: ${variant}`);
  return { asset, variant };
}

// Locate the actual textured page in the GLB, not a surrogate flat-art plane.
function pageCenter(book, pdfPage) {
  const bounds = new THREE.Box3(), wanted = `Comic page ${String(pdfPage - 2).padStart(2, '0')}`;
  book.root.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (!mats.some(m => m.name === wanted)) return;
    bounds.expandByObject(o, true);
  });
  return bounds.isEmpty() ? book.root.getWorldPosition(new THREE.Vector3()) : bounds.getCenter(new THREE.Vector3());
}

// Cache rigid head-weighted vertices in head-bone space once. Only extended
// headgear opts into adaptive framing; ordinary actors keep their exact cameras.
export function headgearFraming(actor) {
  actor.root.updateMatrixWorld(true);
  const inverse = actor.bones.head.matrixWorld.clone().invert();
  const points = [], bounds = new THREE.Box3();
  let accessory = false;
  actor.root.traverse(o => {
    if (!o.isSkinnedMesh) return;
    o.skeleton.update();
    const head = o.skeleton.bones.indexOf(actor.bones.head);
    // Hat bones (the gooby stalk) ride on the head and count as headgear.
    const hat = new Set(o.skeleton.bones.flatMap((b, k) => /^hat_/.test(b.name) ? [k] : []));
    if (hat.size) accessory = true;
    const indices = o.geometry.attributes.skinIndex, weights = o.geometry.attributes.skinWeight;
    for (let i = 0; i < indices.count; i++) {
      let weight = 0;
      for (let j = 0; j < 4; j++) if (indices.getComponent(i, j) === head || hat.has(indices.getComponent(i, j))) weight += weights.getComponent(i, j);
      if (weight < .5) continue;
      const p = o.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(o.matrixWorld);
      bounds.expandByPoint(p); points.push(p.applyMatrix4(inverse));
      if (o.name.startsWith('theatre_expansion_')) accessory = true;
    }
  });
  return accessory && bounds.max.y > 1.82 ? { points, lift: (bounds.max.y - 1.8) / 2 } : null;
}

function fitHeadgear(camera, actors) {
  const lift = Math.max(0, ...actors.map(a => a.headgearFrame?.lift || 0));
  if (!lift) return;
  // Translate the existing composition upward, then retreat along its own axis.
  // No actor scaling, FOV change, history-dependent smoothing or camera state.
  camera.position.y += lift;
  camera.updateMatrixWorld(true);
  const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  let retreat = 0;
  for (const actor of actors) {
    if (!actor.headgearFrame) continue;
    for (const local of actor.headgearFrame.points) {
      const p = local.clone().applyMatrix4(actor.bones.head.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      retreat = Math.max(retreat, Math.abs(p.x) / (tangent * camera.aspect * .88) + p.z,
        Math.abs(p.y) / (tangent * .88) + p.z);
    }
  }
  camera.position.addScaledVector(camera.getWorldDirection(new THREE.Vector3()), -retreat);
}

export function frameCamera(camera, { shot, focusId, actors, book, bookState }) {
  camera.up.set(0, 1, 0);
  const focused = actors.find(a => a.root.name === `actor-${focusId}`) || actors[0];
  const x = focused.root.position.x, z = focused.root.position.z, side = focused.root.name === 'actor-reader' ? -1 : 1;
  // Short characters move the eye line down (zero for every v10-height actor).
  const eye = a => (a.headShift?.y || 0) + a.root.position.y;
  const lift = eye(focused), groupLift = Math.max(...actors.map(eye)) * .7;
  if (shot === 'book') {
    const page = pageCenter(book, bookState.selectedPdfPage);
    const target = page;
    const q = book.root.getWorldQuaternion(new THREE.Quaternion());
    camera.fov = 38;
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distance = Math.max(.72, .15 / (tangent * camera.aspect));
    camera.position.copy(target).add(new THREE.Vector3(.025, distance * .98, distance * .20).applyQuaternion(q));
    camera.up.copy(new THREE.Vector3(0, 0, -1).applyQuaternion(q));
    camera.lookAt(target);
  } else if (['speaker', 'close-up', 'medium'].includes(shot)) {
    camera.fov = 32;
    const distance = (camera.aspect < 1 ? Math.max(2.0, 1.38 / camera.aspect) : 1.9) * (shot === 'close-up' ? .68 : 1);
    camera.position.set(x + side * .65, 1.69 + lift, z + distance);
    camera.lookAt(x, 1.43 + lift, z + .05);
  } else if (shot === 'over-shoulder' && actors.length > 1) {
    const listener = actors.find(a => a !== focused);
    camera.fov = 38;
    // Sit beside the listening shoulder, within the room, looking across the
    // conversation. Keep the near shoulder at the edge, clear of the speaker.
    const distance = Math.max(1, .7 / camera.aspect);
    camera.position.set(listener.root.position.x - side * .8 * distance, 1.76, z - .9);
    if (listener.headgearFrame) {
      // Step inward around the near helmet, not farther along the line through
      // both heads. Keep the listening shoulder in frame and retain the reverse angle.
      camera.position.x += side * .35;
      camera.position.y += .12;
      camera.position.z -= .10;
    }
    camera.position.y += lift;
    camera.lookAt(THREE.MathUtils.lerp(x, listener.root.position.x, .12), 1.44 + lift, z + .06);
  } else {
    camera.fov = 38;
    const middle = actors.reduce((sum, a) => sum + a.root.position.x, 0) / actors.length;
    const halfWidth = actors.length > 1 ? .66 : .45;
    const distance = Math.max(2.5, halfWidth / (Math.tan(THREE.MathUtils.degToRad(19)) * camera.aspect)) * (shot === 'extreme-wide' ? 4.5 : shot === 'wide' ? 1.65 : 1);
    camera.position.set(middle + .06, 1.77 + groupLift, distance);
    camera.lookAt(middle, 1.08 + groupLift, .03);
  }
  if (shot !== 'book' && shot !== 'source') {
    fitHeadgear(camera, ['speaker', 'close-up', 'medium'].includes(shot) || shot === 'over-shoulder' ? [focused] : actors);
  }
  camera.updateProjectionMatrix();
}

function buildSet(scene, treatment) {
  const wood = material(0x422b24), trim = material(0x967143), teal = material(0x193b3b);
  const cream = material(0xc8b38b), brass = material(0xa88b52), dark = material(0x1b2020);
  function box(size, position, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh); return mesh;
  }
  box([12, .12, 12], [0, -.08, 0], wood);
  box([10, 4, .12], [0, 1.9, -1.48], teal);
  box([10, .12, .15], [0, .16, -1.36], trim);
  for (let x = -4; x <= 4; x += .65) box([.025, 1.05, .025], [x, .64, -1.39], trim);
  box([10, .045, .16], [0, 1.12, -1.38], trim);
  const rug = box([3.5, .018, 2.4], [0, -.008, .25], material(0x775047));
  for (const x of [-1.65, 1.65]) box([.035, .004, 2.2], [x, .004, .25], cream);
  const table = box([2.25, .085, .83], [-.05, .76, .58], wood);
  box([2.26, .018, .84], [-.05, .807, .58], material(0x78543b));
  for (const x of [-.97, .87]) for (const z of [.27, .9]) box([.055, .72, .055], [x, .36, z], brass);
  // Decorative spines are abstract set dressing, not replacement product artwork.
  const palette = [0x866a50, 0x485e59, 0x8c5046, 0xbaa27b, 0x343d4c];
  function shelf(x) {
    box([1.12, 2.5, .25], [x, 1.27, -1.28], wood);
    box([.96, 2.32, .02], [x, 1.3, -1.12], dark);
    for (let row = 0; row < 5; row++) {
      const y = .22 + row * .46;
      box([1.14, .045, .36], [x, y, -1.12], trim);
      for (let i = 0; i < 9; i++) {
        const h = .24 + ((i * 7 + row * 3) % 5) * .027;
        const spine = box([.075, h, .16], [x - .42 + i * .103, y + h / 2 + .025, -1.04], material(palette[(i + row) % palette.length]));
        spine.rotation.z = i === 7 ? -.09 : 0;
        box([.052, .011, .006], [spine.position.x, y + h - .035, -.956], brass);
      }
    }
  }
  shelf(-1.65);
  if (treatment !== 'fireside') shelf(1.65);
  if (treatment === 'fireside') {
    box([1.55, 1.37, .32], [1.7, .69, -1.22], material(0x6a594b));
    box([1.15, .9, .035], [1.7, .55, -1.04], dark);
    box([1.73, .12, .5], [1.7, 1.41, -1.14], cream);
    box([1.65, .10, .64], [1.7, .06, -1.02], material(0x554d48));
    for (let i = 0; i < 5; i++) {
      const ember = new THREE.Mesh(new THREE.ConeGeometry(.075, .22 + i % 2 * .12, 7),
        new THREE.MeshStandardMaterial({ color: 0xc67728, emissive: 0xf16918, emissiveIntensity: 1.5, roughness: 1 }));
      ember.position.set(1.7 + (i - 2) * .16, .25, -.99); scene.add(ember);
    }
    const fire = new THREE.PointLight(0xffa35b, 2.5, 4, 2); fire.position.set(1.7, .65, -.65); scene.add(fire);
  } else {
    box([1.5, 1.2, .055], [0, 2.0, -1.36], brass);
    box([1.39, 1.09, .06], [0, 2.0, -1.31], dark);
    box([1.29, .99, .065], [0, 2.0, -1.26], material(0x496c70));
    for (const x of [-.65, 0, .65]) box([.035, 1.05, .09], [x, 2, -1.22], brass);
    box([1.34, .035, .09], [0, 2, -1.21], brass);
  }
  // Warm practical pool on the table without blocking either face.
  box([.035, .35, .035], [.8, .99, .20], brass);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(.19, .18, 32, 1, true), material(0xc2aa72));
  shade.position.set(.8, 1.20, .20); scene.add(shade);
  const lamp = new THREE.PointLight(0xffd79e, .8, 2.5, 2); lamp.position.set(.8, 1.09, .20); scene.add(lamp);
  return { table, rug };
}

export function validate(timeline, catalog) {
  if (!timeline || !Array.isArray(timeline.events) || !Number.isInteger(timeline.fps) || timeline.fps <= 0 ||
      !Number.isInteger(timeline.frames) || timeline.frames < 1) throw new Error('Timeline requires events, positive integer fps and frames');
  for (const key of ['width', 'height']) if (!Number.isInteger(timeline[key]) || timeline[key] < 1 || timeline[key] > 4096) throw new Error(`Invalid timeline ${key}`);
  sceneAsset(catalog, timeline.scene);
  if (timeline.grade !== undefined && !GRADES.includes(timeline.grade)) throw new Error(`Unknown grade: ${timeline.grade}`);
  if (timeline.dither !== undefined && !DITHERS.includes(timeline.dither)) throw new Error(`Unknown dither: ${timeline.dither}`);
  if (!catalog?.assets?.book?.path) throw new Error('Catalog must supply book GLB');
  if (!Array.isArray(timeline.cast) || !timeline.cast.includes('reader') || timeline.cast.some(id => !['reader', 'friend'].includes(id)) || new Set(timeline.cast).size !== timeline.cast.length) throw new Error('Cast must contain reader and optionally friend');
  timeline.cast.forEach(id => actorAsset(catalog, timeline, id));
  for (const id of timeline.extras ?? []) {
    const extra = catalog.extras?.find(e => e.id === id);
    if (!extra || (!extra.procedural && !catalog.assets?.[extra.asset]?.path)) throw new Error(`Unknown or unavailable extra: ${id}`);
  }
  const comics = new Map(catalog.comics.map(c => [c.id, c]));
  const selected = new Set(timeline.sources || []);
  for (const id of [...selected, ...timeline.events.map(e => e.comic).filter(Boolean)]) {
    const comic = comics.get(id);
    if (!comic?.verified || !comic.path || !Number.isInteger(comic.pdfPage) || comic.pdfPage < 3 || comic.pdfPage > 146) throw new Error(`Unknown, unverified or unmappable source: ${id}`);
    if (!selected.has(id)) throw new Error(`Source is not selected in timeline: ${id}`);
  }
  for (const e of timeline.events) {
    if (!['line', 'source', 'action', 'hold', 'endcard'].includes(e.type) || !Number.isFinite(e.start) || !Number.isFinite(e.end) || e.start < 0 || e.end <= e.start) throw new Error('Invalid timeline event');
    if (e.speaker && !timeline.cast.includes(e.speaker)) throw new Error(`Unknown speaker: ${e.speaker}`);
    if (e.type === 'source' && !e.comic) throw new Error('Source events need a catalog comic');
    let prev = -Infinity;
    for (const sample of e.mouth || []) {
      if (!Number.isFinite(sample.t) || sample.t < 0 || sample.t < prev || !Number.isFinite(sample.value)) throw new Error('Mouth samples must be finite and ordered in line-relative seconds');
      prev = sample.t;
    }
  }
  return comics;
}

export function createSceneEvaluator({timeline, catalog, scene, camera, environmentRoot, actorModels, selections, extraModels, bookGLTF, comics}) {
    scene.add(new THREE.HemisphereLight(0xf7ead4, 0x395150, 2.1));
    const key = new THREE.DirectionalLight(0xffdfb1, 3.2);
    key.position.set(-2.5, 4, 3); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -3; key.shadow.camera.right = 3;
    key.shadow.camera.top = 3; key.shadow.camera.bottom = -3; key.shadow.normalBias = .018;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xc7e4ef, 1.6); fill.position.set(2, 2, 2); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xf9bd77, 2); rim.position.set(0, 3, -2); scene.add(rim);
    if (environmentRoot) scene.add(environmentRoot);
    else buildSet(scene, timeline.scene);
    const actors = timeline.cast.map((id, i) => {
      const actor = createActor(actorModels.get(selections[i].asset.path), id, i);
      actor.variant = selections[i].variant;
      // Preserve the reader's established reach to the book; close the duet by
      // bringing the listening actor inward instead of disturbing the grip rig.
      actor.root.position.set(id === 'reader' ? -.64 : .08, 0, -.02);
      actor.root.rotation.y = id === 'reader' ? .30 : -.30;
      actor.headgearFrame = headgearFraming(actor);
      if (actor.stature < .8) {
        // Short characters stand on a crate: the reader can reach the table and
        // hold the book, and nobody's face hides behind the table edge.
        const height = .45, crate = new THREE.Mesh(new THREE.BoxGeometry(.5, height, .42), material(0x8a6239));
        crate.name = `${id}-crate`; crate.castShadow = crate.receiveShadow = true;
        crate.position.set(actor.root.position.x, height / 2, actor.root.position.z); crate.rotation.y = actor.root.rotation.y;
        scene.add(crate); actor.root.position.y = height;
      }
      scene.add(actor.root); return actor;
    });
    const extras = createExtras({ scene, timeline, catalog, models: extraModels, actors });
    const stunts = createStunts(actors);
    const book = createBook(bookGLTF, timeline, comics); scene.add(book.root);
    function evaluate(frame) {
      if (!Number.isInteger(frame) || frame < 0 || frame >= timeline.frames) throw new RangeError('Frame outside timeline');
      const time = frame / timeline.fps;
    const current = timeline.events.filter(e => e.start <= time && time < e.end);
    const endEvent = current.find(e => e.type === 'endcard' && endCardFields(timeline, e).enabled);
    const active = current.find(e => e.type === 'line' || e.type === 'hold') || null;
    const sourceEvent = current.find(e => e.type === 'source') || (active?.shot === 'source' ? active : null);
    const source = sourceEvent ? comics.get(sourceEvent.comic) : null;
    const reader = actors.find(a => a.root.name === 'actor-reader');
    const bookState = book.evaluate(time);
    const action = current.find(e => e.type === 'action');
    let shot = sourceEvent ? sourceEvent.shot || 'source' : active?.shot || action?.shot || 'two-shot';
    if (shot === 'auto') shot = 'two-shot';
    const reacting = active?.type === 'hold' && active.reaction?.at === 'line_end' && time-active.start < active.reaction.duration;
    const focusId = reacting ? active.reaction.actor : active?.speaker || action?.actor;
    const framingEvent = sourceEvent || active || action;
    // Compose from the neutral cast at the cut. Stunts and head/arm poses never steer the camera.
    stunts.reset(); actors.forEach(actor => actor.apply({time:framingEvent?.start ?? 0}));
    book.apply(framingEvent?.start ?? 0, reader); scene.updateMatrixWorld(true);
    frameCamera(camera, {shot,focusId,actors,book,bookState:book.diagnostics(),event:framingEvent,time:framingEvent?.start ?? 0});
    stunts.reset();
    actors.forEach((actor, i) => actor.apply({ time, line: active,
      listening: !!active && active.speaker !== timeline.cast[i],
      gazeOverride: action?.gaze?.[timeline.cast[i]],
      gaze: actors.length > 1 ? (i === 0 ? .32 : -.32) : 0,
      held: timeline.cast[i] === 'reader' ? bookState.held : 0,
      reading: sourceEvent?.shot === 'book' || (timeline.cast[i] === 'reader' && bookState.rail === 'read' && bookState.progress < 1),
      seed: timeline.seed || 0 }));
    stunts.apply(action, time);
    extras.apply(time, action, camera);
    book.apply(time, reader);
    scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      return {time, active, source, shot, endEvent};
    }
    return {scene, camera, actors, extras, stunts, book, evaluate};
}
