import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT, loadCatalog, safePath} from './library.mjs';
import {resolveScript} from './contracts.mjs';

// Only complete, validated scripts become public examples. Batch manifests,
// private notes and symlinks are never part of the website's file allowlist.
export async function getExampleLibrary({root = ROOT, catalog} = {}) {
  catalog ??= await loadCatalog(root);
  const directory = path.join(root, 'examples');
  const files = new Map();
  const examples = [];
  for (const entry of await fs.readdir(directory, {withFileTypes: true})) {
    if (!entry.isFile() || !/^[a-z0-9][a-z0-9._-]*\.json$/i.test(entry.name)) continue;
    const filename = await safePath(directory, entry.name);
    if ((await fs.stat(filename)).size > 256 * 1024) continue;
    const bytes = await fs.readFile(filename);
    let script;
    try {
      script = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
      resolveScript(script, catalog);
    } catch { continue; }
    const group = /^page-\d{3}-/.test(entry.name) ? 'pages' : /^tour-/.test(entry.name) ? 'tours' : 'other';
    examples.push({name: entry.name, path: `examples/${entry.name}`, title: script.title, group});
    files.set(entry.name, bytes);
  }
  const order = {pages: 0, tours: 1, other: 2};
  examples.sort((a, b) => order[a.group] - order[b.group] || a.name.localeCompare(b.name, 'en', {numeric: true}));
  return {index: {version: 1, examples}, files};
}
