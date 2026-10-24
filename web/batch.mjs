import { resolveScript, resolveOutput } from '../src/contracts.mjs';
import { createZip } from '../src/zip.mjs';

const STORAGE_KEY = 'comic-theatre-batch-library-v1';
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_LIBRARY_BYTES = 32 * 1024 * 1024;
const MAX_LIBRARY_ITEMS = 200;
const MAX_SELECTED = 100;
const encoder = new TextEncoder();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const safeName = name => String(name || 'script.json').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 240) || 'script.json';
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** A separate library of original JSON snapshots, independent of editor state. */
export function createBatchUI({ api, isReady, getEditorScript, browserMode, ownsURL, localPath, onRun }) {
  const $ = id => document.getElementById(id);
  let catalog = null;
  let entries = [];
  let loading = false;
  let submitting = false;
  let polling = false;
  let renderedBatches = '';
  const batches = new Map();
  const cancelling = new Set();
  const downloading = new Set();
  const downloadMessages = new Map();

  function message(text, error = false) {
    $('batch-import-status').textContent = text;
    $('batch-import-status').classList.toggle('error', error);
  }
  function storageMessage(text) {
    $('batch-storage-status').textContent = text;
    $('batch-storage-status').classList.toggle('error', Boolean(text));
  }
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, entries: entries.map(({ id, name, text, selected, importError }) => ({ id, name, text, selected, ...(importError ? { importError } : {}) })) }));
      storageMessage('');
    } catch {
      storageMessage('This script library could not be saved in browser storage. It is available in this tab; keep your original JSON files to add them again after reloading.');
    }
  }
  function validate(entry) {
    entry.script = null;
    entry.error = entry.importError || '';
    if (entry.error) { entry.selected = false; return; }
    try {
      const value = JSON.parse(entry.text.replace(/^\uFEFF/, ''));
      if (!object(value)) throw new Error('A script must be one JSON object. Batch manifest arrays contain filenames, not a script.');
      entry.script = value;
      if (catalog) resolveScript(value, catalog); // Validate; never replace the original with resolved defaults.
    } catch (error) {
      entry.error = error.message;
      entry.selected = false;
    }
  }
  function restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      if (encoder.encode(raw).byteLength > MAX_LIBRARY_BYTES + 1024 * 1024) throw new Error('Saved library is too large');
      const saved = JSON.parse(raw);
      if (saved.version !== 1 || !Array.isArray(saved.entries) || saved.entries.length > MAX_LIBRARY_ITEMS) throw new Error('Invalid saved library');
      let bytes = 0, selected = 0;
      entries = saved.entries.map(value => {
        if (!object(value) || typeof value.text !== 'string' || typeof value.name !== 'string') throw new Error('Invalid saved script');
        const size = encoder.encode(value.text).byteLength;
        bytes += size;
        if (size > MAX_FILE_BYTES || bytes > MAX_LIBRARY_BYTES) throw new Error('Saved script is too large');
        const entry = { id: crypto.randomUUID(), name: safeName(value.name), text: value.text, bytes: size, selected: Boolean(value.selected) && selected++ < MAX_SELECTED, importError: typeof value.importError === 'string' ? value.importError : '' };
        validate(entry);
        return entry;
      });
    } catch {
      entries = [];
      storageMessage('The saved script library could not be read. Add your original JSON files again.');
    }
  }
  const selectedEntries = () => entries.filter(entry => entry.selected && !entry.error && entry.script);
  const running = () => [...batches.values()].some(batch => batch.status === 'running');

  function controls() {
    const ready = Boolean(isReady());
    const selected = selectedEntries().length;
    const busy = loading || submitting;
    for (const id of ['batch-files', 'batch-folder', 'batch-add-editor']) $(id).disabled = !ready || busy;
    $('batch-select-all').disabled = !ready || busy || !entries.some(entry => !entry.error && !entry.selected);
    $('batch-clear-selection').disabled = busy || !selected;
    $('batch-remove-selected').disabled = busy || !selected;
    $('batch-voice').disabled = !ready || submitting || running();
    $('batch-render').disabled = !ready || busy || running() || !selected;
    $('batch-render').textContent = submitting ? 'Starting batch…' : `Render ${selected ? plural(selected, 'selected script') : 'selected scripts'} to MP4`;
    $('batch-selection-count').textContent = `${selected} selected · ${entries.length} in library${entries.some(entry => entry.error) ? ` · ${entries.filter(entry => entry.error).length} invalid` : ''}`;
    $('batch-library-empty').hidden = entries.length > 0;
  }
  function renderLibrary() {
    $('batch-library').replaceChildren();
    for (const entry of entries) {
      const row = node('li', undefined, `batch-script${entry.error ? ' invalid' : ''}`);
      row.dataset.entryId = entry.id;
      const checkbox = node('input');
      checkbox.type = 'checkbox'; checkbox.checked = entry.selected;
      checkbox.disabled = Boolean(entry.error) || !catalog || loading || submitting;
      checkbox.id = `batch-select-${entry.id}`;
      checkbox.setAttribute('aria-label', `Select ${entry.name}`);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked && selectedEntries().length >= MAX_SELECTED) {
          checkbox.checked = false;
          message(`Choose up to ${MAX_SELECTED} scripts for one batch. Clear a selection to add another.`, true);
          return;
        }
        entry.selected = checkbox.checked;
        persist(); controls();
      });
      const detail = node('div', undefined, 'batch-script-detail');
      const label = node('label', entry.name); label.htmlFor = checkbox.id;
      detail.append(label);
      if (typeof entry.script?.title === 'string') detail.append(node('p', entry.script.title, 'batch-script-title'));
      if (entry.error) detail.append(node('p', entry.error, 'batch-validation-error'));
      else if (entry.script) {
        const output = resolveOutput(entry.script.output);
        detail.append(node('p', `${output.width} × ${output.height} · ${output.fps} fps · ${entry.script.template || 'No template'}${entry.script.output ? '' : ' · default output settings'}`, 'batch-script-settings'));
      }
      const remove = node('button', 'Remove', 'batch-remove'); remove.type = 'button';
      remove.setAttribute('aria-label', `Remove ${entry.name}`); remove.disabled = loading || submitting;
      remove.addEventListener('click', () => { entries = entries.filter(value => value !== entry); persist(); renderLibrary(); });
      row.append(checkbox, detail, remove);
      $('batch-library').append(row);
    }
    controls();
  }

  function addText(name, text, { importError = '' } = {}) {
    name = safeName(name);
    let parsed;
    // A folder often includes the CLI manifest alongside the individual scripts.
    if (!importError) {
      try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')); if (Array.isArray(parsed)) return 'manifest'; } catch {}
    }
    if (entries.some(entry => entry.name === name && entry.importError === importError && (entry.text === text || (object(parsed) && entry.script && JSON.stringify(entry.script) === JSON.stringify(parsed))))) return 'duplicate';
    if (entries.length >= MAX_LIBRARY_ITEMS) return 'limit';
    const bytes = encoder.encode(text).byteLength;
    if (bytes > MAX_FILE_BYTES) { text = ''; importError = 'This file exceeds the 2 MiB per-script limit. Choose a smaller JSON file.'; }
    const storedBytes = encoder.encode(text).byteLength;
    if (entries.reduce((total, entry) => total + entry.bytes, 0) + storedBytes > MAX_LIBRARY_BYTES) return 'limit';
    const entry = { id: crypto.randomUUID(), name, text, bytes: storedBytes, selected: selectedEntries().length < MAX_SELECTED, importError };
    validate(entry); entries.push(entry);
    return entry.error ? 'invalid' : 'added';
  }
  function reportImport(counts, ignored = 0) {
    const parts = [];
    if (counts.added) parts.push(`${plural(counts.added, 'script')} added and validated`);
    if (counts.invalid) parts.push(`${plural(counts.invalid, 'invalid file')} kept for review`);
    if (counts.duplicate) parts.push(`${plural(counts.duplicate, 'duplicate')} already in the library`);
    if (counts.manifest) parts.push(`${plural(counts.manifest, 'batch manifest')} skipped (filename lists are not scripts)`);
    if (ignored) parts.push(`${plural(ignored, 'non-JSON file')} skipped`);
    if (counts.limit) parts.push(`${plural(counts.limit, 'file')} could not be added: the library limit is ${MAX_LIBRARY_ITEMS} files / 32 MiB`);
    if (entries.filter(entry => !entry.error).length > MAX_SELECTED) parts.push(`Select up to ${MAX_SELECTED} scripts per render`);
    message(parts.length ? `${parts.join('. ')}.` : 'No JSON files were found.', Boolean(counts.invalid || counts.limit));
  }
  async function importFiles(files) {
    if (loading || submitting) return;
    loading = true; renderLibrary();
    const counts = { added: 0, invalid: 0, duplicate: 0, manifest: 0, limit: 0 };
    const all = [...files], json = all.filter(file => /\.json$/i.test(file.name));
    try {
      for (const file of json) {
        const name = file.webkitRelativePath || file.name;
        let result;
        if (entries.length >= MAX_LIBRARY_ITEMS) result = 'limit';
        else if (file.size > MAX_FILE_BYTES) result = addText(name, '', { importError: 'This file exceeds the 2 MiB per-script limit. Choose a smaller JSON file.' });
        else if (entries.reduce((sum, entry) => sum + entry.bytes, 0) + file.size > MAX_LIBRARY_BYTES) result = 'limit';
        else {
          try { result = addText(name, await file.text()); }
          catch (error) { result = addText(name, '', { importError: `The file could not be read: ${error.message}` }); }
        }
        counts[result]++;
      }
      persist(); reportImport(counts, all.length - json.length);
    } finally { loading = false; renderLibrary(); }
  }
  function register(script, name = 'script.json') {
    const result = addText(name, JSON.stringify(script, null, 2));
    persist(); renderLibrary();
    return result;
  }

  function videoLink(item) {
    if (item.status !== 'complete' || typeof item.filename !== 'string' || !/\.mp4$/i.test(item.filename) || /[\\/:\u0000-\u001f\u007f]/.test(item.filename)) return null;
    if (browserMode) return ownsURL(item.video) ? item.video : null;
    const path = localPath(item.video, '/output/');
    return path && /\.mp4$/i.test(path) ? path : null;
  }
  function acceptBatch(batch) {
    if (!object(batch) || typeof batch.id !== 'string' || !Array.isArray(batch.items) || !['running', 'complete', 'partial', 'failed', 'cancelled'].includes(batch.status) || batch.items.some(item => !object(item) || typeof item.name !== 'string')) throw new Error('The renderer returned an invalid batch. Refresh batches before starting again.');
    batches.set(batch.id, batch);
  }
  function renderBatches() {
    const signature = JSON.stringify([...batches.values()]) + JSON.stringify([...cancelling]) + JSON.stringify([...downloading]) + JSON.stringify([...downloadMessages]);
    if (signature === renderedBatches) { controls(); return; }
    renderedBatches = signature;
    $('batch-runs').replaceChildren();
    const timestamp = value => { const result = typeof value === 'number' ? value : Date.parse(value); return Number.isFinite(result) ? result : 0; };
    const newestFirst = [...batches.values()].sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt));
    for (const batch of newestFirst) {
      const article = node('article', undefined, 'batch-run'); article.dataset.batchId = batch.id;
      const header = node('div', undefined, 'batch-run-heading');
      const title = node('div');
      title.append(node('h3', `Batch · ${plural(batch.total ?? batch.items.length, 'script')}`));
      const completed = batch.items.filter(item => item.status === 'complete');
      const failed = batch.items.filter(item => item.status === 'failed').length;
      const cancelled = batch.items.filter(item => item.status === 'cancelled').length;
      const settled = completed.length + failed + cancelled;
      title.append(node('p', `${batch.status === 'running' ? 'Rendering' : batch.status.charAt(0).toUpperCase() + batch.status.slice(1)} · ${completed.length} completed${failed ? ` · ${failed} failed` : ''}${cancelled ? ` · ${cancelled} cancelled` : ''}`, 'batch-run-summary'));
      const time = new Date(batch.createdAt);
      if (!Number.isNaN(time.getTime())) title.append(node('p', time.toLocaleString(), 'batch-run-date'));
      header.append(title);
      if (batch.status === 'running') {
        const cancel = node('button', cancelling.has(batch.id) ? 'Stopping after current…' : 'Stop after current');
        cancel.type = 'button'; cancel.disabled = cancelling.has(batch.id);
        cancel.addEventListener('click', () => cancelBatch(batch.id)); header.append(cancel);
      }
      article.append(header);
      const progress = node('progress'); progress.max = Math.max(1, batch.items.length); progress.value = settled;
      progress.setAttribute('aria-label', `${settled} of ${batch.items.length} batch scripts processed`); article.append(progress);
      const list = node('ol', undefined, 'batch-items');
      for (const item of batch.items) {
        const row = node('li', undefined, `batch-item ${item.status}`);
        const content = node('div'); content.append(node('span', item.name, 'batch-item-name'), node('span', item.status, 'batch-item-status'));
        if (item.error) content.append(node('p', String(item.error), 'batch-validation-error'));
        row.append(content);
        const href = videoLink(item);
        if (href) { const link = node('a', 'Download MP4'); link.href = href; link.download = item.filename; row.append(link); }
        else if (item.status === 'complete') content.append(node('p', 'This video is no longer available in this session. Render the script again to download it.', 'hint'));
        list.append(row);
      }
      article.append(list);
      if (completed.length) {
        const button = node('button', downloading.has(batch.id) ? 'Preparing ZIP…' : `Download ${plural(completed.length, 'completed MP4')} (.zip)`, 'primary');
        button.type = 'button'; button.dataset.downloadBatch = batch.id;
        button.disabled = downloading.has(batch.id) || !completed.some(videoLink);
        button.addEventListener('click', () => downloadBatch(batch)); article.append(button);
      }
      if (downloadMessages.has(batch.id)) {
        const status = downloadMessages.get(batch.id);
        const detail = node('p', status.text, `status${status.error ? ' error' : ''}`); detail.setAttribute('role', 'status'); article.append(detail);
      }
      $('batch-runs').append(article);
    }
    $('batch-runs-empty').hidden = batches.size > 0;
    controls();
  }

  function startBatch() {
    if (loading || submitting || running()) return;
    try {
      if (!isReady()) throw new Error('Connect to the renderer before starting a batch.');
      const selection = selectedEntries();
      if (!selection.length || selection.length > MAX_SELECTED) throw new Error(`Select 1–${MAX_SELECTED} valid JSON scripts.`);
      const body = { entries: selection.map(({ name, script }) => ({ name, script: structuredClone(script) })), voice: $('batch-voice').value };
      submitting = true;
      onRun?.();
      // Keep this call in the original click task: the browser backend resumes
      // its shared AudioContext before its first await, once for the whole queue.
      const request = api('/api/batch', body);
      renderLibrary(); message(`Starting ${plural(selection.length, 'script')} with their own JSON settings…`);
      Promise.resolve(request).then(result => {
        acceptBatch(result?.batch); renderBatches();
        message('Batch started. Every selected script will render in turn; completed videos appear below.');
      }).catch(error => message(`Batch could not start: ${error.message}`, true)).finally(() => { submitting = false; renderLibrary(); });
    } catch (error) { submitting = false; message(error.message, true); controls(); }
  }
  async function cancelBatch(id) {
    if (cancelling.has(id)) return;
    cancelling.add(id); renderBatches();
    try { const result = await api('/api/batch/cancel', { id }); acceptBatch(result?.batch); }
    catch (error) { $('batch-runs-status').textContent = `Batch could not be stopped: ${error.message}`; $('batch-runs-status').classList.add('error'); cancelling.delete(id); }
    renderBatches();
  }
  async function refresh() {
    if (polling || !isReady()) return;
    polling = true;
    try {
      const result = await api('/api/batches');
      if (!Array.isArray(result?.batches)) throw new Error('The renderer returned an invalid batch list.');
      for (const batch of result.batches) acceptBatch(batch);
      $('batch-runs-status').textContent = ''; $('batch-runs-status').classList.remove('error');
      renderBatches();
    } catch (error) {
      $('batch-runs-status').textContent = `${error.message} Use Refresh batches to retry.`;
      $('batch-runs-status').classList.add('error');
    } finally { polling = false; }
  }
  async function downloadBatch(batch) {
    if (downloading.has(batch.id)) return;
    downloading.add(batch.id);
    const update = (text, error = false) => { downloadMessages.set(batch.id, { text, error }); renderBatches(); };
    try {
      const completed = batch.items.filter(item => item.status === 'complete');
      const files = [], names = new Set();
      for (const [index, item] of completed.entries()) {
        const url = videoLink(item);
        if (!url) throw new Error(`${item.name} has no available local MP4. The ZIP was not downloaded; other videos can still be downloaded individually.`);
        update(`Collecting MP4 ${index + 1} of ${completed.length}…`);
        const response = await fetch(url, { credentials: 'same-origin' });
        if (!response.ok) throw new Error(`${item.name} could not be downloaded (${response.status}). Try again.`);
        const blob = await response.blob();
        if (!blob.size) throw new Error(`${item.name} returned an empty video. Try rendering it again.`);
        let filename = item.filename;
        if (names.has(filename)) filename = `${String(index + 1).padStart(3, '0')}-${filename}`;
        while (names.has(filename)) filename = `copy-${filename}`;
        names.add(filename); files.push({ name: filename, blob });
      }
      update(`Packing ${plural(files.length, 'MP4')} into one ZIP…`);
      const zip = await createZip(files, { onProgress: ({ completed, total }) => update(`Packing MP4 ${completed} of ${total} into one ZIP…`) });
      const url = URL.createObjectURL(zip);
      const link = node('a'); link.href = url; link.download = `comic-batch-${batch.id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80)}.zip`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      update(`ZIP ready: ${plural(files.length, 'MP4')}. Your browser will save the download.`);
    } catch (error) { update(error.message, true); }
    finally { downloading.delete(batch.id); renderBatches(); }
  }

  for (const id of ['batch-files', 'batch-folder']) $(id).addEventListener('change', event => {
    const input = event.currentTarget;
    const files = [...input.files]; input.value = '';
    void importFiles(files);
  });
  $('batch-add-editor').addEventListener('click', () => {
    try {
      const script = getEditorScript();
      const stem = typeof script.title === 'string' ? script.title.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) : '';
      const result = register(script, `${stem || 'editor-script'}.json`);
      reportImport({ [result]: 1 });
    } catch (error) { message(error.message, true); }
  });
  $('batch-select-all').addEventListener('click', () => {
    let count = 0;
    for (const entry of entries) entry.selected = !entry.error && Boolean(entry.script) && count++ < MAX_SELECTED;
    persist(); renderLibrary();
    if (entries.filter(entry => !entry.error).length > MAX_SELECTED) message(`The first ${MAX_SELECTED} valid scripts are selected. Render the remaining scripts in another batch.`);
  });
  $('batch-clear-selection').addEventListener('click', () => { for (const entry of entries) entry.selected = false; persist(); renderLibrary(); });
  $('batch-remove-selected').addEventListener('click', () => { entries = entries.filter(entry => !entry.selected); persist(); renderLibrary(); });
  $('batch-render').addEventListener('click', startBatch);
  $('batch-refresh').addEventListener('click', refresh);
  if (browserMode) {
    for (const option of [...$('batch-voice').options]) if (option.value !== 'flite') option.remove();
    $('batch-device-note').hidden = false;
  }
  restore(); renderLibrary(); renderBatches();
  return {
    register,
    refresh,
    controls,
    setCatalog(value) { catalog = value; for (const entry of entries) validate(entry); renderLibrary(); },
  };
}
