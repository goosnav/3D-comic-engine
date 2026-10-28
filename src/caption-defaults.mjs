// Shared by validation, the editor, script generators and both renderers.
export const CAPTION_DEFAULTS = Object.freeze({
  enabled: true,
  position: 'top',
  colors: Object.freeze({ reader: '#FFFF00', friend: '#228B22' }),
});

export function captionDefaults(overrides = {}) {
  return { ...CAPTION_DEFAULTS, ...overrides,
    colors: { ...CAPTION_DEFAULTS.colors, ...overrides?.colors } };
}

// Top captions are centered at 12.5% inside the upper quarter (0–25%).
// The renderer limits captions to two lines, each at most 7.5% of height.
export function captionCenter(height, position = CAPTION_DEFAULTS.position) {
  return height * (position === 'bottom' ? .875 : .125);
}
