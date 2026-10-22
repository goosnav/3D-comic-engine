/**
 * PURPOSE Sample exaggerated gestures as bounded, rest-relative bone offsets.
 * KIND CORE
 * CONTRACT IN: optional gesture ID, absolute time/start/duration, seed, amplitude,
 * attack and release seconds. OUT: fresh named [x,y,z] Euler-offset arrays.
 * RAISES No intentional errors for unsupported IDs or invalid numeric timing;
 * those inputs return rest offsets. Callers must pass an options object.
 * GUARANTEES Pure, deterministic, no I/O, no accumulation or input mutation.
 * TUNING Amplitude 0..2, arm limit 2.6 radians, head/chest .5 radians.
 * DECISIONS D1: authored waves rather than the alternative of physics/ragdolls
 * provide repeatable seeking and bounded motion. Revisit if: physics becomes a requirement.
 * LIMITS No collision avoidance or prop solving; caller suppresses held arms.
 * TESTBENCH tests/gesture-performance.test.mjs — node --test tests/gesture-performance.test.mjs
 */
/**
 * Reusable gesture performance v1; canonical exports/theatre-gestures.mjs.
 * sampleGesture({gesture='none', time=0, start=0, duration=0, seed=0,
 *   amplitude=1, attack=.18, release=.24}) -> bone-name: [x,y,z] radians.
 * Offsets are relative to rest, not accumulated rotations. Apply once after
 * restoring rest. L/R use the authored handed rig, with opposite lateral signs.
 * Absolute seconds; deterministic, pure, no physics, AI, clock or frame history.
 * Amplitude clamps to [0,2]; each arm component <=2.6 rad, chest/head <=.5 rad.
 * Unknown IDs or invalid/outside timing return zero. Invalid seed becomes zero;
 * invalid amplitude becomes zero; invalid/nonpositive ramps become defaults.
 * Caller must suppress arm gestures when holding a prop (held > .5).
 */
export const gestures = Object.freeze({
  arm_flail: Object.freeze({ arms: true }),
  fist_shake: Object.freeze({ arms: true }),
  double_point: Object.freeze({ arms: true }),
  despair: Object.freeze({ arms: true }),
  windmill: Object.freeze({ arms: true }),
  rubber_hose: Object.freeze({ arms: true }),
});
export const ARM_GESTURES = Object.freeze(['explain', 'shrug', 'point', 'offer', ...Object.keys(gestures)]);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease = v => { const x = clamp(v, 0, 1); return x * x * (3 - 2 * x); };
export function sampleGesture(opts = {}) {
  const { gesture = 'none', time = 0, start = 0, duration = 0, seed = 0, amplitude = 1, attack = .18, release = .24 } = opts;
  const result = { upper_armL: [0,0,0], forearmL: [0,0,0], upper_armR: [0,0,0], forearmR: [0,0,0], chest: [0,0,0], head: [0,0,0] };
  if (!Object.hasOwn(gestures, gesture) || ![time,start,duration].every(Number.isFinite) || duration <= 0) return result;
  const age = time - start;
  if (!Number.isFinite(age) || age <= 0 || age >= duration) return result;
  const ramp = (v, fallback) => Number.isFinite(v) && v > 0 ? v : fallback;
  const weight = (Number.isFinite(amplitude) ? clamp(amplitude, 0, 2) : 0) *
    ease(age / ramp(attack, .18)) * ease((duration - age) / ramp(release, .24));
  // Modulo before multiplication keeps even extreme finite inputs finite.
  const phase = (age % (Math.PI * 2)) * 12 + ((seed >>> 0) % 997) / 997 * Math.PI * 2;
  const wave = Math.sin(phase), slow = Math.sin(phase * .5);
  for (const [side, sign] of [['L',1],['R',-1]]) {
    const w = Math.sin(phase + (side === 'L' ? 0 : 1.7));
    if (gesture === 'arm_flail') {
      result[`upper_arm${side}`] = [1.1 + .8 * w, .35 * slow, sign * (.65 + .65 * Math.cos(phase))];
      result[`forearm${side}`] = [.8 + .7 * Math.sin(phase + 1), 0, sign * .25 * w];
    } else if (gesture === 'fist_shake') {
      result[`upper_arm${side}`] = [side === 'R' ? 1.1 + .2 * w : .15, 0, sign * .22];
      result[`forearm${side}`] = [side === 'R' ? 1.45 + .45 * w : .3, 0, 0];
    } else if (gesture === 'double_point') {
      result[`upper_arm${side}`] = [1.25 + .18 * wave, sign * .15, sign * .3];
      result[`forearm${side}`] = [.18 + .12 * wave, 0, 0];
    } else if (gesture === 'windmill') {
      // Circular Euler excursions, not an accumulating rotation or a wrap jump.
      result[`upper_arm${side}`] = [1.15 * Math.sin(phase * .5 + sign * .8), .3 * w, sign * 1.15 * Math.cos(phase * .5 + sign * .8)];
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
  for (const [bone, xyz] of Object.entries(result)) {
    const bound = bone === 'head' || bone === 'chest' ? .5 : 2.6;
    result[bone] = xyz.map(v => clamp(v * weight, -bound, bound) || 0);
  }
  return result;
}
