// ISO 8601 time helpers.

export function nowIso() {
  return new Date().toISOString();
}

export function parseIso(str) {
  if (str === null || str === undefined) return null;
  if (typeof str !== "string") return null;
  const date = new Date(str);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString() !== str) return null;
  return date;
}
