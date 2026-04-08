// HTML escaping and auth code normalization utilities.

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

export function normalizeAuthCode(str) {
  const original = String(str ?? "");
  const normalized = original.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(normalized)) {
    throw new Error(`Invalid auth code: ${original}`);
  }
  return normalized;
}
