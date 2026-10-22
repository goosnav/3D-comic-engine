/**
 * PURPOSE Return a fresh first-launch authoring state.
 * KIND CORE
 * CONTRACT IN: catalog with a nonempty templates array of nonempty string IDs.
 * OUT: independent blank script, default voice and attachment-clear instruction.
 * RAISES TypeError for an invalid template catalog.
 * GUARANTEES Deterministic, no I/O, no input mutation or shared nested values.
 * TUNING Preferred book-duet template, Untitled reading title, flite voice.
 * DECISIONS D1: omit optional authored fields so the existing renderer owns its
 * defaults; alternative: copying current settings would defeat a full reset. Revisit if
 * owner introduces saved startup presets.
 * LIMITS Does not delete jobs, cancel renders, touch storage or clear DOM inputs.
 * TESTBENCH tests/editor-defaults.test.mjs — node --test tests/editor-defaults.test.mjs
 */
export function editorDefaults(catalog) {
  if (!Array.isArray(catalog?.templates) || !catalog.templates.length || catalog.templates.some(item => typeof item?.id !== 'string' || !item.id.trim())) throw new TypeError('A nonempty template catalog is required.');
  const template = catalog.templates.find(item => item.id === 'book-duet') ?? catalog.templates[0];
  return { script: { version: 1, template: template.id, title: 'Untitled reading', comics: [], lines: [] }, voice: 'flite', clearAttachments: true };
}
