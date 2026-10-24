// Absolute-time, seeded cursor-like jumps. Restore the rig before sampling.
// Chaotic limbs deliberately overextend; hand-held props retain IK ownership.
// Portable copy: goosnav-3D-assets/exports/theatre-gestures.mjs.
export const gestures = Object.freeze({
  cry: Object.freeze({ arms: true }),
  head_spin: Object.freeze({ arms: false }),
  head_jerk: Object.freeze({ arms: false }),
  arm_flail: Object.freeze({ arms: true }),
  fist_shake: Object.freeze({ arms: true }),
  double_point: Object.freeze({ arms: true }),
  despair: Object.freeze({ arms: true }),
  windmill: Object.freeze({ arms: true }),
  rubber_hose: Object.freeze({ arms: true }),
  snap_pose: Object.freeze({ arms: true }),
});
export const ARM_GESTURES = Object.freeze(['explain', 'shrug', 'point', 'offer', ...Object.keys(gestures).filter(id => gestures[id].arms)]);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease = v => { const x = clamp(v, 0, 1); return x * x * (3 - 2 * x); };
// Integer hash in [-1, 1]: the same (step, channel, seed) always gives the same value.
const yankAt = (step, channel, seed) => {
  let n = Math.imul((step ^ (seed >>> 0)) + channel * 374761393, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295 * 2 - 1;
};
export function sampleGesture(opts = {}) {
  const { gesture = 'none', time = 0, start = 0, duration = 0, seed = 0, amplitude = 1, attack = .025, release = 0 } = opts;
  const result = { upper_armL: [0,0,0], forearmL: [0,0,0], upper_armR: [0,0,0], forearmR: [0,0,0], chest: [0,0,0], head: [0,0,0] };
  if (!Object.hasOwn(gestures, gesture) || ![time,start,duration].every(Number.isFinite) || duration <= 0) return result;
  const age = time - start;
  if (!Number.isFinite(age) || age <= 0 || age >= duration) return result;
  const ramp = (v, fallback) => Number.isFinite(v) && v > 0 ? v : fallback;
  const weight = (Number.isFinite(amplitude) ? clamp(amplitude, 0, 2) : 0) *
    ease(age / ramp(attack, .025)) * (Number.isFinite(release) && release > 0 ? ease((duration - age) / release) : 1);
  // Modulo before multiplication keeps even extreme finite inputs finite.
  const phase = (Math.floor((age % (Math.PI * 2)) * 24) / 24) * 26 + ((seed >>> 0) % 997) / 997 * Math.PI * 2;
  const wave = Math.sin(phase), slow = Math.sin(phase * .5);
  const tick = Math.floor((age % 60) * 24);
  const wild = ['arm_flail','windmill','rubber_hose','fist_shake'].includes(gesture);
  const yank = channel => {
    let n = Math.imul((tick ^ (seed >>> 0)) + channel * 374761393, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295 * 2 - 1;
  };
  if (gesture === 'snap_pose') {
    // Posed-ragdoll look: a random pose snaps in and is held for 4 or 8 frames.
    const block = Math.floor(tick / 4), held = yankAt(block, 99, seed) > .2 ? block - 1 : block;
    const r = channel => yankAt(held, channel, seed);
    for (const [side, sign] of [['L',1],['R',-1]]) {
      const k = side === 'L' ? 0 : 6;
      result[`upper_arm${side}`] = [.65 + 2.1 * r(k), .9 * r(k+1), sign * (.8 + .8 * r(k+2))];
      result[`forearm${side}`] = [1.1 + 1.1 * r(k+3), .5 * r(k+4), sign * .4 * r(k+5)];
    }
    result.chest = [.22 * r(20), .3 * r(21), .25 * r(22)];
    result.head = [.4 * r(23), .55 * r(24), .45 * r(25)];
    for (const [bone, xyz] of Object.entries(result)) result[bone] = xyz.map(v => clamp(v * weight, -7.6, 7.6) || 0);
    return result;
  }
  if (gesture === 'head_spin') {result.head[1]=Math.floor((age%60)*15)*Math.PI*.62*weight;return result;}
  if (gesture === 'head_jerk') {result.head=[Math.sin(phase*3)*1.2,Math.sin(phase*7)*2.5,Math.sin(phase*11)*1.4].map(v=>v*weight);return result;}
  for (const [side, sign] of [['L',1],['R',-1]]) {
    const w = Math.sin(phase + (side === 'L' ? 0 : 1.7));
    if (gesture === 'arm_flail') {
      result[`upper_arm${side}`] = [1.2 + 1.2 * w, 1.1 * slow, sign * (1.1 + 1.1 * Math.cos(phase))];
      result[`forearm${side}`] = [1.2 + 1.1 * Math.sin(phase + 1), 0, sign * .25 * w];
    } else if (gesture === 'cry') {
      result[`upper_arm${side}`] = [1.8 + .22*w, sign*.25, sign*.18];
      result[`forearm${side}`] = [2.1 + .25*w, 0, sign*.25];
    } else if (gesture === 'fist_shake') {
      result[`upper_arm${side}`] = [side === 'R' ? 1.3 + .8 * w : .15, 0, sign * .22];
      result[`forearm${side}`] = [side === 'R' ? 1.4 + .9 * w : .3, 0, 0];
    } else if (gesture === 'double_point') {
      result[`upper_arm${side}`] = [1.25 + .18 * wave, sign * .15, sign * .3];
      result[`forearm${side}`] = [.18 + .12 * wave, 0, 0];
    } else if (gesture === 'windmill') {
      // Stepped windmill poses intentionally jump between frames.
      result[`upper_arm${side}`] = [2.2 * Math.sin(phase * .5 + sign * .8), .3 * w, sign * 2.2 * Math.cos(phase * .5 + sign * .8)];
      result[`forearm${side}`] = [.3 + .2 * w, sign * .25 * slow, 0];
    } else if (gesture === 'rubber_hose') {
      // Phase-lagged joints create a noodle-like wave without deforming the rig.
      result[`upper_arm${side}`] = [.55 + .65 * Math.sin(phase * .5 + sign), sign * .4 * w, sign * (.6 + .35 * slow)];
      result[`forearm${side}`] = [1 + .9 * Math.sin(phase * .5 + sign - 1.2), .4 * Math.cos(phase + sign), sign * .6 * w];
    } else {
      result[`upper_arm${side}`] = [1.6 + .1 * slow, 0, sign * .35];
      result[`forearm${side}`] = [1.8 + .1 * wave, 0, sign * .12];
    }
  }
  result.chest = gesture === 'despair' ? [.22,0,.06 * slow] : [.08 * wave,.1 * slow,.12 * wave];
  result.head = gesture === 'despair' ? [.3,0,.08 * slow] : [.1 * slow,.12 * wave,.2 * slow];
  if (wild) {
    for (const [side, sign] of [['L',1],['R',-1]]) {
      const k = side === 'L' ? 1 : 8;
      const strength=gesture==='fist_shake' && side==='L' ? .15 : 1;
      result[`upper_arm${side}`] = result[`upper_arm${side}`].map((v,j)=>v*.5+strength*yank(k+j)*[2.8,2.6,2.5][j]);
      result[`forearm${side}`] = result[`forearm${side}`].map((v,j)=>v*.5+strength*yank(k+3+j)*[2.9,1.8,1.6][j]);
    }
    result.chest = [yank(20)*.32,yank(21)*.38,yank(22)*.42];
    result.head = [yank(23)*.6,yank(24)*.8,yank(25)*.65];
  }
  for (const [bone, xyz] of Object.entries(result)) {
    const bound = bone === 'head' || bone === 'chest' ? (wild ? 1.6 : .5) : 7.6;
    result[bone] = xyz.map(v => clamp(v * weight, -bound, bound) || 0);
  }
  return result;
}
