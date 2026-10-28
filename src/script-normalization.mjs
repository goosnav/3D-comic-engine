import { CAPTION_DEFAULTS } from './caption-defaults.mjs';
import { DEFAULT_SPEECH_RATE, MIN_SPEECH_RATE, MAX_SPEECH_RATE } from './speech-timing.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const token = value => typeof value === 'string' ? value.trim().toLowerCase().replace(/[\s-]+/g, '_') : null;
const emotionAliases = Object.freeze({ calm: 'neutral', deadpan: 'dry', amused: 'pleased', happy: 'pleased',
  surprised: 'curious', annoyed: 'exasperated', sad: 'concerned', worried: 'concerned' });
const gestureAliases = Object.freeze({ headtilt: 'head_tilt', nodding: 'nod', shrugging: 'shrug',
  look_at_book: 'page_glance', point: 'double_point', pointing: 'double_point' });
const shotAliases = Object.freeze({ closeup: 'close-up', medium_shot: 'medium', wide_shot: 'wide' });
const gazeAliases = Object.freeze({ look_at_book: 'book', look_at_partner: 'partner', look_at_camera: 'camera',
  look_away: 'away', up: 'ceiling' });
const positionAliases = Object.freeze({ upper: 'top', top_quarter: 'top', 'top25%': 'top', lower: 'bottom', bottom_quarter: 'bottom' });
const actionSeconds = Object.freeze({ throw: 1.8, slam: .65, turn: 1.2, open: 1.3, hold: 1, place: 1, close: .9, read: 1 });
const describe = value => {
  if (value === undefined) return '(omitted)';
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
};
function match(value, allowed, aliases = {}) {
  if (allowed.includes(value)) return value;
  const normalized = token(value);
  if (normalized === null) return undefined;
  return allowed.find(item => token(item) === normalized) ??
    (Object.hasOwn(aliases, normalized) && allowed.includes(aliases[normalized]) ? aliases[normalized] : undefined);
}
export function scriptWarnings(script) {
  const warnings = script?.warnings;
  if (warnings === undefined) return [];
  if (!Array.isArray(warnings) || warnings.length > 8192 || warnings.some(item => typeof item !== 'string' || item.length > 1024)) {
    throw new Error('warnings must be an array of at most 8192 correction messages (up to 1024 characters each)');
  }
  return [...new Set(warnings)];
}
export function correctionNote(script) {
  const warnings = scriptWarnings(script);
  return warnings.length ? `Automatic JSON corrections (${warnings.length}):\n${warnings.map(item => `- ${item}`).join('\n')}` : '';
}

/** Repair only optional presentation controls. Never rewrite dialogue, sources,
 * cast IDs, action names, book-state transitions or output dimensions. Both the
 * editor and resolver call this same deterministic pass; the strict contract
 * remains the final authority. The caller's document is never mutated.
 */
