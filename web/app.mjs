import { EMOTIONS, GESTURES, GAZES, ACTIONS, ACTOR_ACTIONS, PARTNER_ACTIONS, OUTPUT_PRESETS, repairScript } from '../src/contracts.mjs';
import { editorDefaults } from '../src/editor-defaults.mjs';
import { comicReplacements, replaceComic, randomComic } from '../src/editor-selection.mjs';
import { createBatchUI } from './batch.mjs';
import { captionDefaults } from '../src/caption-defaults.mjs';
import { appendGeneratorNotes } from './generator-notes.mjs';
import { DEFAULT_SPEECH_RATE, MIN_SPEECH_RATE, MAX_SPEECH_RATE } from '../src/speech-timing.mjs';

const $ = id => document.getElementById(id);
const browserMode=document.querySelector('meta[name="theatre-runtime"]')?.content==='browser';
let browserAPI;
const draftKey='comic-theatre-editor-v1';
let draftSaved = true;
function saveDraft(text) {
  try { localStorage.setItem(draftKey, text); draftSaved = true; }
  catch { draftSaved = false; }
  $('draft-status').textContent = draftSaved ? 'Draft saved on this device' : 'Draft not saved · download JSON';
  if (!draftSaved) $('storage-status').textContent = 'Browser storage is unavailable or full. Download JSON to keep your work.';
  else if ($('storage-status').textContent.startsWith('Browser storage')) $('storage-status').textContent = '';
}
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const state = { catalog: null, script: null, pageRows: [''], token: null, dirtyJSON: false, revision: 0, operation: 0, busy: false, connecting: false, polling: false };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => structuredClone(value);
const stringify = value => JSON.stringify(value, null, 2);
const historyKey = 'comic-theatre-history-v1';
let history = [], historyReady = false, historyWritable = true;
try {
  const saved = JSON.parse(localStorage.getItem(historyKey) ?? '[]');
  if (!Array.isArray(saved) || saved.some(item => !object(item) || typeof item.text !== 'string' || typeof item.date !== 'string')) throw Error('Invalid history');
  history = saved.slice(0, 20);
} catch {
  historyWritable = false;
  $('storage-status').textContent = 'Recent versions could not be read. Download JSON to keep your work.';
}
function rememberVersion() {
  if (!historyReady || !state.script || !historyWritable) return;
  if (!state.dirtyJSON && stringify(state.script) === stringify(editorDefaults(state.catalog, state.script.template).script)) return;
  const text = $('script-json').value;
  if (!text || history[0]?.text === text) return;
  const entry = { text, date: new Date().toISOString(), title: state.script.title || 'Untitled reading', unapplied: state.dirtyJSON };
  const next = [entry, ...history.filter(item => item.text !== text)].slice(0, 20);
  // Keep snapshots small enough to coexist with the draft and batch library.
  while (next.length > 1 && JSON.stringify(next).length > 1000000) next.pop();
  try {
    if (JSON.stringify(next).length > 1000000) throw Error('Snapshot too large');
    localStorage.setItem(historyKey, JSON.stringify(next));
    history = next;
  } catch { $('storage-status').textContent = 'Recent version could not be saved. Download JSON to keep a copy.'; }
  renderHistory();
}
function renderHistory() {
  $('recent-list').replaceChildren();
  $('recent-empty').hidden = history.length > 0;
  for (const entry of history) {
    const row = el('li'), detail = el('div');
    detail.append(el('strong', String(entry.title || 'Untitled reading')),
      el('p', `${new Date(entry.date).toLocaleString()}${entry.unapplied ? ' · Unapplied JSON' : ''}`, 'muted'));
    const open = el('button', 'Reopen'); open.type = 'button';
    open.disabled = !state.catalog;
    open.setAttribute('aria-label', `Reopen ${entry.title || 'Untitled reading'}`);
    open.addEventListener('click', () => {
      if (!confirmReplacement('Reopen this version')) return;
      rememberVersion(); state.operation++; state.busy = false;
      try {
        if (entry.unapplied) throw Error('Unapplied JSON');
        install(JSON.parse(entry.text)); showView('editor');
        message('Version reopened.' + repairSummary());
      } catch {
        $('script-json').value = entry.text; state.dirtyJSON = true; state.revision++;
        saveDraft(entry.text); controls(); showView('json');
        message('Version reopened in JSON. Apply it when ready.');
      }
    });
    row.append(detail, open); $('recent-list').append(row);
  }
}
const steps = ['scene', 'script', 'export'];
let activeStep = 'scene';
function showView(view, focus = true) {
  if (view === 'editor' && state.dirtyJSON) message('Apply or revert your JSON edits to use the form.');
  for (const node of document.querySelectorAll('[data-view]')) node.hidden = node.dataset.view !== view;
  for (const button of document.querySelectorAll('[data-view-target]')) {
    if (button.dataset.viewTarget === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  if (focus) {
    const target = view === 'editor' ? document.querySelector(`[data-step-target="${activeStep}"]`) : $(`nav-${view}`);
    target.focus(); target.scrollIntoView({ block: 'nearest' });
  }
}
function showStep(step, focus = true) {
  activeStep = step;
  for (const node of document.querySelectorAll('[data-step]')) node.hidden = node.dataset.step !== step;
  for (const button of document.querySelectorAll('[data-step-target]')) {
    if (button.dataset.stepTarget === step) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  }
  const index = steps.indexOf(step);
  $('previous-step').disabled = index === 0;
  $('next-step').hidden = index === steps.length - 1;
  $('next-step').textContent = `Next: ${index === 0 ? 'Script' : 'Export'} →`;
  $('step-position').textContent = `${index + 1} / ${steps.length}`;
  showView('editor', false);
  if (focus) {
    const heading = $(['sources-heading', 'editor-heading', 'output-heading'][index]);
    heading.focus(); heading.scrollIntoView({ block: 'nearest' });
  }
}
for (const button of document.querySelectorAll('[data-view-target]')) button.addEventListener('click', () => { rememberVersion(); showView(button.dataset.viewTarget); });
for (const button of document.querySelectorAll('[data-step-target]')) button.addEventListener('click', () => { rememberVersion(); showStep(button.dataset.stepTarget); });
$('previous-step').addEventListener('click', () => { rememberVersion(); showStep(steps[steps.indexOf(activeStep) - 1]); });
$('next-step').addEventListener('click', () => { rememberVersion(); showStep(steps[steps.indexOf(activeStep) + 1]); });
$('save-version').addEventListener('click', rememberVersion);
window.addEventListener('pagehide', rememberVersion);
const templates = () => state.catalog?.templates ?? [];
const templateFor = script => templates().find(item => item.id === script.template);
const comicFor = id => state.catalog?.comics.find(item => item.id === id);
const characterDefaults = { reader: 'blue', friend: 'rust' };
const endCardDefaults = { enabled: true, title: 'Goosnav Book Two', text: 'A book of comics.', url: 'www.goosnav.shop', seconds: 3 };
const variants = () => state.catalog?.variants ?? ['blue', 'rust', 'olive'].map(id => ({ id, label: id[0].toUpperCase() + id.slice(1) }));
const shots = [
  { id: 'close-up', label: 'Close-up' }, { id: 'medium', label: 'Medium shot' },
  { id: 'wide', label: 'Wide shot' }, { id: 'extreme-wide', label: 'Extremely wide shot' },
  { id: 'auto', label: 'Auto (static)' }, { id: 'speaker', label: 'Speaker' },
  { id: 'two-shot', label: 'Two-shot' }, { id: 'over-shoulder', label: 'Over-shoulder' },
  { id: 'book', label: 'Book' }, { id: 'source', label: 'Source' },
];
const exampleFiles = new Set(['book-duet.example.json', 'fireside.example.json', 'page-tour.example.json', 'astronaut.example.json']);
const uploadInputs = ['upload-json-top', 'upload-json'];
const speechRateInput = el('input');
speechRateInput.id = 'speech-rate'; speechRateInput.type = 'number'; speechRateInput.inputMode = 'decimal';
speechRateInput.min = String(MIN_SPEECH_RATE); speechRateInput.max = String(MAX_SPEECH_RATE); speechRateInput.step = '0.05';
speechRateInput.value = String(DEFAULT_SPEECH_RATE); speechRateInput.disabled = true;
speechRateInput.setAttribute('aria-describedby', 'speech-rate-help');
const speechRateField = field('Speech speed (×)', speechRateInput);
const speechRateHelp = el('p', `Speech only · ${MIN_SPEECH_RATE}–${MAX_SPEECH_RATE}×. Default ${DEFAULT_SPEECH_RATE}×.`, 'hint');
speechRateHelp.id = 'speech-rate-help'; speechRateField.append(speechRateHelp);
$('voice').parentElement.after(speechRateField);
speechRateInput.addEventListener('input', () => {
  if (!state.script || state.dirtyJSON || state.busy) return;
  state.script.speechRate = Number.isFinite(speechRateInput.valueAsNumber) ? speechRateInput.valueAsNumber : null;
  changed();
});
const batchUI = createBatchUI({
  api,
  isReady: () => Boolean(state.token && state.catalog),
  getEditorScript: () => { requireReady(); return clone(state.script); },
  browserMode,
  ownsURL: value => Boolean(browserAPI?.ownsURL(value)),
  localPath,
  onRun: () => { if (browserMode) $('device-canvas').hidden = false; },
});

// The writer changes dialogue, not the author's presentation.
// Keep server-resolved defaults for omitted fields and preserve advanced keys.
function keepPresentation(result, original) {
  const next = clone(result);
  for (const key of ['characters', 'endCard', 'captions']) {
    if (original[key] !== undefined) next[key] = { ...(object(next[key]) ? next[key] : {}), ...clone(original[key]) };
  }
  if (original.product !== undefined) next.product = original.product;
  if (original.speechRate !== undefined) next.speechRate = original.speechRate;
  return next;
}

function repairSummary() {
  const count = state.script?.warnings?.length ?? 0;
  return count ? ` ${count} automatic corrections recorded in JSON and generator notes.` : '';
}
function message(text, error = false) {
  for (const id of ['editor-status', 'start-status']) {
    $(id).textContent = text;
    $(id).classList.toggle('error', error);
  }
}
function controls() {
  const paused = !state.script || state.dirtyJSON;
  $('source-fields').disabled = paused;
  $('author-fields').disabled = paused;
  $('title').disabled = paused;
  $('save-version').disabled = !state.script;
  $('script-json').disabled = !state.script;
  $('speech-rate').disabled = paused || state.busy;
  $('nav-json').textContent = state.dirtyJSON ? '{ } JSON •' : '{ } JSON';
  $('json-state').textContent = state.dirtyJSON ? 'Unapplied edits · form paused' : 'In sync';
  for (const button of document.querySelectorAll('[data-post]')) button.disabled = state.busy;
  $('new-video').disabled = !state.catalog;
  $('example-script').disabled = paused || state.busy;
  $('load-example').disabled = paused || state.busy;
  $('chaos-intensity').disabled = $('generate-chaos').disabled = !state.catalog || state.busy || state.dirtyJSON;
  for (const id of uploadInputs) $(id).disabled = !state.catalog;
  for (const button of document.querySelectorAll('#recent-list button')) button.disabled = !state.catalog;
  batchUI.controls();
}
function requireReady() {
  if (!state.token || !state.catalog || !state.script) throw new Error('Connect to the local theatre first. Use Retry connection.');
  if (state.dirtyJSON) throw new Error('Apply JSON or Revert JSON before continuing. Your unapplied edits have been kept.');
}
function syncJSON() { $('script-json').value = stringify(state.script); saveDraft($('script-json').value); state.dirtyJSON = false; controls(); }
function changed() { state.revision++; syncJSON(); renderSelection(); }

// Asset and output links must remain under their local allowlisted route. Never
// assign catalog/job strings directly as a URL (including protocol-relative URLs).
function localPath(value, prefix) {
  if (typeof value !== 'string') return null;
  try {
    const path = decodeURIComponent(value.startsWith('/') ? value : `/${value}`);
    if (!path.startsWith(prefix) || /[\\\u0000-\u001f\u007f?#]/.test(path)) return null;
    const parts = path.split('/');
    if (parts.slice(1).some(part => !part || part === '.' || part === '..')) return null;
    return parts.map(encodeURIComponent).join('/');
  } catch { return null; }
}

async function api(path, body, { timeoutMs = body ? 120000 : 15000 } = {}) {
  if(browserMode){if(!browserAPI)throw Error('On-device runtime has not loaded. Reload the page.');return browserAPI(path,body);}
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (body && !state.token) throw new Error('Session token unavailable. Use Retry connection.');
    const response = await fetch(path, {
      method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: body ? { 'Content-Type': 'application/json', 'X-Theatre-Token': state.token } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let data;
    try { data = await response.json(); } catch { throw new Error(`Server returned non-JSON data (${response.status}). Check the local server and retry.`); }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) $('retry').hidden = false;
      throw new Error(typeof data?.error === 'string' ? data.error : `Request failed (${response.status}).`);
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Request timed out. Check the server; refresh jobs before resubmitting a render.');
    if (error instanceof TypeError) throw new Error('Cannot reach the local server. Check that it is running and retry.');
    throw error;
  } finally { clearTimeout(timer); }
}

function structureErrors(script) {
  try { script = repairScript(script); } catch (error) { return [error.message]; }
  const errors = [];
  if (!object(script)) return ['The script must be a JSON object.'];
  if (script.version !== undefined && script.version !== 1) errors.push('Use script version 1.');
  if (!templateFor(script)) errors.push('Choose a template from the catalog.');
  if (typeof script.title !== 'string') errors.push('title must be text.');
  if (script.seed !== undefined && !Number.isSafeInteger(script.seed)) errors.push('Seed must be a safe integer or omitted.');
  if (script.scene !== undefined && !state.catalog.scenes.some(item => item.id === script.scene)) errors.push('Choose a scene from the catalog or omit scene.');
  // These are form shape checks. The server contract owns text limits and all
  // production validation; unknown advanced fields remain intact for that check.
  if (script.product !== undefined && script.product !== 'book2') errors.push('product must be book2 or omitted.');
  if (script.characters !== undefined) {
    if (!object(script.characters)) errors.push('characters must be an object.');
    else for (const role of ['reader', 'friend']) {
      if (script.characters[role] !== undefined && !variants().some(item => item.id === script.characters[role])) errors.push(`characters.${role} must be a character variant from the catalog.`);
    }
  }
  if (script.endCard !== undefined) {
    if (!object(script.endCard)) errors.push('endCard must be an object.');
    else {
      if (script.endCard.enabled !== undefined && typeof script.endCard.enabled !== 'boolean') errors.push('endCard.enabled must be true or false.');
      for (const key of ['title', 'text', 'url']) if (script.endCard[key] !== undefined && typeof script.endCard[key] !== 'string') errors.push(`endCard.${key} must be text.`);
      if (script.endCard.seconds !== undefined && (typeof script.endCard.seconds !== 'number' || !Number.isFinite(script.endCard.seconds) || script.endCard.seconds <= 0)) errors.push('endCard.seconds must be a positive number.');
    }
  }
  if (!Array.isArray(script.comics)) errors.push('comics must be an array of catalog page IDs.');
  else {
    if (new Set(script.comics).size !== script.comics.length) errors.push('Selected page IDs must be unique.');
    for (const id of script.comics) if (typeof id !== 'string' || !comicFor(id)) errors.push(`Unknown catalog page: ${String(id)}.`);
  }
  if (!Array.isArray(script.lines)) errors.push('lines must be an array.');
  else script.lines.forEach((line, index) => {
    const at = `Line ${index + 1}: `;
    if (!object(line)) { errors.push(`${at}use a dialogue or action object.`); return; }
    if (line.action !== undefined) {
      if (!ACTIONS.includes(line.action)) errors.push(`${at}unknown action.`);
      if (line.speaker !== undefined || line.text !== undefined) errors.push(`${at}an action cannot also be dialogue.`);
      if (line.seconds !== undefined && (typeof line.seconds !== 'number' || !Number.isFinite(line.seconds) || line.seconds <= 0)) errors.push(`${at}seconds must be positive.`);
    } else {
      if (!['reader', 'friend'].includes(line.speaker)) errors.push(`${at}speaker must be reader or friend.`);
      if (typeof line.text !== 'string') errors.push(`${at}text must be a string.`);
      for (const key of ['emotion', 'gesture', 'audio']) if (line[key] !== undefined && typeof line[key] !== 'string') errors.push(`${at}${key} must be text.`);
      for (const key of ['face', 'reaction']) if (line[key] !== undefined && !object(line[key])) errors.push(`${at}${key} must be a JSON object.`);
      if (line.pause !== undefined && (typeof line.pause !== 'number' || !Number.isFinite(line.pause) || line.pause < 0)) errors.push(`${at}pause must be a nonnegative number.`);
      if (line.shot !== undefined && !shots.some(item => item.id === line.shot)) errors.push(`${at}shot must be ${shots.map(item => item.id).join(', ')}.`);
    }
    if (line.comic !== undefined && (typeof line.comic !== 'string' || !comicFor(line.comic))) errors.push(`${at}comic must be a known catalog ID.`);
  });
  if(script.captions!==undefined){
    if(!object(script.captions))errors.push('captions must be an object.');
    else {
      if(script.captions.enabled!==undefined&&typeof script.captions.enabled!=='boolean')errors.push('captions.enabled must be true or false.');
      if(script.captions.position!==undefined&&!['top','bottom'].includes(script.captions.position))errors.push('captions.position must be top or bottom.');
      if(script.captions.colors!==undefined&&(!object(script.captions.colors)||Object.entries(script.captions.colors).some(([id,color])=>!['reader','friend'].includes(id)||typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color))))errors.push('captions.colors needs reader/friend six-digit hex colors.');
    }
  }
  if (script.output !== undefined) {
    if (!object(script.output)) errors.push('output must be an object.');
    else for (const key of ['width', 'height', 'fps']) if (script.output[key] !== undefined && (!Number.isInteger(script.output[key]) || script.output[key] <= 0)) errors.push(`output.${key} must be a positive integer.`);
  }
  if (script.sourceLock !== undefined && (!Array.isArray(script.sourceLock) || script.sourceLock.some(lock => !object(lock)))) errors.push('sourceLock must be an array of source records returned by the server.');
  return errors;
}
function selectionErrors(script) {
  const template = templateFor(script);
  const errors = [];
  if (!template) return ['Choose a catalog template.'];
  const count = script.comics.length;
  if (count < template.minComics || count > template.maxComics) errors.push(`${template.id} needs ${template.minComics === template.maxComics ? template.minComics : `${template.minComics}–${template.maxComics}`} selected page(s); you have ${count}. Adjust the selection explicitly.`);
  for (const id of script.comics) if (comicFor(id)?.verified !== true) errors.push(`Page ${id} is not verified. Select a catalog-verified source page.`);
  if (script.scene && !template.scenes.includes(script.scene)) errors.push(`Scene ${script.scene} is unavailable for ${template.id}. Choose ${template.scenes.join(' or ')} or Template default.`);
  for (const role of template.speakers) {
    const variant = variants().find(v => v.id === script.characters?.[role]);
    if (script.scene && variant?.allowedScenes && !variant.allowedScenes.includes(script.scene)) errors.push(`${role}: ${variant.label} needs ${variant.allowedScenes.join(' or ')}. Choose a compatible scene or Template default.`);
  }
  return errors;
}
function usedPages(script) {
  let current = script.comics[0];
  const used = new Set();
  for (const line of script.lines) {
    if (line.comic !== undefined) current = line.comic;
    if (!line.action && current) used.add(current);
  }
  return used;
}
function completeErrors(script) {
  const structural = structureErrors(script);
  if (structural.length) return structural;
  const errors = selectionErrors(script);
  if (!script.title.trim()) errors.push('Give the film a title.');
  if (!script.lines.length) errors.push('Add dialogue or book actions before generating.');
  const template = templateFor(script);
  script.lines.forEach((line, index) => {
    if (line.comic !== undefined && !script.comics.includes(line.comic)) errors.push(`Line ${index + 1} references unselected page ${line.comic}. Select that page or edit the reference.`);
    if (!line.action) {
      if (!line.text.trim()) errors.push(`Line ${index + 1} needs spoken text.`);
      if (!template?.speakers.includes(line.speaker)) errors.push(`Line ${index + 1}: ${line.speaker} is not in this template. Choose ${template?.speakers.join(' or ')}.`);
    }
  });
  const used = usedPages(script);
  for (const id of script.comics) if (!used.has(id)) errors.push(`Selected page ${id} needs a dialogue line referencing that comic ID.`);
  return errors;
}
function check(errors) { if (errors.length) throw new Error(errors.join('\n')); }
function option(select, value, text) { const node = el('option', text); node.value = value; select.append(node); }
function choose(select, choices, value, blank) {
  select.replaceChildren();
  if (blank !== undefined) option(select, '', blank);
  for (const item of choices) option(select, item.id ?? item, item.label ?? item);
  if (value && ![...select.options].some(item => item.value === value)) option(select, value, `${value} (not available here)`);
  select.value = value ?? '';
}

function updatePages(focusIndex = 0) {
  const comics = state.pageRows.filter(Boolean);
  if (JSON.stringify(comics) !== JSON.stringify(state.script.comics)) {
    state.script.comics = comics;
    delete state.script.sourceLock;
    changed();
  }
  renderPages(); renderLines();
  $(`page-${focusIndex}`)?.focus();
}
function applyPageChoice(result, index, random = false) {
  state.script = result.script; state.pageRows = result.pageRows;
  changed(); renderPages(); renderLines();
  $(random ? `random-page-${index}` : `page-${index}`)?.focus();
  const id = state.pageRows[index];
  message(id ? `Page ${index + 1}: ${comicFor(id)?.title ?? id}. Dialogue and settings kept. Review the wording against the new comic, then validate.` : `Page ${index + 1} cleared. Existing dialogue references are kept for you to review.`);
}
function refreshPageChoices() {
  // Source cuts and book-action order affect physical-turn compatibility. Only
  // refresh buttons so editing a line never reloads previews or moves focus.
  state.pageRows.forEach((id, index) => {
    const button = $(`random-page-${index}`);
    if (!button) return;
    const available = comicReplacements(state.script, state.catalog, state.pageRows, index).length > 0;
    button.disabled = !available;
    button.title = available ? 'Choose a different comic for this page. Other pages and dialogue stay.' : 'No different comic fits this selection and its book actions.';
  });
}
function renderPages() {
  $('edition').textContent = state.catalog.edition?.title ?? 'Local source catalog';
  const selectors = $('page-selectors'); selectors.replaceChildren();
  const sorted = [...state.catalog.comics].sort((a, b) => (Number.isFinite(a.pdfPage) ? a.pdfPage : Infinity) - (Number.isFinite(b.pdfPage) ? b.pdfPage : Infinity) || a.id.localeCompare(b.id));
  state.pageRows.forEach((id, index) => {
    const row = el('div', undefined, 'page-row');
    const select = el('select'); select.id = `page-${index}`;
    choose(select, sorted.map(comic => ({ id: comic.id, label: `PDF ${comic.pdfPage ?? '?'} · ${comic.title} · ${comic.id}${comic.verified === true ? '' : ' (unverified)'}` })), id, 'Choose a page…');
    for (const entry of select.options) if (entry.value) entry.disabled = comicFor(entry.value)?.verified !== true || state.pageRows.some((value, i) => i !== index && value === entry.value);
    select.addEventListener('change', () => {
      try {
        applyPageChoice(replaceComic(state.script, state.catalog, state.pageRows, index, select.value), index);
      } catch (error) { renderPages(); $(`page-${index}`)?.focus(); message(`Page unchanged: ${error.message}`, true); }
    });
    const random = el('button', 'Random comic', 'random-page'); random.type = 'button'; random.id = `random-page-${index}`;
    random.setAttribute('aria-label', `Random comic for page ${index + 1}`);
    random.addEventListener('click', () => {
      try { applyPageChoice(randomComic(state.script, state.catalog, state.pageRows, index), index, true); }
      catch (error) { message(`Page unchanged: ${error.message}`, true); }
    });
    const remove = el('button', 'Remove'); remove.type = 'button'; remove.setAttribute('aria-label', `Remove page ${index + 1}`);
    remove.disabled = state.pageRows.length === 1 && !id;
    remove.addEventListener('click', () => {
      state.pageRows.splice(index, 1);
      if (!state.pageRows.length) state.pageRows.push('');
      updatePages(Math.min(index, state.pageRows.length - 1));
    });
    const actions = el('div', undefined, 'page-row-actions'); actions.append(random, remove);
    row.append(field(`Page ${index + 1}`, select), actions); selectors.append(row);
  });
  refreshPageChoices();
  const max = templateFor(state.script)?.maxComics ?? 1;
  $('add-page').hidden = max <= 1;
  $('add-page').disabled = state.pageRows.length >= max || state.pageRows.includes('') || !sorted.some(comic => comic.verified === true && !state.pageRows.includes(comic.id));
  $('page-previews').replaceChildren();
  if (!sorted.length) selectors.append(el('p', 'No source pages in this catalog. Ask the server operator to add verified assets.', 'muted'));
  for (const id of state.script.comics) {
    const comic = comicFor(id);
    if (!comic) continue;
    const card = el('article', undefined, 'page-preview');
    card.append(el('h3', comic.title));
    const approvedPath = localPath(comic.path, '/assets/');
    const path = browserMode&&approvedPath?new URL(approvedPath.slice(1),document.baseURI).href:approvedPath;
    if (path) {
      const img = el('img'); img.src = path; img.alt = `Source page ${comic.id}: ${comic.title}`; img.loading = 'lazy';
      img.addEventListener('error', () => { img.hidden = true; card.append(el('p', `Image unavailable for ${comic.id}. Check catalog assets.`, 'hint')); }, { once: true });
      card.append(img);
    } else card.append(el('p', 'Source image path is unavailable. Check the local catalog.', 'hint'));
    card.append(el('p', `${comic.id} · PDF page ${comic.pdfPage ?? 'unknown'} · Printed page ${comic.printedPage ?? 'not supplied'}`, 'page-meta'));
    if (comic.verified === true) card.append(el('p', 'Catalog-verified source identity', 'page-meta'));
    if (comic.verified !== true) card.append(el('p', 'Unverified source — selection unavailable.', 'hint'));
    const details = el('details'); details.append(el('summary', 'Read transcript'));
    const transcript = Array.isArray(comic.transcript) ? comic.transcript.join('\n\n') : comic.transcript;
    details.append(el('p', typeof transcript === 'string' && transcript.trim() ? transcript : 'No transcript supplied.', 'transcript'));
    if (comic.observations) details.append(el('p', `Source notes: ${comic.observations}`, 'transcript'));
    card.append(details); $('page-previews').append(card);
  }
}
function renderSelection() {
  if (!state.script) return;
  const selected = $('selected-pages'); selected.replaceChildren();
  if (!state.script.comics.length) selected.textContent = 'Choose a page from the dropdown or use its Random comic button.';
  else {
    const list = el('ol');
    for (const id of state.script.comics) {
      const comic = comicFor(id);
      const item = el('li'); item.append(el('strong', id), document.createTextNode(` · ${comic?.title ?? 'Unknown page'} · PDF ${comic?.pdfPage ?? '?'} / printed ${comic?.printedPage ?? '?'}`)); list.append(item);
    }
    selected.append(list);
  }
  const errors = selectionErrors(state.script);
  $('selection-help').textContent = errors.length ? errors.join(' ') : '';
  const lockBox = $('source-lock'); lockBox.replaceChildren();
  if (state.script.sourceLock?.length) {
    const details = el('details'); details.append(el('summary', `Recorded source lock · ${state.script.sourceLock.length} page(s)`));
    for (const lock of state.script.sourceLock) details.append(el('p', `${lock.id} · PDF page ${lock.pdfPage}\nPage SHA-256: ${lock.sha256}\nPDF SHA-256: ${lock.pdfSha256}`));
    details.append(el('p', 'Dialogue edits and JSON imports preserve this lock. Changing pages or template in the form clears it; Validate records the new lock.'));
    lockBox.append(details);
  } else lockBox.textContent = 'No source lock yet. Validate records the selected pages and their hashes.';
}
function field(labelText, input) {
  const box = el('div'); const label = el('label', labelText); label.htmlFor = input.id; box.append(label, input); return box;
}
function lineInput(index, key, multiline = false) {
  const input = el(multiline ? 'textarea' : 'input'); input.id = `line-${index}-${key}`;
  input.setAttribute('aria-label', `Line ${index + 1} ${key}`);
  if (multiline) input.rows = 3;
  if (key === 'text') input.placeholder = `Write what the ${state.script.lines[index].speaker ?? 'character'} says…`;
  input.value = state.script.lines[index][key] ?? '';
  input.addEventListener('input', () => {
    if (input.value || key === 'text') state.script.lines[index][key] = input.value;
    else delete state.script.lines[index][key];
    changed();
  });
  return field(key[0].toUpperCase() + key.slice(1), input);
}
function renderLines() {
  $('dialogue').replaceChildren();
  if (!state.script.lines.length) $('dialogue').append(el('p', 'Start with a line of dialogue, or request an optional AI draft after choosing pages.', 'muted'));
  state.script.lines.forEach((line, index) => {
    const card = el('section', undefined, 'line');
    const heading = el('div', undefined, 'line-heading'); heading.append(el('h4', `Line ${index + 1}${line.action ? ' · Action' : ''}`));
    const actions = el('div', undefined, 'line-actions');
    for (const [label, delta] of [['Move up', -1], ['Move down', 1], ['Remove', 0]]) {
      const button = el('button', delta === -1 ? '↑' : delta === 1 ? '↓' : '×'); button.type = 'button'; button.title = label; button.setAttribute('aria-label', `${label} line ${index + 1}`);
      button.disabled = delta === -1 && index === 0 || delta === 1 && index === state.script.lines.length - 1;
      button.addEventListener('click', () => {
        if (!delta) state.script.lines.splice(index, 1);
        else [state.script.lines[index], state.script.lines[index + delta]] = [state.script.lines[index + delta], state.script.lines[index]];
        changed(); renderLines(); refreshPageChoices();
      }); actions.append(button);
    }
    heading.append(actions); card.append(heading);
    if (line.action) {
      const controls = el('div', undefined, 'field-pair');
      const action = el('select'); action.id = `line-${index}-action`;
      choose(action, ACTIONS, line.action);
      action.addEventListener('change', () => {
        line.action = action.value; delete line.actor; delete line.target; delete line.seconds;
        changed(); renderLines();
      });
      controls.append(field('Action', action));
      const seconds = el('input'); seconds.id = `line-${index}-seconds`; seconds.type = 'number'; seconds.step = '.1'; seconds.min = '.3'; seconds.max = '8'; seconds.placeholder = 'Automatic'; seconds.value = line.seconds ?? '';
      seconds.addEventListener('input', () => { if (seconds.value === '') delete line.seconds; else line.seconds = seconds.valueAsNumber; changed(); });
      controls.append(field('Duration (seconds)', seconds));
      if (ACTOR_ACTIONS.includes(line.action)) for (const key of PARTNER_ACTIONS.includes(line.action) ? ['actor', 'target'] : ['actor']) {
        const select = el('select'); select.id = `line-${index}-${key}`;
        choose(select, templateFor(state.script).speakers, line[key], 'Automatic');
        select.addEventListener('change', () => { if (select.value) line[key] = select.value; else delete line[key]; changed(); });
        controls.append(field(key === 'actor' ? 'Character' : 'Hit character', select));
      }
      if (['open', 'turn'].includes(line.action)) {
        const select = el('select'); select.id = `line-${index}-comic`;
        choose(select, state.script.comics, line.comic, 'Current page');
        select.addEventListener('change', () => { if (select.value) line.comic = select.value; else delete line.comic; changed(); });
        controls.append(field('Source page', select));
      }
      card.append(controls, el('p', 'Throw needs a held book. Place it before a character action. Slam and throw close the book; open it before more dialogue.', 'hint'));
    } else {
      const pair = el('div', undefined, 'field-pair');
      const speaker = el('select'); speaker.id = `line-${index}-speaker`; speaker.setAttribute('aria-label', `Line ${index + 1} speaker`);
      choose(speaker, templateFor(state.script)?.speakers ?? ['reader', 'friend'], line.speaker);
      speaker.addEventListener('change', () => { line.speaker = speaker.value; changed(); });
      const source = el('select'); source.id = `line-${index}-comic`; source.setAttribute('aria-label', `Line ${index + 1} comic`);
      choose(source, state.script.comics.map(id => ({ id, label: `${id} · printed ${comicFor(id)?.printedPage ?? '?'}` })), line.comic, 'Continue current page');
      source.addEventListener('change', () => { if (source.value) line.comic = source.value; else delete line.comic; changed(); refreshPageChoices(); });
      pair.append(field('Speaker', speaker), field('Source page', source)); card.append(pair, lineInput(index, 'text', true));
      const performance = el('div', undefined, 'field-pair');
      for (const [key, choices, fallback] of [['emotion', EMOTIONS, 'neutral'], ['gesture', GESTURES, 'none']]) {
        const select = el('select'); select.id = `line-${index}-${key}`; select.setAttribute('aria-label', `Line ${index + 1} ${key}`);
        choose(select, choices, line[key], `Default (${fallback})`);
        // Preserve unknown imported values for validation; never offer them as a new choice.
        for (const entry of select.options) if (entry.value && !choices.includes(entry.value)) entry.disabled = true;
        select.addEventListener('change', () => { if (select.value) line[key] = select.value; else delete line[key]; changed(); });
        performance.append(field(key[0].toUpperCase() + key.slice(1), select));
      }
      card.append(performance);
      if (['face', 'reaction', 'pause', 'audio'].some(key => line[key] !== undefined)) card.append(el('p', 'Advanced fields present; edit them in JSON. Form edits preserve them.', 'hint'));
    }
    const shot = el('select'); shot.id = `line-${index}-shot`; shot.setAttribute('aria-label', `Line ${index + 1} shot`);
    choose(shot, shots, line.shot ?? 'auto');
    shot.addEventListener('change', () => { line.shot = shot.value; changed(); });
    const direction = el('details', undefined, 'line-direction');
    direction.append(el('summary', 'Camera & gaze'), field('Shot', shot));
    const gazes = el('div', undefined, 'field-pair');
    for (const role of templateFor(state.script)?.speakers ?? []) {
      const select = el('select'); select.id = `line-${index}-gaze-${role}`;
      choose(select, GAZES.map(id => ({ id, label: ({auto:'Automatic',partner:'At the other character',away:'Away from the other character',book:'At the book',ceiling:'At the ceiling',camera:'At the camera'})[id] })), line.gaze?.[role] ?? 'auto');
      select.addEventListener('change', () => { line.gaze = { ...line.gaze, [role]: select.value }; changed(); });
      gazes.append(field(`${role === 'reader' ? 'Reader' : 'Friend'} looks`, select));
    }
    direction.append(gazes); card.append(direction);
    $('dialogue').append(card);
  });
}
function renderCharacters() {
  for (const role of ['reader', 'friend']) {
    const select = $(`${role}-clothing`);
    choose(select, variants(), state.script.characters?.[role] ?? characterDefaults[role]);
    for (const item of select.options) {
      const variant = variants().find(v => v.id === item.value);
      item.disabled = !!(state.script.scene && variant?.allowedScenes && !variant.allowedScenes.includes(state.script.scene));
    }
  }
}
// Cameo toggles mirror script.extras; a goose_chase line keeps the goose on.
function renderExtras() {
  const box = $('extras-fields'), list = state.catalog?.extras ?? [];
  box.hidden = !list.length;
  box.querySelectorAll('label').forEach(node => node.remove());
  const chosen = Array.isArray(state.script.extras) ? state.script.extras : [];
  for (const extra of list) {
    const label = el('label', undefined, 'check-label'), input = el('input');
    input.type = 'checkbox'; input.id = `extra-${extra.id}`; input.value = extra.id; input.checked = chosen.includes(extra.id);
    label.htmlFor = input.id; label.append(input, extra.label ?? extra.id);
    input.addEventListener('change', () => {
      const next = list.map(e => e.id).filter(id => id === extra.id ? input.checked : chosen.includes(id));
      if (next.length > 4) { input.checked = false; message('Choose at most four background cameos.', true); return; }
      if (next.length) state.script.extras = next; else delete state.script.extras;
      changed(); renderExtras();
    });
    box.append(label);
  }
}
function renderOutput() {
  $('speech-rate').value = state.script.speechRate === undefined ? DEFAULT_SPEECH_RATE : state.script.speechRate ?? '';
  const captions=captionDefaults(state.script.captions);
  $('captions-enabled').checked=captions.enabled;
  $('captions-position').value=captions.position;
  for(const id of ['reader','friend']){
    $(`captions-${id}`).value=captions.colors[id];
    $(`captions-${id}`).disabled=!templateFor(state.script)?.speakers.includes(id);
  }
  const output = state.script.output ?? {};
  const preset = output.preset ?? (output.width === undefined && output.height === undefined ? 'instagram_reels' : 'custom');
  choose($('output-preset'), [...Object.entries(OUTPUT_PRESETS).map(([id, item]) => ({id, label:item.label})), {id:'custom',label:'Custom dimensions'}], preset);
  $('custom-size').hidden = preset !== 'custom';
  const size = OUTPUT_PRESETS[preset] ?? {width:1080,height:1920};
  for (const key of ['width','height']) { $(`output-${key}`).value = output[key] ?? size[key]; $(`output-${key}`).disabled = preset !== 'custom'; }
  $('output-fps').value = output.fps ?? 24;
  $('grade').value = state.script.grade ?? 'muted';
  $('dither').value = state.script.dither ?? 'subtle';
}
function renderForm() {
  choose($('template'), templates().map(item => ({ id: item.id, label: item.label })), state.script.template);
  choose($('scene'), state.catalog.scenes, state.script.scene, 'Template default');
  $('seed').value = state.script.seed ?? '';
  $('title').value = state.script.title;
  renderCharacters(); renderExtras();
  renderOutput();
  $('product').value = state.script.product ?? 'book2';
  const endCard = { ...endCardDefaults, ...state.script.endCard };
  $('end-card-enabled').checked = endCard.enabled;
  for (const key of ['title', 'text', 'url', 'seconds']) $(`end-card-${key}`).value = endCard[key];
  const template = templateFor(state.script);
  $('template-help').textContent = template ? `${template.minComics === template.maxComics ? template.minComics : `${template.minComics}–${template.maxComics}`} page(s) · cast: ${template.speakers.join(', ')}` : 'Choose a template.';
  renderPages(); renderSelection(); renderLines(); controls();
}
function install(script) {
  script = repairScript(script);
  check(structureErrors(script));
  const next = clone(script);
  // Cast and timeline IDs are template/engine details. Keep sourceLock so ordinary
  // dialogue editing cannot silently rebind the source to a different asset hash.
  delete next.cast;
  for (const line of next.lines) { delete line.id; delete line.bookState; }
  // An incoming lock belongs to the imported script, not the current selection.
  // Preserve even stale locks for backend rejection. Only explicit selection
  // controls (or an author's removal in JSON) may discard a previous source lock.
  rememberVersion();
  state.script = next;
  state.pageRows = next.comics.length ? [...next.comics] : Array(Math.max(1, templateFor(next)?.minComics ?? 1)).fill('');
  state.revision++; syncJSON(); renderForm();
}
function unchanged(revision) {
  if (revision !== state.revision) throw new Error('The editor changed while the request was running. The response was not applied. Your newer edits are safe; retry when ready.');
}

async function operate(kind, work) {
  if (state.busy) return;
  const operation = ++state.operation;
  try {
    requireReady(); state.busy = true; controls(); message(`${kind}…`);
    await work();
  } catch (error) { if (operation === state.operation) message(`${kind}: ${error.message}`, true); }
  finally { if (operation === state.operation) { state.busy = false; controls(); } }
}

function hasAuthoredInput() {
  const defaults = editorDefaults(state.catalog, state.script?.template);
  return state.dirtyJSON || stringify(state.script) !== stringify(defaults.script) || $('voice').value !== defaults.voice || $('background-music').files.length > 0;
}
function confirmReplacement(action) {
  return !hasAuthoredInput() || window.confirm(`${action}? This replaces the current script. Download JSON first if you want to keep it. Existing videos and jobs stay.`);
}
$('new-video').addEventListener('click', () => {
  if (!state.catalog) return;
  const defaults = editorDefaults(state.catalog, state.script?.template);
  if (!confirmReplacement('New script')) return;
  state.operation++; state.busy = false;
  $('voice').value = defaults.voice;
  $('background-music').value = '';
  for (const id of uploadInputs) $(id).value = '';
  install(defaults.script);
  if (draftSaved) message('Blank script ready. Choose comic pages and write dialogue.');
  else {
    let removed = false;
    try { localStorage.removeItem(draftKey); removed = true; } catch {}
    message(`Blank script ready. Browser storage failed; the blank draft could not be saved. ${removed ? 'The old saved draft was removed.' : 'The old saved draft may return after reload.'} Download JSON to keep new edits.`, true);
  }
  showStep('scene');
  $('page-0')?.focus();
});
$('load-example').addEventListener('click', () => operate('Load example', async () => {
  const filename = $('example-script').value;
  if (!exampleFiles.has(filename)) throw new Error('Choose one of the supplied example scripts.');
  const revision = state.revision;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let script;
  try {
    const response = await fetch(new URL(`./templates/${filename}`, document.baseURI), { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`Example could not be loaded (${response.status}). Check that the templates folder is included in this installation.`);
    script = await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Example load timed out. Your current draft is unchanged; try again.');
    throw error;
  } finally { clearTimeout(timer); }
  unchanged(revision); check(completeErrors(script));
  if (!confirmReplacement('Load this example')) { message('Example not loaded. Your script is unchanged.'); return; }
  install(script); showStep('script'); batchUI.register(script, filename); message('Example loaded. Review the pages and dialogue, then validate or generate.');
}));

$('generate-chaos').addEventListener('click', async () => {
  if (!state.catalog || state.busy || state.dirtyJSON) return;
  try {
    // Loaded on demand; the static build inlines it.
    const { generateChaos } = await import('../src/chaos.mjs');
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 1;
    const script = generateChaos(state.catalog, { seed, intensity: $('chaos-intensity').value });
    if (!confirmReplacement('Generate a chaos script')) { message('Chaos script not generated. Your script is unchanged.'); return; }
    state.operation++;
    install(script); showStep('script'); batchUI.register(script, `chaos-${seed}.json`);
    message(`Chaos script ready: "${script.title}" (seed ${seed}). Review it, then validate or generate the video.`);
  } catch (error) { message(`Chaos generator: ${error.message}`, true); }
});
$('template').addEventListener('change', () => {
  const blankLines = stringify(state.script.lines) === stringify(editorDefaults(state.catalog, state.script.template).script.lines);
  state.script.template = $('template').value;
  if (blankLines) state.script.lines = editorDefaults(state.catalog, state.script.template).script.lines;
  if (!state.script.comics.length) state.pageRows = Array(Math.max(1, templateFor(state.script)?.minComics ?? 1)).fill('');
  delete state.script.sourceLock; changed(); renderForm();
});
$('add-page').addEventListener('click', () => {
  if ($('add-page').disabled || $('add-page').hidden) return;
  state.pageRows.push(''); renderPages(); $(`page-${state.pageRows.length - 1}`).focus();
});
$('scene').addEventListener('change', () => { if ($('scene').value) state.script.scene = $('scene').value; else delete state.script.scene; changed(); renderCharacters(); });
$('seed').addEventListener('input', () => { if ($('seed').value === '') delete state.script.seed; else state.script.seed = Number($('seed').value); changed(); });
$('title').addEventListener('input', () => { state.script.title = $('title').value; changed(); });
for (const role of ['reader', 'friend']) $(`${role}-clothing`).addEventListener('change', () => {
  state.script.characters = { ...state.script.characters, [role]: $(`${role}-clothing`).value }; changed();
});
$('product').addEventListener('change', () => { state.script.product = $('product').value; changed(); });
$('end-card-enabled').addEventListener('change', () => {
  state.script.endCard = { ...state.script.endCard, enabled: $('end-card-enabled').checked }; changed();
});
for (const key of ['title', 'text', 'url', 'seconds']) $(`end-card-${key}`).addEventListener('input', () => {
  const input = $(`end-card-${key}`);
  // Preserve unfinished numeric input. The shared normalizer records any
  // fallback applied on validation/generation rather than silently fixing it here.
  const value = key === 'seconds' ? (Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : null) : input.value;
  state.script.endCard = { ...state.script.endCard, [key]: value }; changed();
});
for(const key of ['enabled','position','reader','friend']) $(`captions-${key}`).addEventListener('change',()=>{
  state.script.captions={enabled:$('captions-enabled').checked,position:$('captions-position').value,colors:{reader:$('captions-reader').value,friend:$('captions-friend').value}};changed();
});
$('output-preset').addEventListener('change', () => {
  const preset = $('output-preset').value, fps = Number($('output-fps').value);
  state.script.output = preset === 'custom' ? {width:Number($('output-width').value),height:Number($('output-height').value),fps} : {preset,fps};
  changed(); renderOutput();
});
for (const key of ['width','height','fps']) $(`output-${key}`).addEventListener('change', () => {
  state.script.output = {...state.script.output, [key]:Number($(`output-${key}`).value)}; changed();
});
$('grade').addEventListener('change', () => {
  if ($('grade').value === 'muted') delete state.script.grade; else state.script.grade = $('grade').value;
  changed();
});
$('dither').addEventListener('change', () => {
  if ($('dither').value === 'subtle') delete state.script.dither; else state.script.dither = $('dither').value;
  changed();
});
$('add-action').addEventListener('click', () => {
  state.script.lines.push({action:'read'}); changed(); renderLines();
  $(`line-${state.script.lines.length - 1}-action`).focus();
});
$('add-line').addEventListener('click', () => {
  const comic = state.script.comics.find(id => !state.script.lines.some(line => line.comic === id)) ?? state.script.comics[0];
  state.script.lines.push({ speaker: templateFor(state.script)?.speakers[0] ?? 'reader', text: '', ...(comic ? { comic } : {}) });
  changed(); renderLines(); refreshPageChoices(); $(`line-${state.script.lines.length - 1}-text`).focus();
});
$('script-json').addEventListener('input', () => { state.revision++; state.dirtyJSON = true; saveDraft($('script-json').value); controls(); });
$('apply-json').addEventListener('click', () => {
  try { if (!state.catalog) throw new Error('Connect to the local theatre first.'); install(JSON.parse($('script-json').value)); message('JSON applied. Form and JSON are in sync. Validate before generating.' + repairSummary()); }
  catch (error) { message(`JSON not applied: ${error.message}`, true); }
});
$('revert-json').addEventListener('click', () => { if (state.script) { state.revision++; syncJSON(); message('Unapplied JSON reverted to the current form script.'); } });
$('download-json').addEventListener('click', () => {
  try {
    requireReady();
    const url = URL.createObjectURL(new Blob([`${stringify(state.script)}\n`], { type: 'application/json' }));
    const link = el('a'); link.href = url; link.download = 'comic-theatre-script.json'; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); message('Script downloaded.');
  } catch (error) { message(error.message, true); }
});
async function uploadJSON(event) {
  const input = event.currentTarget;
  const file = input.files[0]; if (!file) return;
  const operation = state.operation;
  try {
    requireReady();
    if (file.size > 2 * 1024 * 1024) throw new Error('Choose a script JSON file smaller than 2 MB.');
    const revision = state.revision;
    const script = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
    unchanged(revision); check(structureErrors(script));
    if (!confirmReplacement('Upload this JSON')) { message('Upload cancelled. Your script is unchanged.'); return; }
    install(script);
    showStep('script');
    batchUI.register(script, file.name);
    message('JSON uploaded. Review selected pages, then validate the script.' + repairSummary());
  } catch (error) { if (operation === state.operation) message(`Upload not applied: ${error.message}`, true); }
  finally { if (operation === state.operation) input.value = ''; }
}
for (const id of uploadInputs) $(id).addEventListener('change', uploadJSON);
$('validate').addEventListener('click', () => operate('Validate', async () => {
  const script = clone(state.script); const revision = state.revision;
  check(completeErrors(script)); const result = await api('/api/validate', { script }); unchanged(revision);
  check(structureErrors(result.script));
  if (result.script.template !== script.template || JSON.stringify(result.script.comics) !== JSON.stringify(script.comics)) throw new Error('Validation returned different sources or template. Response not applied; check the server.');
  install(result.script);
  message('Server validation passed. Source lock and resolved defaults recorded; your script remains editable.' + repairSummary());
}));
$('draft').addEventListener('click', () => operate('AI Draft', async () => {
  const script = clone(state.script); const revision = state.revision;
  check(structureErrors(script)); check(selectionErrors(script));
  // The writer endpoint resolves its input before writing. Supply placeholders
  // only in this request when starting from unwritten pages; never auto-render them.
  for (const line of script.lines) if (!line.action && !line.text.trim()) line.text = 'Draft commentary for this selected page.';
  const used = usedPages(script);
  for (const comic of script.comics) if (!used.has(comic)) script.lines.push({ speaker: templateFor(script).speakers[0], text: 'Draft commentary for this selected page.', comic });
  check(completeErrors(script));
  let result;
  // Allow both bounded 120-second writer attempts plus response overhead.
  try { result = await api('/api/draft', { script }, { timeoutMs: 250000 }); }
  catch (error) { throw new Error(`${error.message}. You can write manually and Generate video, or ask the operator to configure the optional writer.`); }
  unchanged(revision);
  result.script = keepPresentation(result.script, script);
  check(structureErrors(result.script));
  if (result.script.template !== script.template || JSON.stringify(result.script.comics) !== JSON.stringify(script.comics)) throw new Error('Writer changed the selected source pages or template. Draft rejected; your source selection and script are unchanged.');
  if (['seed', 'scene', 'sourceLock'].some(key => script[key] !== undefined && JSON.stringify(result.script[key]) !== JSON.stringify(script[key]))) throw new Error('Writer changed the seed, scene or source lock. Draft rejected; retry with the current settings.');
  check(completeErrors(result.script)); install(result.script); message('AI draft applied for the same selected pages. Review the wording and validate before generating.');
}));
$('generate').addEventListener('click', () => operate('Generate video', async () => {
  const revision = state.revision;
  const script = clone(state.script); check(completeErrors(script));
  const music = browserMode ? $('background-music').files[0] : undefined;
  if(browserMode)$('device-canvas').hidden=false;
  const voice = $('voice').value;
  if (voice === 'recorded' && script.lines.some(line => !line.action && (typeof line.audio !== 'string' || !line.audio.trim()))) throw new Error('Recorded mode needs an audio path on every spoken line. Add audio in JSON, or choose Local Kokoro.');
  rememberVersion();
  const result = await api('/api/render', { script, voice, ...(music ? { music } : {}) });
  if (!result || typeof result.id !== 'string') throw new Error('Server did not return a job ID. Refresh jobs before trying again.');
  if (revision === state.revision) message(`Submitted ${result.id} (${result.status ?? 'queued'}). It uses the script sent when you clicked Generate; later edits stay in the editor.`);
  await refreshJobs();
  if (revision === state.revision) showView('videos');
}));

function renderJobs(jobs) {
  $('jobs').replaceChildren();
  if (!jobs.length) $('jobs').append(el('p', 'No films yet. Your first render will appear here.', 'muted'));
  for (const job of jobs) {
    const card = el('article', undefined, 'job'); card.append(el('h3', String(job.id ?? 'Unknown job')));
    const detail = object(job.progressDetail) ? job.progressDetail : null;
    const rawProgress = detail ? detail.progress : job.progress;
    const finite = typeof rawProgress === 'number' && Number.isFinite(rawProgress);
    // Structured progress is a fraction of the named stage. Legacy numeric
    // progress also accepted percentages, so keep that interpretation separately.
    const percent = finite ? Math.round(Math.max(0, Math.min(100, detail || rawProgress <= 1 ? rawProgress * 100 : rawProgress))) : null;
    const phase = typeof detail?.phase === 'string' ? detail.phase.replace(/[_-]+/g, ' ').replace(/^./, c => c.toUpperCase()) : '';
    const terminal = ['complete', 'failed', 'cancelled'].includes(job.status);
    card.append(el('p', String(job.status ?? 'unknown')));
    if (finite || !terminal) {
      const meter = el('progress'); meter.max = 100;
      if (finite) meter.value = percent;
      meter.setAttribute('aria-label', `Job ${job.id} ${phase || 'progress'}`);
      card.append(meter);
    }
    if (phase || finite) card.append(el('p', `${phase || 'Progress'}${finite ? ` · ${percent}%${detail ? ' of stage' : ''}` : ''}`, 'job-stage'));
    if (typeof detail?.message === 'string' && detail.message) card.append(el('p', detail.message));
    else if (typeof job.progress === 'string' && job.progress) card.append(el('p', job.progress));
    const startedAt = typeof job.startedAt === 'number' ? job.startedAt : Date.parse(job.startedAt);
    const end = job.completedAt ?? job.finishedAt ?? job.updatedAt;
    const endedAt = typeof end === 'number' ? end : Date.parse(end);
    if (Number.isFinite(startedAt) && (!terminal || Number.isFinite(endedAt))) {
      const seconds = Math.max(0, Math.floor(((terminal ? endedAt : Date.now()) - startedAt) / 1000));
      card.append(el('p', `Elapsed · ${Math.floor(seconds / 60)}m ${seconds % 60}s`, 'job-elapsed'));
    }
    if (job.error) card.append(el('p', `${typeof job.error === 'string' ? job.error : stringify(job.error)}\n${browserMode?'Your script is preserved. Keep the tab visible and try Generate again. If it repeats, copy this error and include your phone/browser version.':'Check the script and local server setup, then Generate again when corrected.'}`, 'status error'));
    appendGeneratorNotes(card, job);
    if (job.video) {
      const path = browserMode&&browserAPI?.ownsURL(job.video)?job.video:localPath(job.video, '/output/');
      if (path) { const link = el('a', 'Open video ↗'); link.href = path; link.target = '_blank'; link.rel = 'noopener noreferrer'; card.append(link); }
      else card.append(el('p', 'Video link is not a local /output/ path. Check the job output on the server.', 'hint'));
      if(browserMode&&path){
        const extension = typeof job.filename === 'string' ? job.filename.split('.').at(-1).toLowerCase() : '';
        const format = ['mp4', 'webm'].includes(extension) ? extension.toUpperCase() : '';
        const link=el('a',`Download video${format ? ` (${format})` : ''}`);link.href=path;
        if (typeof job.filename === 'string') link.download=job.filename;
        card.append(link);
        if (extension === 'webm') card.append(el('p', 'WebM fallback: MP4 was unavailable for this export. The download is a .webm file.', 'hint'));
      }
    }
    if(browserMode&&job.status==='running'){const button=el('button','Cancel export');button.onclick=()=>api('/api/cancel',{id:job.id}).catch(e=>message(e.message,true));card.append(button);}
    $('jobs').append(card);
  }
}
async function refreshJobs() {
  if (state.polling) return;
  state.polling = true;
  try {
    const result = await api('/api/jobs');
    if (!Array.isArray(result?.jobs) || result.jobs.some(job => !object(job))) throw new Error('Server returned an invalid jobs list.');
    renderJobs(result.jobs); $('jobs-status').textContent = ''; $('jobs-status').classList.remove('error');
  } catch (error) { $('jobs-status').textContent = `${error.message} Use Refresh jobs to retry. Editor contents are safe.`; $('jobs-status').classList.add('error'); }
  finally { state.polling = false; }
  await batchUI.refresh();
}
$('refresh-jobs').addEventListener('click', refreshJobs);
async function connect() {
  if (state.connecting) return;
  state.connecting = true;
  try {
    message(browserMode?'Loading the on-device theatre…':'Connecting to the local theatre…');
    const [session, catalog] = await Promise.all([api('/api/session'), api('/api/catalog')]);
    if (typeof session?.token !== 'string' || !session.token) throw new Error('No session token returned. Check the server and retry.');
    if (!object(catalog) || !Array.isArray(catalog.comics) || !Array.isArray(catalog.templates) || !catalog.templates.length || !Array.isArray(catalog.scenes)) throw new Error('Catalog is missing comics, templates or scenes. Check the server catalog.');
    state.token = session.token; state.catalog = catalog;
    batchUI.setCatalog(catalog);
    if (!state.script) {
      install(editorDefaults(catalog).script);
    } else { renderForm(); }
    $('retry').hidden = true; message('Ready. Choose source pages to begin.');
  } catch (error) { state.token = null; message(`Connection failed: ${error.message} Use Retry connection.`, true); $('retry').hidden = false; }
  finally { state.connecting = false; controls(); }
}
$('retry').addEventListener('click', connect);
$('clear-music').addEventListener('click', () => { $('background-music').value = ''; });
let savedDraft;try{savedDraft=localStorage.getItem(draftKey);}catch{}
if(browserMode){
 $('background-music-fields').hidden=false;
 $('device-note').hidden=false;$('draft').hidden=true;
 for(const option of [...$('voice').options])if(option.value!=='flite')option.remove();
 try{
  const [{createBrowserBackend},catalog]=await Promise.all([import(new URL('./browser/backend.mjs',location.href).href),fetch('./assets/catalog.json').then(r=>{if(!r.ok)throw Error('Catalog load failed');return r.json();})]);
  browserAPI=createBrowserBackend({catalog,canvas:$('device-canvas'),onChange:()=>void refreshJobs()});
 }catch(e){message(`Cannot load the on-device engine: ${e.message}. Reload to retry.`,true);throw e;}
}
await connect();
if(savedDraft&&state.catalog){try{install(JSON.parse(savedDraft));message('Restored your saved draft. Validate before rendering.');}catch{$('script-json').value=savedDraft;state.dirtyJSON=true;saveDraft(savedDraft);controls();message('Saved JSON needs correction. Your text is preserved in the JSON editor.',true);}}
historyReady = true; renderHistory();
if (state.dirtyJSON) showView('json', false);
await refreshJobs();
setInterval(() => { if (!document.hidden) void refreshJobs(); }, 2500);
