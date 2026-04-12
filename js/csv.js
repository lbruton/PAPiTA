// CSV codec for PAPiTA — pure ES module, no dependencies, no DOM.

const COLUMNS = [
  "auth_code",
  "part_number",
  "description",
  "order_number",
  "order_date",
  "customer_po",
  "end_user_po",
  "serial",
  "claimed_by",
  "claimed_at",
  "imported_at",
  "purchased_at",
  "expires_at",
  "notes",
];

const INJECTION_CHARS = new Set(["=", "+", "-", "@"]);

function escapeCell(value) {
  let v = String(value ?? "");
  if (v.length > 0 && INJECTION_CHARS.has(v[0])) {
    v = "'" + v;
  }
  if (/[,"\n\r]/.test(v)) {
    v = '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

export function encode(records) {
  const lines = [COLUMNS.join(",")];
  for (const record of records) {
    const row = COLUMNS.map((col) => escapeCell(record[col]));
    lines.push(row.join(","));
  }
  return lines.join("\n") + "\n";
}

function tokenize(text) {
  // Returns array of rows, each row is an array of cell strings.
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < len && text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }

    // Not in quotes
    if (ch === '"' && cell === "") {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
      if (i < len && text[i] === "\n") i++;
      continue;
    }
    cell += ch;
    i++;
  }

  // Flush last cell/row
  row.push(cell);
  rows.push(row);
  return rows;
}

function unguardCell(v) {
  if (v.length >= 2 && v[0] === "'" && INJECTION_CHARS.has(v[1])) {
    return v.slice(1);
  }
  return v;
}

export function decode(text) {
  if (text == null || text === "") {
    return { records: [], errors: ["Empty CSV"] };
  }

  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  if (text === "") {
    return { records: [], errors: ["Empty CSV"] };
  }

  // Strip a single trailing newline (\n or \r\n)
  if (text.endsWith("\r\n")) {
    text = text.slice(0, -2);
  } else if (text.endsWith("\n") || text.endsWith("\r")) {
    text = text.slice(0, -1);
  }

  if (text === "") {
    return { records: [], errors: ["Empty CSV"] };
  }

  const rows = tokenize(text);

  if (rows.length === 0) {
    return { records: [], errors: ["Empty CSV"] };
  }

  const header = rows[0];
  const errors = [];

  // Required columns (core schema before PAP-3)
  const REQUIRED_COLUMNS = [
    "auth_code",
    "part_number",
    "description",
    "order_number",
    "order_date",
    "customer_po",
    "end_user_po",
    "serial",
    "claimed_by",
    "claimed_at",
    "imported_at",
    "notes",
  ];

  for (const col of REQUIRED_COLUMNS) {
    if (!header.includes(col)) {
      return { records: [], errors: [`Missing required column: ${col}`] };
    }
  }

  // Optional columns (added in PAP-3) — use defaults if missing
  const OPTIONAL_COLUMNS = ["purchased_at", "expires_at"];

  const records = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    // Ignore trailing empty line (single empty cell row)
    if (row.length === 1 && row[0] === "") continue;

    if (row.length !== header.length) {
      errors.push(`Row ${r}: wrong cell count`);
      continue;
    }

    const record = {};
    for (let c = 0; c < header.length; c++) {
      const key = header[c];
      if (COLUMNS.includes(key)) {
        record[key] = unguardCell(row[c]);
      }
    }
    records.push(record);
  }

  if (errors.length > 0) {
    return { records: [], errors };
  }

  return { records, errors: [] };
}
