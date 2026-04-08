// Entry module — wires DOM events, hydrates store, subscribes render to store.

import * as store from "./store.js";
import * as render from "./render.js";
import * as claim from "./claim.js";
import * as csv from "./csv.js";
import { parseFile } from "./parser.js";
import { el } from "./utils/dom.js";

const STORAGE_KEY = "pan-auth-tracker-v1";

let downloadErrorHandler = null;
function downloadBlob(content, filename, mime) {
  try {
    const blob = new Blob([content], { type: mime || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch (e) {
    if (downloadErrorHandler) {
      downloadErrorHandler({
        type: "download-error",
        message: "Couldn't save file: " + (e && e.message ? e.message : String(e)),
      });
    }
  }
}

function todayStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function debounce(fn, ms) {
  let t = null;
  return function (...args) {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), ms);
  };
}

function warningMessage(warning) {
  if (!warning) return "";
  if (typeof warning === "string") return warning;
  if (typeof warning.message === "string" && warning.message.length > 0) {
    return warning.message;
  }
  const map = {
    "storage-unavailable":
      "Your changes aren't being saved — localStorage is disabled or unavailable.",
    "quota-exceeded":
      "Your changes aren't being saved — localStorage is full. Export your data before closing this tab.",
    "corrupt-payload":
      "The locally-stored dataset is corrupt and could not be loaded.",
    "download-error": "Couldn't save the file.",
  };
  if (warning.type && map[warning.type]) return map[warning.type];
  return String(warning.type || warning || "Unknown warning");
}

document.addEventListener("DOMContentLoaded", () => {
  // Prevent browser default drop navigation anywhere on the window.
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());

  const toolbarEl = document.getElementById("toolbar");
  const mainEl = document.getElementById("main");
  const statsEl = document.getElementById("stats");
  const emptyEl = document.getElementById("empty-state");
  const tableWrap = document.getElementById("table-wrap");
  const tableEl = document.getElementById("records-table");
  const bannerRoot = document.getElementById("banner-root");
  const modalRoot = document.getElementById("modal-root");
  void mainEl;
  void modalRoot;

  // --------- Toolbar build ----------
  const pdfInput = el("input", {
    type: "file",
    id: "pdf-input",
    accept: ".pdf",
    hidden: true,
  });
  const csvInput = el("input", {
    type: "file",
    id: "csv-input",
    accept: ".csv,text/csv",
    hidden: true,
  });
  const dropLabel = el("label", { class: "drop-zone" }, [pdfInput]);

  const brand = el("span", { class: "brand" }, "PAPiTA");
  const spacer = el("div", { class: "spacer" });

  const importPdfBtn = el("button", { type: "button", class: "btn" }, "Import PDF");
  const importCsvBtn = el("button", { type: "button", class: "btn" }, "Import CSV");
  const exportCsvBtn = el("button", { type: "button", class: "btn" }, "Export CSV");
  const clearBtn = el("button", { type: "button", class: "btn btn-danger" }, "Clear");

  const filterInput = el("input", {
    type: "search",
    id: "filter-input",
    class: "filter-input",
    placeholder: "Filter\u2026",
  });

  toolbarEl.appendChild(brand);
  toolbarEl.appendChild(dropLabel);
  toolbarEl.appendChild(csvInput);
  toolbarEl.appendChild(importPdfBtn);
  toolbarEl.appendChild(importCsvBtn);
  toolbarEl.appendChild(exportCsvBtn);
  toolbarEl.appendChild(clearBtn);
  toolbarEl.appendChild(spacer);
  toolbarEl.appendChild(filterInput);

  // --------- Banner helpers ----------
  function showBanner(warning) {
    const msg = warningMessage(warning);
    if (!msg) return;
    while (bannerRoot.firstChild) bannerRoot.removeChild(bannerRoot.firstChild);
    const dismiss = el(
      "button",
      { type: "button", class: "banner-dismiss" },
      "Dismiss",
    );
    const banner = el("div", { class: "banner", role: "alert" }, [
      el("span", { class: "banner-msg" }, msg),
      dismiss,
    ]);
    dismiss.addEventListener("click", () => {
      if (banner.parentNode) banner.parentNode.removeChild(banner);
    });
    bannerRoot.appendChild(banner);
  }

  // --------- Render pipeline ----------
  function updateStats(payload) {
    if (!payload) return;
    while (statsEl.firstChild) statsEl.removeChild(statsEl.firstChild);
    const visible = el("strong", {}, String(payload.visible));
    const claimed = el("strong", {}, String(payload.claimed));
    const unclaimed = el("strong", {}, String(payload.unclaimed));
    statsEl.appendChild(visible);
    statsEl.appendChild(document.createTextNode(" rows \u00B7 "));
    statsEl.appendChild(claimed);
    statsEl.appendChild(document.createTextNode(" claimed \u00B7 "));
    statsEl.appendChild(unclaimed);
    statsEl.appendChild(document.createTextNode(" unclaimed"));
  }

  function rerender() {
    const records = store.getAll();
    const empty = records.length === 0;
    emptyEl.hidden = !empty;
    tableWrap.hidden = empty;
    statsEl.hidden = empty;
    if (!empty) {
      render.render(tableEl, records);
    } else {
      updateStats({ visible: 0, claimed: 0, unclaimed: 0, total: 0 });
    }
  }

  // --------- Store subscriptions (registered BEFORE hydration so
  // startup warnings like storage-unavailable / corrupt-payload are seen) ----------
  store.subscribe(() => rerender());
  store.subscribeWarnings((w) => showBanner(w));
  render.onRerender((stats) => updateStats(stats));
  downloadErrorHandler = (w) => showBanner(w);

  // --------- Store hydration ----------
  const loadResult = store.loadFromStorage();
  if (loadResult && loadResult.ok === false) {
    claim.showRecoveryModal({
      onExportRaw: () => {
        let raw = "";
        try {
          raw = localStorage.getItem(STORAGE_KEY) || "";
        } catch (_err) {
          raw = "";
        }
        downloadBlob(raw, "papita-raw.json", "application/json");
      },
      onClear: () => {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch (_err) {
          // swallow
        }
        rerender();
      },
    });
  }

  // --------- Delegation + claim init ----------
  render.attachDelegation(tableEl, {
    onSort: (col) => render.setSort(col),
    onStartClaim: (code) => claim.startClaim(code),
    onCancelClaim: (code) => claim.cancelClaim(code),
    onSubmitClaim: (code, serial, claimedBy) => claim.commitClaim(code, serial, claimedBy),
    onUnclaim: (code) => claim.unclaim(code),
  });
  claim.init({ renderTrigger: rerender });

  // --------- Toolbar wiring ----------
  const onFilterInput = debounce((value) => {
    render.setFilter(value);
  }, 100);
  filterInput.addEventListener("input", (ev) => {
    onFilterInput(ev.target.value);
  });

  importPdfBtn.addEventListener("click", () => pdfInput.click());
  importCsvBtn.addEventListener("click", () => csvInput.click());

  async function handlePdfFile(file) {
    if (!file) return;
    try {
      const result = await parseFile(file);
      if (result && result.error) {
        showBanner({ type: "pdf-error", message: result.error });
        return;
      }
      const recs = (result && result.records) || [];
      const upsertResult = store.upsertMany(recs);
      showBanner({
        type: "import-ok",
        message: `Imported ${upsertResult.added} new / ${upsertResult.skipped} skipped / ${upsertResult.updated} updated`,
      });
    } catch (err) {
      showBanner({ type: "pdf-error", message: String(err && err.message ? err.message : err) });
    }
  }

  pdfInput.addEventListener("change", (ev) => {
    const file = ev.target.files && ev.target.files[0];
    handlePdfFile(file);
    ev.target.value = "";
  });

  dropLabel.addEventListener("dragover", (ev) => {
    ev.preventDefault();
  });
  dropLabel.addEventListener("drop", (ev) => {
    ev.preventDefault();
    const file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    handlePdfFile(file);
  });

  // Whole-page drop zone — operator can drop anywhere.
  document.body.addEventListener("dragover", (ev) => {
    ev.preventDefault();
  });
  document.body.addEventListener("drop", (ev) => {
    ev.preventDefault();
    const file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (file && /\.pdf$/i.test(file.name)) handlePdfFile(file);
  });

  csvInput.addEventListener("change", async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = csv.decode(text);
      if (result.errors && result.errors.length > 0) {
        showBanner({
          type: "csv-error",
          message: "CSV import rejected: " + result.errors.join("; "),
        });
      } else {
        const up = store.upsertMany(result.records);
        showBanner({
          type: "import-ok",
          message: `Imported ${up.added} new / ${up.skipped} skipped / ${up.updated} updated`,
        });
      }
    } catch (err) {
      showBanner({ type: "csv-error", message: String(err && err.message ? err.message : err) });
    }
    ev.target.value = "";
  });

  exportCsvBtn.addEventListener("click", () => {
    const text = csv.encode(store.getAll());
    downloadBlob(text, `papita-export-${todayStamp()}.csv`, "text/csv");
  });

  clearBtn.addEventListener("click", () => {
    if (!window.confirm("Clear all records? This cannot be undone.")) return;
    const snapshot = JSON.stringify({
      schema_version: 1,
      records: [],
      last_saved_at: new Date().toISOString(),
    });
    store.importSnapshot(snapshot);
  });

  // --------- Initial render ----------
  rerender();
});
