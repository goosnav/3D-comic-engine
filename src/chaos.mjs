// Seeded chaos director: a complete, valid script from a seed, with no writer
// model. The same seed and catalog always produce the same script. Films follow
// a loose arc (calm setup, escalation, a pile-up of stunts, deadpan aftermath)
// so random beats still read as a scene instead of noise.
import {seeded, resolveScript, ACTOR_ACTIONS, PARTNER_ACTIONS} from './contracts.mjs';

export const INTENSITIES = Object.freeze(['mild', 'wild', 'unhinged']);
const HEAD_GESTURES = ['none', 'nod', 'head_tilt', 'page_glance', 'head_jerk', 'head_spin'];

const TITLES = [
  'Nobody Touch The Book', 'An Incident At {place}', 'Please Stop Touching The Universe', 'The Reading Got Out Of Hand',
  'Book Club Is Cancelled', 'This Is Fine, Probably', 'Customer Feedback', 'The Goose Was Not Invited',
  'A Calm Discussion', 'Do Not Read Page {page}', 'We Have Reached An Agreement', 'Physics Was Optional',
  'Literary Criticism', 'A Brief Review', 'Somebody Call Billy', 'The Hat Knows',
];
const PLACES = ['The Library', 'The Diner', 'Book Club', 'The Moon', 'The Basement', 'Work'];
const OPENERS = [
  'Okay. I have read this page.', 'I would like to discuss this comic like an adult.', 'This page changed my life a little.',
  'Everyone be calm. It is just a comic.', 'I brought the book. Nobody panic.', 'Look at this panel. Just look at it.',
  'I have notes on this page.', 'Page {page}. My favourite.', 'This one is very normal and safe.',
  'I read this to my plants. They left.', 'Here is the part I wanted to show you.', 'Hold on. Something is wrong with this page.',
];
const REPLIES = [
  'That is the most reasonable thing in the book.', 'I do not like how it is looking at me.', 'Read it again, slower.',
  'You are holding it upside down.', 'I agree with all of this and none of it.', 'Who approved this.',
  'I am going to need a minute.', 'This explains the noises.', 'That is how they get you.',
  'My lawyer says I cannot comment.', 'I can smell this page.', 'Incredible. Put it down.',
  'I have questions and I want them answered by a professional.', 'No. Absolutely not. Continue.',
];
const ESCALATIONS = [
  'Say that again. I dare you.', 'I am becoming upset in a literary way.', 'You take that back about page {page}.',
  'Something is happening to my arms.', 'I can feel the comic in my bones.', 'Do not make me close this book.',
  'My body is doing things without me.', 'Stand back. I know karate. Comic karate.',
  'I have been reading too hard.', 'Everybody stay where you are.', 'It is the hat. The hat is doing it.',
];
const GOOSE_WARNINGS = ['That is it. I am getting the goose.', 'Is that a goose?', 'Nobody move. The goose can smell fear.', 'Why is there a goose.'];
const AFTERMATH = [
  'Anyway. Great book.', 'Five stars.', 'I think we learned something.', 'Same time next week?',
  'We should probably clean that up.', 'I would read it again.', 'That went well.', 'So. Page {page}.',
  'Nobody saw that.', 'I am fine. Everything is fine.', 'Buy the book. Please.', 'That is literature.',
];
const SOLO = [
  'I am reading this alone, for safety.', 'Nobody else was allowed to see this page.', 'This is a calm private moment.',
  'I have been asked to stop reading aloud. I will not.', 'Page {page}. Again.', 'You would not understand this panel.',
];

const pick = (random, list) => list[Math.floor(random() * list.length)];
const chance = (random, p) => random() < p;
const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

// Physical stunts by how far they go. Partner actions need a second cast member.
const STUNTS = {
  mild: ['head_spin', 'head_jerk', 'nose_off', 'dance', 'big_head', 't_pose', 'high_five', 'handshake', 'nose_touch'],
  wild: ['flatten', 'walk_away', 'ragdoll', 'jitter', 'noclip', 'helicopter', 'goose_chase', 'punch', 'ascend'],
  unhinged: ['explode', 'punch', 'ascend', 'jitter', 'helicopter', 'goose_chase', 'ragdoll', 'noclip'],
};
const STUNT_SECONDS = {t_pose: 2, ragdoll: 2.2, noclip: 2.6, big_head: 2, jitter: 2, helicopter: 2.4, goose_chase: 2.4,
  dance: 1.6, punch: 1, explode: 1.4, flatten: 1.4, walk_away: 2, ascend: 1.8, nose_off: 1.8, head_spin: 1.2,
  head_jerk: 1, nose_touch: 1.2, high_five: 1, handshake: 1.2};
