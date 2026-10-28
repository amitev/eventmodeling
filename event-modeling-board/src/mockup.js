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

// Sandbox of the preview iframe: HTML code gets no permissions (no scripts, forms, same
// origin); a page by URL runs its own scripts so real sites work (R3.9).
export const HTML_SANDBOX = '';
export const URL_SANDBOX = 'allow-scripts allow-same-origin';

// The size a Screen mockup is laid out at (4:3), then scaled down to where it is shown (R3.8).
export const MOCKUP_W = 1024;
export const MOCKUP_H = 768;
