// Screen mockup helpers (R3.7): a Screen shows either HTML code or a web page by URL.

// Whether `text` is an absolute http:// or https:// address (anything else, e.g. javascript: or
// data:, is refused).
export function isWebUrl(text) {
  if (typeof text !== 'string' || text !== text.trim() || !text) return false;
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Ordinary editor HTML previews get no permissions; URL pages keep scripts and origin (R3.9).
export const HTML_SANDBOX = '';
// Board content measurement and editor picking only; scripts and forms stay blocked.
export const HTML_INSPECTION_SANDBOX = 'allow-same-origin';
export const URL_SANDBOX = 'allow-scripts allow-same-origin';
// The movie strip (R11.4) lets HTML code run its scripts, without same origin: the board stays out of reach.
export const MOVIE_HTML_SANDBOX = 'allow-scripts';

// Layout viewport: HTML fits visible content; URLs scale the full page (R3.8).
export const MOCKUP_W = 1024;
export const MOCKUP_H = 768;

export function fitMockup(bounds, width, height) {
  if (!bounds) return { x: 0, y: 0, scale: width / MOCKUP_W };
  const padding = 8;
  const scale = Math.min(width / (bounds.width + padding * 2), height / (bounds.height + padding * 2));
  return {
    x: (width - bounds.width * scale) / 2 - bounds.x * scale,
    y: (height - bounds.height * scale) / 2 - bounds.y * scale,
    scale,
  };
}