const CALM = ['neutral', 'thoughtful', 'curious', 'dry', 'skeptical', 'pleased'];
const HOT = ['exasperated', 'angry', 'panicked', 'manic', 'furious', 'concerned'];
const FRENZY = ['cosmic_rage', 'brain_static', 'overclocked'];
const CALM_GESTURES = ['none', 'explain', 'nod', 'head_tilt', 'shrug', 'page_glance', 'double_point'];
const HOT_GESTURES = ['arm_flail', 'fist_shake', 'windmill', 'rubber_hose', 'snap_pose', 'despair', 'cry', 'head_jerk'];

export function generateChaos(catalog, {seed = 0, template, intensity = 'wild', characters, scene, extras} = {}) {
  if (!INTENSITIES.includes(intensity)) throw new Error(`intensity: choose ${INTENSITIES.join(', ')}`);
  const random = seeded((seed ^ 0xc4a05) >>> 0);
  const level = INTENSITIES.indexOf(intensity);
  const templates = catalog.templates.map(t => t.id);
  const templateId = template ?? pick(random, ['book-duet', 'book-duet', 'book-duet', 'page-tour', 'page-tour', 'fireside-reader'].filter(id => templates.includes(id)));
  const t = catalog.templates.find(item => item.id === templateId);
  if (!t) throw new Error(`template: choose ${templates.join(', ')}`);
  const duet = t.speakers.length > 1;

  // Pages: distinct verified comics.
  const pool = catalog.comics.filter(c => c.verified && (!c.kind || c.kind === 'comic'));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const count = t.minComics + Math.floor(random() * (t.maxComics - t.minComics + 1));
  const comics = pool.slice(0, count).map(c => c.id);

  // Cast: favour the comic cast a little so they turn up often.
  const variants = catalog.variants?.map(v => v.id) ?? ['blue', 'rust', 'olive'];
  const favourites = variants.filter(id => ['billy', 'gooby'].includes(id));
  const chooseVariant = taken => {
    const options = [...variants, ...favourites, ...favourites].filter(id => id !== taken);
    return pick(random, options.length ? options : variants);
  };
  const cast = {};
  for (const id of t.speakers) cast[id] = characters?.[id] ?? chooseVariant(Object.values(cast)[0]);
  const allowed = t.scenes.filter(s => t.speakers.every(id => {
    const v = catalog.variants?.find(item => item.id === cast[id]);
    return !v?.allowedScenes || v.allowedScenes.includes(s);
  }));
  const sceneId = scene ?? pick(random, allowed.length ? allowed : t.scenes);

  const cameos = catalog.extras?.map(e => e.id) ?? [];
  let extraList = extras ?? [];
  if (!extras && cameos.length) {
    if (cameos.includes('goose') && chance(random, .55 + level * .15)) extraList.push('goose');
    const others = cameos.filter(id => id !== 'goose');
    if (others.length && chance(random, .35 + level * .15)) extraList.push(pick(random, others));
  }
  extraList = [...new Set(extraList)];

  const vars = () => ({page: catalog.comics.find(c => c.id === comics[0])?.pdfPage - 2 || 1, place: pick(random, PLACES)});
  const other = id => t.speakers.find(s => s !== id) ?? id;
  const lines = [];
  let speaker = t.speakers[Math.floor(random() * t.speakers.length)], held = false, closed = false, current = comics[0];
  const used = new Set(), spoken = new Set();
  const unread = () => comics.filter(c => !used.has(c));
  const say = (bank, mood, {gestures = CALM_GESTURES, shot, cut = false} = {}) => {
    const fresh = bank.filter(text => !spoken.has(text));
    const text = pick(random, fresh.length ? fresh : bank); spoken.add(text);
    const line = {speaker, text: fill(text, vars())};
    // Page tours cut to the next unread comic, only with the book on the table.
    if (!used.size) line.comic = current;
    else if (!held && unread().length && (cut || chance(random, .6))) line.comic = current = unread()[0];
    used.add(current);
    line.emotion = pick(random, mood);
    let gesture = pick(random, gestures);
    if (held && speaker === 'reader' && !HEAD_GESTURES.includes(gesture)) gesture = pick(random, HEAD_GESTURES);
    if (gesture !== 'none') line.gesture = gesture;
    if (shot) line.shot = shot;
    if (duet && chance(random, .3 + level * .1)) {
      const actor = other(speaker);
      let reactionGesture = pick(random, mood === CALM ? CALM_GESTURES : HOT_GESTURES);
      if (held && actor === 'reader' && !HEAD_GESTURES.includes(reactionGesture)) reactionGesture = 'head_jerk';
      line.reaction = {actor, emotion: pick(random, mood === CALM ? ['skeptical', 'concerned', 'curious', 'dry'] : HOT), gesture: reactionGesture,
        at: chance(random, .5) ? 'line_end' : 'line_start', duration: Math.round((.6 + random() * .9) * 10) / 10};
    }
    lines.push(line);
    if (duet) speaker = chance(random, .8) ? other(speaker) : speaker;
  };
  const book = action => {
    lines.push({action});
    if (action === 'hold') held = true;
    if (action === 'place' || action === 'throw') held = false;
    closed = ['close', 'slam', 'throw'].includes(action);
  };
  const stunt = (tier) => {
    if (held) book(chance(random, .25 + level * .2) ? 'throw' : 'place');
    if (closed) book('open');
    const options = STUNTS[tier].filter(a => ACTOR_ACTIONS.includes(a) && (duet || !PARTNER_ACTIONS.includes(a)) && (a !== 'goose_chase' || cameos.includes('goose')));
    const action = pick(random, options);
    const actor = pick(random, t.speakers);
    if (action === 'goose_chase' && chance(random, .6)) { speaker = other(actor); say(GOOSE_WARNINGS, HOT, {gestures: ['double_point', 'arm_flail', 'none']}); }
    const beat = {action, actor, seconds: STUNT_SECONDS[action] ?? 1.6};
    if (PARTNER_ACTIONS.includes(action)) beat.target = other(actor);
    beat.shot = ['punch', 'explode', 'ascend', 'helicopter', 'jitter', 'noclip', 'goose_chase'].includes(action)
      ? pick(random, ['wide', 'wide', 'extreme-wide', 'two-shot']) : pick(random, ['two-shot', 'medium', 'wide']);
    if (!duet && beat.shot === 'two-shot') beat.shot = 'medium';
    lines.push(beat);
  };

  // 1. Setup: calm talk about the page, sometimes with the book in hand.
  if (chance(random, .3)) { lines.push({action: 'open', comic: comics[0]}); }
  say(duet ? OPENERS : [...OPENERS, ...SOLO], CALM, {shot: pick(random, ['auto', 'medium', 'two-shot', 'close-up'])});
  if (chance(random, .35) && !held) { book('hold'); if (chance(random, .5)) book('read'); }
  say(duet ? REPLIES : SOLO, CALM);
  // 2. Escalation: emotions heat up and small stunts creep in.
  const escalation = 2 + level + Math.floor(random() * 2);
  for (let i = 0; i < escalation; i++) {
    if (chance(random, .45)) stunt(i === 0 || level === 0 ? 'mild' : pick(random, ['mild', 'wild']));
    say(ESCALATIONS, i < 1 ? HOT : [...HOT, ...(level ? FRENZY : [])], {gestures: HOT_GESTURES, shot: pick(random, ['auto', 'close-up', 'medium'])});
  }
  // 3. Pile-up: stunts back to back.
  const pile = 1 + level + Math.floor(random() * 2);
  for (let i = 0; i < pile; i++) stunt(level === 2 && i === pile - 1 ? 'unhinged' : pick(random, level ? ['wild', 'unhinged'] : ['mild', 'wild']));
  if (level && chance(random, .5)) { if (held) book('place'); if (closed) book('open'); book(chance(random, .5) ? 'slam' : 'close'); book('open'); }
  // Every selected page needs a line; give any page not reached yet a reply.
  if (held) book('place');
  while (unread().length) say(REPLIES, HOT, {gestures: HOT_GESTURES, cut: true});
  // 4. Aftermath: deadpan, as if nothing happened.
  if (closed) book('open');
  say(AFTERMATH, ['dry', 'neutral', 'pleased', 'thoughtful'], {shot: pick(random, ['extreme-wide', 'wide', 'two-shot', 'medium']), gestures: ['none', 'nod', 'shrug']});

  const title = fill(pick(random, TITLES), vars());
  const raw = {
    version: 1, template: t.id, title, comics, seed, scene: sceneId,
    characters: cast, ...(extraList.length ? {extras: extraList} : {}),
    lines,
  };
  // The contract is the judge: anything it rejects is a generator bug.
  resolveScript(raw, catalog);
  return raw;
}
