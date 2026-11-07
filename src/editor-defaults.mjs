/**
 * PURPOSE Return a fresh first-launch authoring state.
 * KIND CORE
 * CONTRACT IN: catalog with a nonempty templates array of nonempty string IDs,
 * optional template ID for a new draft in the chosen format.
 * OUT: independent blank script, default voice and attachment-clear instruction.
 * RAISES TypeError for an invalid template catalog.
 * GUARANTEES Deterministic, no I/O, no input mutation or shared nested values.
 * TUNING Preferred conversation template, v12 cast, silent beats, flite voice.
 * DECISIONS D1: use catalog preset fields and omit other optional fields so the renderer owns its
 * defaults; alternative: copying current settings would defeat a full reset. Revisit if
 * owner introduces saved startup presets.
 * LIMITS Does not delete jobs, cancel renders, touch storage or clear DOM inputs.
 * TESTBENCH tests/editor-defaults.test.mjs — node --test tests/editor-defaults.test.mjs
 */
export function editorDefaults(catalog, templateId) {
  if (!Array.isArray(catalog?.templates) || !catalog.templates.length || catalog.templates.some(item => typeof item?.id !== 'string' || !item.id.trim())) throw new TypeError('A nonempty template catalog is required.');
  const template = templateId === undefined ? catalog.templates.find(item => item.id === 'conversation') ?? catalog.templates.find(item => item.id === 'book-duet') ?? catalog.templates[0] : catalog.templates.find(item => item.id === templateId);
  if (!template) throw new TypeError(`Unknown template: ${templateId}`);
  const speakers = Array.isArray(template.speakers) && template.speakers.length ? template.speakers : ['reader'];
  const comics=(catalog.comics??[]).filter(c=>c.verified).slice(0,template.minComics??0).map(c=>c.id);
  const lines=template.defaultLines?structuredClone(template.defaultLines):Array.from({length:Math.max(speakers.length,comics.length)},(_,i)=>({speaker:speakers[i%speakers.length],text:'',...(comics.length>1?{comic:comics[i%comics.length]}:{})}));
  return { script: { version: 1, template: template.id, title: template.book===false?'Untitled scene':'Untitled reading', comics, ...(template.defaultScene?{scene:template.defaultScene}:{}), ...(template.defaultCharacters?{characters:structuredClone(template.defaultCharacters)}:{}), ...(template.book===false?{endCard:{enabled:false}}:{}), lines }, voice: 'flite', clearAttachments: true };
}