export function normalizePresentation(raw, vocabulary, { repair = true } = {}) {
  if (!object(raw)) return raw;
  const warnings = scriptWarnings(raw);
  if (!repair) return raw;
  const script = structuredClone(raw);
  const { emotions, gestures, shots, gazes, grades, dithers, armGestures, actorActions } = vocabulary;
  const seen = new Set(warnings);
  function note(path, before, after, reason) {
    const message = `${path}: ${describe(before)} -> ${describe(after)} (${reason}).`;
    if (!seen.has(message)) { seen.add(message); warnings.push(message); }
  }
  function set(target, key, value, path, reason) {
    if (Object.is(target[key], value)) return;
    note(path, target[key], value, reason);
    if (value === undefined) delete target[key]; else target[key] = value;
  }
  function choice(target, key, allowed, fallback, path, aliases) {
    if (target[key] === undefined) return;
    const value = match(target[key], allowed, aliases);
    set(target, key, value ?? fallback, path, value === undefined ? 'unsupported value; using default' : 'recognized spelling or alias');
  }
  function numeric(target, key, min, max, fallback, path) {
    if (target[key] === undefined) return;
    const before = target[key];
    const value = typeof before === 'number' ? before : typeof before === 'string' && before.trim() ? Number(before) : NaN;
    const valid = Number.isFinite(value);
    set(target, key, valid ? Math.min(max, Math.max(min, value)) : fallback, path,
      !valid ? 'invalid number; using default' : value < min || value > max ? `clamped to ${min}–${max}` : 'converted numeric text');
  }
  function boolean(target, key, fallback, path) {
    if (target[key] === undefined || typeof target[key] === 'boolean') return;
    const value = token(target[key]);
    set(target, key, value === 'true' ? true : value === 'false' ? false : fallback, path, 'normalized boolean');
  }
  function face(target, prefix) {
    if (target.face === undefined) return;
    if (!object(target.face)) { set(target, 'face', {}, `${prefix}.face`, 'invalid face object; using emotion preset'); return; }
    for (const key of ['brow_left', 'brow_right', 'mouth_curve', 'eye_open']) {
      numeric(target.face, key, key === 'eye_open' ? 0 : -1, 1, undefined, `${prefix}.face.${key}`);
    }
    choice(target.face, 'blink', ['auto', 'once', 'off'], 'auto', `${prefix}.face.blink`);
  }
  function performance(target, prefix, heldReader = false) {
    // A common writer mistake is an emotion in the gesture field, or vice versa.
    // Resolve both original values before editing either; valid explicit values win.
    const emotion = match(target.emotion, emotions, emotionAliases);
    const gesture = match(target.gesture, gestures, gestureAliases);
    const misplacedEmotion = match(target.gesture, emotions, emotionAliases);
    const misplacedGesture = match(target.emotion, gestures, gestureAliases);
    if (target.emotion !== undefined || misplacedEmotion !== undefined) {
      set(target, 'emotion', emotion ?? misplacedEmotion ?? 'neutral', `${prefix}.emotion`,
        emotion !== undefined ? 'recognized emotion' : misplacedEmotion !== undefined ? 'emotion supplied in gesture field' : 'unsupported emotion; using neutral');
    }
    if (target.gesture !== undefined || misplacedGesture !== undefined) {
      set(target, 'gesture', gesture ?? misplacedGesture ?? 'none', `${prefix}.gesture`,
        gesture !== undefined ? 'recognized gesture' : misplacedGesture !== undefined ? 'gesture supplied in emotion field' : 'unsupported gesture; using none');
    }
    if (heldReader && armGestures.includes(target.gesture)) {
      set(target, 'gesture', 'none', `${prefix}.gesture`, 'held book reserves the reader hands');
    }
    face(target, prefix);
  }
  function gaze(target, prefix) {
    if (target.gaze === undefined) return;
    if (!object(target.gaze)) { set(target, 'gaze', {}, `${prefix}.gaze`, 'invalid gaze object; using automatic gaze'); return; }
    for (const actor of ['reader', 'friend']) choice(target.gaze, actor, gazes, 'auto', `${prefix}.gaze.${actor}`, gazeAliases);
  }
  numeric(script, 'speechRate', MIN_SPEECH_RATE, MAX_SPEECH_RATE, DEFAULT_SPEECH_RATE, 'speechRate');
  choice(script, 'grade', grades, 'muted', 'grade');
  choice(script, 'dither', dithers, 'subtle', 'dither');
  if (script.captions !== undefined) {
    if (!object(script.captions)) set(script, 'captions', {}, 'captions', 'invalid caption object; using defaults');
    const captions = script.captions;
    boolean(captions, 'enabled', CAPTION_DEFAULTS.enabled, 'captions.enabled');
    choice(captions, 'position', ['top', 'bottom'], CAPTION_DEFAULTS.position, 'captions.position', positionAliases);
    if (captions.colors !== undefined) {
      if (!object(captions.colors)) set(captions, 'colors', {}, 'captions.colors', 'invalid color object; using defaults');
      for (const actor of ['reader', 'friend']) {
        const color = captions.colors[actor];
        if (color === undefined || typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) continue;
        let value = typeof color === 'string' ? color.trim() : '';
        if (/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value)) {
          value = value.replace(/^#/, '');
          if (value.length === 3) value = [...value].map(c => c + c).join('');
          value = '#' + value.toUpperCase();
        } else value = CAPTION_DEFAULTS.colors[actor];
        set(captions.colors, actor, value, `captions.colors.${actor}`, 'normalized color or used speaker default');
      }
    }
  }
  if (object(script.endCard)) {
    numeric(script.endCard, 'seconds', 1, 12, 3, 'endCard.seconds');
    boolean(script.endCard, 'enabled', true, 'endCard.enabled');
  }
  let held = false;
  if (Array.isArray(script.lines) && script.lines.length <= 200) script.lines.forEach((line, index) => {
    if (!object(line)) return;
    const prefix = `lines[${index}]`;
    choice(line, 'shot', shots, 'auto', `${prefix}.shot`, shotAliases);
    gaze(line, prefix);
    if (line.action !== undefined) {
      if (Object.hasOwn(actionSeconds, line.action) || actorActions.includes(line.action)) {
        numeric(line, 'seconds', actorActions.includes(line.action) ? .8 : .3, 8, actionSeconds[line.action] ?? 2.4, `${prefix}.seconds`);
      }
      if (line.action === 'hold') held = true;
      else if (['place', 'throw', 'open', 'close', 'slam'].includes(line.action)) held = false;
      return;
    }
    performance(line, prefix, held && line.speaker === 'reader');
    numeric(line, 'pause', 0, 5, 0, `${prefix}.pause`);
    if (line.reaction !== undefined) {
      if (!object(line.reaction)) { set(line, 'reaction', undefined, `${prefix}.reaction`, 'invalid optional reaction; omitted'); return; }
      const reaction = line.reaction;
      const actor = reaction.actor ?? (line.speaker === 'reader' ? 'friend' : 'reader');
      performance(reaction, `${prefix}.reaction`, held && actor === 'reader');
      choice(reaction, 'gaze', gazes, 'auto', `${prefix}.reaction.gaze`, gazeAliases);
      choice(reaction, 'at', ['line_start', 'line_end'], 'line_start', `${prefix}.reaction.at`);
      numeric(reaction, 'duration', .1, 5, .8, `${prefix}.reaction.duration`);
    }
  });
  if (warnings.length) script.warnings = warnings;
  else delete script.warnings;
  return script;
}
