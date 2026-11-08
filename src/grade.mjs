import * as THREE from 'three';
import {renderSettings} from './render-settings.mjs';
import {cartoonSettings,DIGITAL_GLSL} from './digital-look.mjs';

// Final look of the video, in one fullscreen pass:
//   1. tone mapping (3D stage only),
//   2. colour grade (3D stage only): GRADES below,
//   3. ordered dither (stage and end card): DITHERS below.
// Comic page inserts never enter this pass, so the printed artwork is exact.
// Captions are dithered on their own canvas with the same pattern (ditherCanvas).
//
// Every value is fixed per preset; grain is hashed from the frame number and
// the dither pattern is fixed to the pixel grid, so a frame always renders the same.
export const GRADES = Object.freeze({
  // Default: slightly drab, faded-print look. Calms saturated costumes.
  muted: Object.freeze({ saturation: .7, black: [.035, .037, .04], white: [.95, .935, .89], tint: [1.015, 1, .955], shadowTint: [.985, 1, 1.025], contrast: 1.1, vignette: .16, grain: .016 }),
  // Stronger: dustier colour, deeper vignette, more grain.
  film: Object.freeze({ saturation: .55, black: [.07, .068, .065], white: [.9, .88, .82], tint: [1.03, 1, .93], shadowTint: [.97, 1, 1.04], contrast: 1.08, vignette: .26, grain: .026 }),
  // The original colours.
  vivid: Object.freeze({ saturation: 1, black: [0, 0, 0], white: [1, 1, 1], tint: [1, 1, 1], shadowTint: [1, 1, 1], contrast: 1, vignette: 0, grain: 0 }),
});
export const GRADE_IDS = Object.freeze(Object.keys(GRADES));
export const DEFAULT_GRADE = 'muted';

// Ordered (Bayer) dither: colours snap to `levels` steps per channel and the
// 4x4 pattern mixes neighbouring steps, like a palette-limited sprite. Text and
// shape edges keep only `alphaLevels` coverage steps on the caption layer.
export const DITHERS = Object.freeze({
  // Tuned against x264 CRF 19: finer patterns are smoothed away by the encoder.
  subtle: Object.freeze({ levels: 20, alphaLevels: 4 }),
  crunchy: Object.freeze({ levels: 10, alphaLevels: 3 }),
  off: null,
});
export const DITHER_IDS = Object.freeze(Object.keys(DITHERS));
export const DEFAULT_DITHER = 'subtle';
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// Pattern cells grow with the frame (2 px at 1080p) so video compression keeps them.
export const ditherScale = (width, height) => Math.max(1, Math.round(Math.min(width, height) / 540));
const threshold = (x, y, scale) => (BAYER[(Math.floor(y / scale) % 4) * 4 + Math.floor(x / scale) % 4] + .5) / 16 - .5;
const snap = (value, levels, t) => Math.min(1, Math.max(0, Math.floor(value * levels + t + .5) / levels));

// CPU version of the same dither, for 2D overlays (captions). The canvas is
// top-down while WebGL counts rows bottom-up, so rows are flipped to keep the
// caption pattern locked to the stage's pattern.
// Only rows top..bottom are processed (the caption band), which keeps it cheap.
export function ditherCanvas(ctx, width, height, id = DEFAULT_DITHER, top = 0, bottom = height) {
  const preset = DITHERS[id];
  if (!preset) return;
  top = Math.max(0, Math.floor(top)); bottom = Math.min(height, Math.ceil(bottom));
  if (bottom <= top) return;
  const image = ctx.getImageData(0, top, width, bottom - top), d = image.data, scale = ditherScale(width, height);
  for (let y = top; y < bottom; y++) for (let x = 0; x < width; x++) {
    const i = ((y - top) * width + x) * 4;
    if (!d[i + 3]) continue;
    const t = threshold(x, height - 1 - y, scale);
    const alpha = snap(d[i + 3] / 255, preset.alphaLevels, t);
    d[i + 3] = Math.round(alpha * 255);
    if (!alpha) continue;
    for (let c = 0; c < 3; c++) d[i + c] = Math.round(snap(d[i + c] / 255, preset.levels, t) * 255);
  }
  ctx.putImageData(image, 0, top);
}

