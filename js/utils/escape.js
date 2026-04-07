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
  const normalized = String(str ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(normalized)) {
    throw new Error(`Invalid auth code: ${normalized}`);
  }
  return normalized;
}
