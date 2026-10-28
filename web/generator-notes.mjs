/** Render job/batch diagnostics as text, never executable markup. */
export function appendGeneratorNotes(container, job) {
  const warnings = Array.isArray(job?.warnings) ? job.warnings.filter(item => typeof item === 'string') : [];
  const note = typeof job?.exitNote === 'string' ? job.exitNote : warnings.length ?
    `Automatic JSON corrections (${warnings.length}):\n${warnings.map(item => `- ${item}`).join('\n')}` : '';
  if (!note) return;
  const details = document.createElement('details');
  details.className = 'generator-notes';
  details.open = warnings.length > 0;
  const summary = document.createElement('summary');
  summary.textContent = `Generator notes${warnings.length ? ` · ${warnings.length} automatic corrections` : ''}`;
  const text = document.createElement('pre');
  text.style.whiteSpace = 'pre-wrap'; text.style.overflowWrap = 'anywhere';
  text.textContent = note;
  details.append(summary, text); container.append(details);
}