// Single-pass dither for flat 2D layers drawn straight to the screen (the end
// card): the same pattern as the stage, with no offscreen buffer or second pass.
export function createFlatDitherMaterial(map, width, height, id = DEFAULT_DITHER) {
  const preset = DITHERS[id];
  if (!preset) return null;
  return new THREE.ShaderMaterial({
    name: `flat-dither-${id}`,
    uniforms: { map: { value: map }, levels: { value: preset.levels }, ditherScale: { value: ditherScale(width, height) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D map; uniform float levels, ditherScale; varying vec2 vUv;
      float bayer(vec2 p) { int i = int(mod(p.y, 4.0)) * 4 + int(mod(p.x, 4.0));
        ${BAYER.map((v, i) => `${i ? 'else ' : ''}if (i == ${i}) return ${v.toFixed(1)};`).join(' ')} return 0.0; }
      void main() {
        vec3 c = clamp(linearToOutputTexel(texture2D(map, vUv)).rgb, 0.0, 1.0);
        float t = (bayer(floor(gl_FragCoord.xy / ditherScale)) + .5) / 16.0 - .5;
        gl_FragColor = vec4(floor(c * levels + t + .5) / levels, 1.0);
      }`,
    toneMapped: false,
  });
}

// Compile the optional treatment out entirely when Off, preserving the old
// fragment workload on software/mobile GPUs as well as the original picture.
const fragmentShader = cartoon => `
uniform sampler2D tScene;
uniform float saturation, contrast, vignette, grain, frame, applyLook, levels, ditherScale;
uniform vec3 black, white, tint, shadowTint;
uniform vec2 resolution;
varying vec2 vUv;
${cartoon ? DIGITAL_GLSL : ''}
float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
float bayer(vec2 p) {
  int i = int(mod(p.y, 4.0)) * 4 + int(mod(p.x, 4.0));
  ${BAYER.map((v, i) => `${i ? 'else ' : ''}if (i == ${i}) return ${v.toFixed(1)};`).join(' ')}
  return 0.0;
}
void main() {
  ${cartoon ? 'vec2 sampleUV=(floor(vUv*resolution/cartoonPixels)+.5)*cartoonPixels/resolution;\n  vec3 c = texture2D(tScene, sampleUV).rgb;' : 'vec3 c = texture2D(tScene, vUv).rgb;'}
  #ifdef TONE_MAPPING
  if (applyLook > .5) c = toneMapping(c);
  #endif
  c = clamp(linearToOutputTexel(vec4(c, 1.0)).rgb, 0.0, 1.0);
  if (applyLook > .5) {
    float luma = dot(c, vec3(.2126, .7152, .0722));
    c = mix(vec3(luma), c, saturation);                       // pull colour back
    c = (c - .5) * contrast + .5;                             // gentle contrast
    c *= mix(shadowTint, tint, smoothstep(.15, .85, luma));   // cool shadows, drab warm highlights
    c = mix(black, white, clamp(c, 0.0, 1.0));                // lifted blacks, soft whites
    vec2 d = vUv - .5; d.x *= resolution.x / resolution.y;
    c *= 1.0 - vignette * smoothstep(.35, 1.05, length(d) * 1.3);
    c += (hash(vUv * resolution + frame * 17.0) - .5) * grain;
  }
  ${cartoon ? 'if(applyLook>.5)c=digitalCartoon(c,sampleUV);' : ''}
  if (levels > 0.0${cartoon ? ' && applyLook<.5' : ''}) {
    float t = (bayer(floor(gl_FragCoord.xy / ditherScale)) + .5) / 16.0 - .5;
    c = floor(clamp(c, 0.0, 1.0) * levels + t + .5) / levels;
  }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export function createGrade(renderer, width, height, { grade: id = DEFAULT_GRADE, dither = DEFAULT_DITHER, cartoon, renderQuality } = {}) {
  if (!GRADE_IDS.includes(id)) throw new Error(`Unknown grade: ${id}`);
  if (!DITHER_IDS.includes(dither)) throw new Error(`Unknown dither: ${dither}`);
  const preset = GRADES[id], pattern = DITHERS[dither],quality=renderSettings({renderQuality}),style=cartoonSettings(cartoon,width,height);
  // Original bright look with no dither: draw directly, exactly as before.
  if (id === 'vivid' && !pattern && !style.enabled && quality.scale===1) return { id, dither, render: (scene, camera) => renderer.render(scene, camera), dispose() {} };
  const gl = renderer.getContext();
  // HDR buffer keeps highlights for tone mapping; multisampled to keep edges smooth.
  const halfFloat = renderer.capabilities.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
  const renderWidth=Math.ceil(width*quality.scale),renderHeight=Math.ceil(height*quality.scale);
  const limit=Math.min(renderer.capabilities.maxTextureSize,gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
  if(Math.max(renderWidth,renderHeight,quality.shadowSize)>limit)throw Error(`Render quality ${quality.quality} exceeds this GPU's ${limit}px buffer limit. Choose a lower quality or use local Blender CPU.`);
  const target = new THREE.WebGLRenderTarget(renderWidth, renderHeight, {
    type: halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
    samples: Math.min(4, gl.getParameter?.(gl.MAX_SAMPLES) ?? 4),
    colorSpace: THREE.LinearSRGBColorSpace,
  });
  const material = new THREE.ShaderMaterial({
    name: `grade-${id}-${dither}`,
    uniforms: {
      tScene: { value: target.texture }, frame: { value: 0 }, resolution: { value: new THREE.Vector2(width, height) },
      cartoonEnabled:{value:style.enabled?1:0},cartoonPixels:{value:style.pixels},cartoonOutline:{value:style.outline},cartoonShades:{value:style.shades},
      applyLook: { value: 1 }, levels: { value: pattern?.levels ?? 0 }, ditherScale: { value: ditherScale(width, height) },
      ...Object.fromEntries(Object.entries(preset).map(([k, v]) => [k, { value: k==='grain'&&style.enabled?0:Array.isArray(v) ? new THREE.Vector3(...v) : v }])),
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader:fragmentShader(style.enabled), depthTest: false, depthWrite: false, toneMapped: true,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  // The quad is drawn on its own (not inside a Scene), so the stage stays the
  // only Scene rendered per frame for anything observing scene renders.
  const passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  // look=false (end card): no tone mapping or grade, only the dither.
  let allocationChecked=false;
  const allocationError=()=>new Error(`Cannot allocate ${quality.quality} render buffers on this GPU. Choose a lower quality or use local Blender CPU.`);
  function render(scene, camera, frame = 0, { look = true } = {}) {
    const previous = renderer.getRenderTarget();
    // A canvas can be reused after encoder fallback. Errors from the disposed
    // renderer are sticky; bound this probe to the new allocation/render work.
    if(!allocationChecked)for(let i=0;i<16;i++){
      const error=gl.getError();
      if(error===gl.NO_ERROR)break;
      if(error===gl.CONTEXT_LOST_WEBGL)throw Error('WebGL context lost before frame rendering');
    }
    try {
      renderer.setRenderTarget(target);
      if(!allocationChecked&&gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw allocationError();
      renderer.clear(); renderer.render(scene, camera);
      if(!allocationChecked){
        const error=gl.getError();
        if(error===gl.OUT_OF_MEMORY)throw allocationError();
        if(error!==gl.NO_ERROR)throw Error(`WebGL frame rendering failed (0x${error.toString(16)}). Try local Blender CPU.`);
        allocationChecked=true;
      }
    } finally {renderer.setRenderTarget(previous);}
    material.uniforms.frame.value = frame % 997;
    material.uniforms.applyLook.value = look ? 1 : 0;
    renderer.render(quad, passCamera);
  }
  function dispose() { target.dispose(); material.dispose(); quad.geometry.dispose(); }
  return { id, dither, render, dispose, preset };
}
