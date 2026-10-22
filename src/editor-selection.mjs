import { bookSpread } from './book-pages.mjs';

// Page choices are editor state, not render seeds. Changing a source preserves
// the author's performance and words; the author still needs to review them.
function checkRow(script, catalog, pageRows, index) {
  if (!Array.isArray(script?.comics) || !Array.isArray(script?.lines) || !Array.isArray(catalog?.comics)) throw new TypeError('A script and comic catalog are required.');
  if (!Array.isArray(pageRows) || !Number.isInteger(index) || index < 0 || index >= pageRows.length) throw new RangeError('Choose an existing page row.');
}

function turnError(script, catalog) {
  let current = script.comics[0];
  for (const [index, line] of script.lines.entries()) {
    if (line.action === 'turn') {
      const from = bookSpread(catalog.comics.find(comic => comic.id === current)?.pdfPage);
      const to = bookSpread(catalog.comics.find(comic => comic.id === line.comic)?.pdfPage);
      if (from === null || to === null || Math.abs(from - to) !== 1) return `Line ${index + 1}: this page would break a physical page turn. Choose an adjacent spread, or edit the script to use a dialogue source cut.`;
    }
    if (line.comic !== undefined) current = line.comic;
  }
  return null;
}

/** Replace one row and its explicit source references without mutating inputs. */
export function replaceComic(script, catalog, pageRows, index, nextId) {
  checkRow(script, catalog, pageRows, index);
  if (typeof nextId !== 'string') throw new TypeError('Choose a catalog page ID.');
  if (nextId && !catalog.comics.some(comic => comic.id === nextId && comic.verified === true)) throw new Error('Choose a verified catalog page.');
  if (nextId && pageRows.some((id, other) => other !== index && id === nextId)) throw new Error('That comic is already selected in another row.');
  const previousId = pageRows[index];
  const next = structuredClone(script), rows = [...pageRows];
  if (previousId === nextId) return { script: next, pageRows: rows };
  rows[index] = nextId;
  next.comics = rows.filter(Boolean);
  if (previousId && nextId) {
    for (const line of next.lines) if (line.comic === previousId) line.comic = nextId;
  }
  // Clearing a row keeps authored references visible for correction. A full
  // replacement must not silently invalidate an existing physical page turn.
  if (nextId) {
    const error = turnError(next, catalog);
    if (error) throw new Error(error);
  }
  delete next.sourceLock;
  return { script: next, pageRows: rows };
}

/** Eligible alternatives exclude the current page, other rows and frontmatter. */
export function comicReplacements(script, catalog, pageRows, index) {
  checkRow(script, catalog, pageRows, index);
  const hasTurns = script.lines.some(line => line.action === 'turn');
  return catalog.comics.filter(comic => {
    if (comic.verified !== true || comic.kind && comic.kind !== 'comic' || pageRows.includes(comic.id)) return false;
    if (!hasTurns) return true;
    try { replaceComic(script, catalog, pageRows, index, comic.id); return true; }
    catch { return false; }
  });
}

/** Fresh randomness is independent of the script's deterministic render seed. */
export function randomComic(script, catalog, pageRows, index, random = Math.random) {
  const choices = comicReplacements(script, catalog, pageRows, index);
  if (!choices.length) throw new Error('No other compatible comic is available for this row. Other selected pages and physical page turns limit the choices.');
  const draw = random();
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new RangeError('Random selection must be between zero (inclusive) and one (exclusive).');
  return replaceComic(script, catalog, pageRows, index, choices[Math.floor(draw * choices.length)].id);
}
