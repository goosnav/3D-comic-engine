import * as THREE from 'three';

// Colour grading for the 3D stage. The scene renders into an offscreen
// buffer, then one fullscreen pass tone-maps it and grades it in display
// space. Comic page inserts, captions and the end card skip this pass, so the
// printed artwork and the product card are never altered.
//
// Every value is fixed per preset; grain is hashed from the frame number, so
// a frame always renders the same way.
export const GRADES = Object.freeze({
  // Default: slightly drab, faded-print look. Calms saturated costumes.
  muted: Object.freeze({ saturation: .7, black: [.035, .037, .04], white: [.95, .935, .89], tint: [1.015, 1, .955], shadowTint: [.985, 1, 1.025], contrast: 1.1, vignette: .16, grain: .016 }),
  // Stronger: dustier colour, deeper vignette, more grain.
  film: Object.freeze({ saturation: .55, black: [.07, .068, .065], white: [.9, .88, .82], tint: [1.03, 1, .93], shadowTint: [.97, 1, 1.04], contrast: 1.08, vignette: .26, grain: .026 }),
  // The original ungraded look.
  vivid: null,
});
export const GRADE_IDS = Object.freeze(Object.keys(GRADES));
export const DEFAULT_GRADE = 'muted';

const fragmentShader = `
uniform sampler2D tScene;
uniform float saturation, contrast, vignette, grain, frame;
uniform vec3 black, white, tint, shadowTint;
uniform vec2 resolution;
varying vec2 vUv;
float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
void main() {
  gl_FragColor = texture2D(tScene, vUv);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  vec3 c = clamp(gl_FragColor.rgb, 0.0, 1.0);
  float luma = dot(c, vec3(.2126, .7152, .0722));
  c = mix(vec3(luma), c, saturation);                       // pull colour back
  c = (c - .5) * contrast + .5;                             // gentle contrast
  c *= mix(shadowTint, tint, smoothstep(.15, .85, luma));   // cool shadows, drab warm highlights
  c = mix(black, white, clamp(c, 0.0, 1.0));                // lifted blacks, soft whites
  vec2 d = vUv - .5; d.x *= resolution.x / resolution.y;
  c *= 1.0 - vignette * smoothstep(.35, 1.05, length(d) * 1.3);
  c += (hash(vUv * resolution + frame * 17.0) - .5) * grain;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export function createGrade(renderer, width, height, id = DEFAULT_GRADE) {
  if (!GRADE_IDS.includes(id)) throw new Error(`Unknown grade: ${id}`);
  const preset = GRADES[id];
  if (!preset) return { id, render: (scene, camera) => renderer.render(scene, camera), dispose() {} };
  const gl = renderer.getContext();
  // HDR buffer keeps highlights for tone mapping; multisampled to keep edges smooth.
  const halfFloat = renderer.capabilities.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
  const target = new THREE.WebGLRenderTarget(width, height, {
    type: halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
    samples: Math.min(4, gl.getParameter?.(gl.MAX_SAMPLES) ?? 4),
    colorSpace: THREE.LinearSRGBColorSpace,
  });
  const material = new THREE.ShaderMaterial({
    name: `grade-${id}`,
    uniforms: {
      tScene: { value: target.texture }, frame: { value: 0 }, resolution: { value: new THREE.Vector2(width, height) },
      ...Object.fromEntries(Object.entries(preset).map(([k, v]) => [k, { value: Array.isArray(v) ? new THREE.Vector3(...v) : v }])),
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader, depthTest: false, depthWrite: false, toneMapped: true,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  // The quad is drawn on its own (not inside a Scene), so the stage stays the
  // only Scene rendered per frame for anything observing scene renders.
  const passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  function render(scene, camera, frame = 0) {
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera);
    renderer.setRenderTarget(previous);
    material.uniforms.frame.value = frame % 997;
    renderer.render(quad, passCamera);
  }
  function dispose() { target.dispose(); material.dispose(); quad.geometry.dispose(); }
  return { id, render, dispose, preset };
}
