import {createSceneEvaluator, sceneAsset, actorAsset, validate} from './scene-evaluator.mjs';
export {frameCamera, headgearFraming} from './scene-evaluator.mjs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCaptions } from './captions.mjs';
import { createGrade, createFlatDitherMaterial, DEFAULT_GRADE, DEFAULT_DITHER } from './grade.mjs';
import { createEndcard, endCardFields, loadEndcardVideo } from './endcard.mjs';
import { loadEndcardFrames } from './endcard-frames.mjs';

function assetURL(base, path) {
  // Browser adapter owns hash-verified immutable snapshots for one render.
  if (typeof path === 'string' && path.startsWith('blob:') && new URL(path).origin === location.origin) return path;
  if (typeof path !== 'string' || !path || /^(?:[a-z]+:|\/|\\)/i.test(path) || path.includes('\\') || decodeURIComponent(path).split('/').includes('..')) throw new Error('Asset paths must be portable relative paths');
  const url = new URL(`${base.replace(/\/$/, '')}/${path}`, location.href);
  if (url.origin !== location.origin) throw new Error('Renderer assets must be same-origin');
  return url.href;
}
function disposeObjects(roots, extraTextures = []) {
  const geometries = new Set(), materials = new Set(), textures = new Set(extraTextures), skeletons = new Set();
  for (const root of roots) root?.traverse(o => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.skeleton) skeletons.add(o.skeleton);
    for (const mat of (Array.isArray(o.material) ? o.material : o.material ? [o.material] : [])) {
      materials.add(mat);
      for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  textures.forEach(t => { t.dispose(); t.source?.data?.close?.(); });
  skeletons.forEach(s => s.dispose());
}

export async function createPlayer(canvas, { timeline: input, catalog, assetBase = '', onProgress = () => {}, signal, endcardMode = 'video' }) {
  if (!['video', 'frames'].includes(endcardMode)) throw Error('Unknown endcard source mode');
  // Own a stable snapshot: host edits must create a new player, never alter a capture.
  const timeline = structuredClone(input);
  timeline.events?.sort((a, b) => a.start - b.start);
  const comics = validate(timeline, catalog);
  const environment = sceneAsset(catalog, timeline.scene);
  const loading = message => { signal?.throwIfAborted(); onProgress(message, { phase: 'loading', progress: null, message }); };
  const scene = new THREE.Scene(); scene.background = new THREE.Color(catalog.scenes?.find(s=>s.id===timeline.scene)?.backgroundColor ?? 0x192929);
  const insertScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, timeline.width / timeline.height, .04, 500);
  const insertCamera = new THREE.OrthographicCamera(-camera.aspect, camera.aspect, 1, -1, .1, 5);
  insertCamera.position.z = 2;
  const textures = new Map(), loadedRoots = [];
  const endcards = new Map(), fonts = [];
  let renderRequest = 0;
  let evaluator, renderer, grade, actors, book, stunts, extras, captions, sourcePlane, endcardVideo, disposed = false, frame = null, active = null, source = null, shot = 'two-shot', endcard = null;
  try {
    // Load sequentially so every fulfilled allocation is owned even if a later load fails.
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(url => {
      if (/^(blob:|data:)/.test(url)) return url;
      if (new URL(url, location.href).origin !== location.origin) throw new Error('External renderer dependencies are not allowed');
      return url;
    });
    const loader = new GLTFLoader(manager), actorModels = new Map();
    let environmentRoot;
    if (environment) {
      loading(`Loading scene ${timeline.scene}`);
      const gltf = await loader.loadAsync(assetURL(assetBase, environment.path));
      environmentRoot = gltf.scene; loadedRoots.push(environmentRoot);
      environmentRoot.name = `environment-${timeline.scene}`;
      environmentRoot.traverse(o => { if (o.isMesh) { o.castShadow = !o.userData.background; o.receiveShadow = !o.userData.background; } });
    }
    const selections = timeline.cast.map(id => actorAsset(catalog, timeline, id));
    for (const { asset } of selections) if (!actorModels.has(asset.path)) {
      loading('Loading actor model');
      const gltf = await loader.loadAsync(assetURL(assetBase, asset.path));
      actorModels.set(asset.path, gltf.scene); loadedRoots.push(gltf.scene);
    }
    const extraModels = new Map();
    for (const id of timeline.extras ?? []) {
      const entry = catalog.extras.find(e => e.id === id);
      if (entry.procedural) continue;
      loading(`Loading cameo ${entry.label ?? id}`);
      const gltf = await loader.loadAsync(assetURL(assetBase, catalog.assets[entry.asset].path));
      extraModels.set(id, gltf); loadedRoots.push(gltf.scene);
    }
    loading('Loading book');
    const bookGLTF = await loader.loadAsync(assetURL(assetBase, catalog.assets.book.path));
    loadedRoots.push(bookGLTF.scene);
    const textureLoader = new THREE.TextureLoader(manager);
    for (const id of timeline.sources || []) {
      loading(`Loading comic page ${id}`);
      const texture = await textureLoader.loadAsync(assetURL(assetBase, comics.get(id).path));
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter;
      textures.set(id, texture);
    }
    if (timeline.captions?.enabled && catalog.assets.sansFont?.path) {
      const font = new FontFace('ComicTheatreSans', `url(${JSON.stringify(assetURL(assetBase, catalog.assets.sansFont.path))})`, {weight:'700'});
      await font.load(); document.fonts.add(font); fonts.push(font);
    }
    if (timeline.events.some(e => e.type === 'endcard' && endCardFields(timeline, e).enabled)) {
      for (const [key, family, weight] of [['serifFont', 'ComicTheatreTimes', '400'], ['sansFont', 'ComicTheatreSans', '700']]) {
        if (!catalog.assets[key]?.path || fonts.some(font => font.family === family)) continue; // Old catalogs retain system Times-compatible fallback.
        loading(`Loading endcard font ${family}`);
        const font = new FontFace(family, `url(${JSON.stringify(assetURL(assetBase, catalog.assets[key].path))})`, { weight });
        await font.load(); document.fonts.add(font); fonts.push(font);
      }
      if (endcardMode === 'frames') {
        if (!catalog.assets.endCardFrames?.path) throw new Error('Endcard frame asset is missing. Reload the updated application.');
        loading('Loading endcard frames');
        endcardVideo = await loadEndcardFrames(assetURL(assetBase, catalog.assets.endCardFrames.path), { signal });
      } else {
        if (!catalog.assets.endCardVideo?.path) throw new Error('Endcard needs the catalog spinning-product video');
        loading('Loading endcard video');
        endcardVideo = await loadEndcardVideo(assetURL(assetBase, catalog.assets.endCardVideo.path), { signal });
      }
    }
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1); renderer.setSize(timeline.width, timeline.height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    grade = createGrade(renderer, timeline.width, timeline.height, { grade: timeline.grade ?? DEFAULT_GRADE, dither: timeline.dither ?? DEFAULT_DITHER });
    evaluator = createSceneEvaluator({timeline, catalog, scene, camera, environmentRoot, actorModels, selections, extraModels, bookGLTF, comics});
    ({actors, extras, stunts, book} = evaluator);
    captions = createCaptions(timeline.width, timeline.height, timeline.captions, timeline.dither ?? DEFAULT_DITHER);
    sourcePlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ toneMapped: false }));
    insertScene.background = new THREE.Color(0xeee9df); insertScene.add(sourcePlane);
  } catch (error) {
    endcardVideo?.dispose();
    disposeObjects([scene, insertScene, captions?.scene, ...loadedRoots], [...textures.values()]);
    fonts.forEach(f => document.fonts.delete(f)); grade?.dispose(); renderer?.dispose(); throw error;
  }

  function renderAt(frameIndex) {
    if (disposed) throw new Error('Player is disposed');
    if (renderer.getContext().isContextLost()) throw new Error('WebGL context lost during frame rendering');
    if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= timeline.frames) throw new RangeError(`frameIndex must be an integer from 0 to ${timeline.frames - 1}`);
    const request = ++renderRequest;
    frame = frameIndex;
    const time = frame / timeline.fps;
    const evaluated = evaluator.evaluate(frame);
    const {endEvent} = evaluated;
    ({active, source, shot} = evaluated); endcard = null;
    captions.draw(active, time);
    if (endEvent) {
      if (!endcards.has(endEvent)) endcards.set(endEvent, createEndcard({ width: timeline.width, height: timeline.height,
        card: endCardFields(timeline, endEvent), video: endcardVideo.video,
        frameSource: endcardMode === 'frames' ? endcardVideo : undefined,
        videoAsset: endcardMode === 'frames' ? catalog.assets.endCardFrames : catalog.assets.endCardVideo }));
      endcard = endcards.get(endEvent); shot = 'endcard'; source = null;
      const plane = endcard.scene.children[0];
      if (!plane.userData.dithered) {
        // Dither while drawing the flat card: no offscreen pass, so real-time
        // browser exports keep up even on software rendering.
        const flat = createFlatDitherMaterial(plane.material.map, timeline.width, timeline.height, grade.dither);
        if (flat) { plane.material.dispose(); plane.material = flat; }
        plane.userData.dithered = true;
      }
      const card = endcard;
      return card.renderAt(time - endEvent.start).then(() => {
        if (disposed) throw new Error('Player is disposed');
        if (request !== renderRequest) return;
        // The end card shares the dither, never the colour grade.
        renderer.render(card.scene, card.camera);
      });
    } else if (source && shot === 'source') {
      const texture = textures.get(source.id);
      sourcePlane.material.map = texture; sourcePlane.material.needsUpdate = true;
      const ratio = texture.image.width / texture.image.height;
      const h = Math.min(.95, camera.aspect * .95 / ratio);
      sourcePlane.scale.set(h * ratio, h, 1);
      renderer.render(insertScene, insertCamera);
    } else grade.render(scene, camera, frame);
    if (captions.diagnostics()) {
      renderer.autoClear = false; renderer.clearDepth(); renderer.render(captions.scene, captions.camera); renderer.autoClear = true;
    }
  }

  function diagnostics() {
    return structuredClone({ frame, time: frame === null ? null : frame / timeline.fps,
      scene: timeline.scene, grade: grade.id, dither: grade.dither, shot, activeEvent: active?.id || null,
      source: source ? { id: source.id, path: source.path, sha256: source.sha256, pdfPage: source.pdfPage, fit: shot === 'source' ? 'contain' : 'physical-page' } : null,
      endCard: endcard?.diagnostics() || null,
      stunt: stunts.diagnostics(), extras: extras.diagnostics(), captions: captions.diagnostics(),
      independentSkeletons: actors.every((a, i) => actors.slice(i + 1).every(b =>
        a.skeletons.every(s => b.skeletons.every(t => s !== t && s.bones.every(bone => !t.bones.includes(bone)))))),
      actors: actors.map(a => ({ ...a.diagnostics(), variant: a.variant })), book: book.diagnostics(),
      camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: camera.fov },
      disposed, warnings: ['Grip measures wrist targets only; natural finger contact has not been certified.',
        ...(environment ? [] : ['Procedural library/fireside set; optional environment GLB is not used.']),
        'Page changes outside explicit turn rails are deliberate source cuts.'] });
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    endcardVideo?.dispose();
    disposeObjects([scene, insertScene, captions.scene, ...loadedRoots, ...[...endcards.values()].map(c => c.scene)], [...textures.values()]);
    fonts.forEach(f => document.fonts.delete(f));
    grade.dispose(); renderer.renderLists.dispose(); renderer.dispose();
  }
  try { await renderAt(0); } catch (error) { dispose(); throw error; }
  return { renderAt, diagnostics, dispose };
}
