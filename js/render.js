// Render layer — builds table thead/tbody from records via HTML strings,
// all user data escaped via escapeHtml. Exposes setSort/setFilter/attachDelegation
// and an onRerender hook for the stats strip.

import { escapeHtml } from "./utils/escape.js";
import { delegate } from "./utils/dom.js";

const COLUMNS = [
  { key: "auth_code", label: "Auth Code", mono: true },
  { key: "part_number", label: "Part Number" },
  { key: "description", label: "Description" },
  { key: "order_number", label: "Order #" },
  { key: "serial", label: "Serial", mono: true },
  { key: "claimed_by", label: "Claimed By" },
  { key: "claimed_at", label: "Claimed At" },
];

const viewState = { sort: null, filter: "" };
const claimingSet = new Set();
const rerenderSubscribers = new Set();
let lastRoot = null;
let lastRecords = [];

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().replace("T", " ").slice(0, 16);
}

function filterRows(records, filter) {
  const f = (filter || "").trim().toLowerCase();
  if (!f) return records.slice();
  return records.filter((r) => {
    return (
      String(r.auth_code || "").toLowerCase().includes(f) ||
      String(r.part_number || "").toLowerCase().includes(f) ||
      String(r.description || "").toLowerCase().includes(f) ||
      String(r.serial || "").toLowerCase().includes(f)
    );
  });
}

function sortRows(rows, sort) {
  if (!sort) return rows;
  const { column, dir } = sort;
  const mul = dir === "desc" ? -1 : 1;
  const decorated = rows.map((r, i) => ({ r, i }));
  decorated.sort((a, b) => {
    const av = String(a.r[column] ?? "");
    const bv = String(b.r[column] ?? "");
    if (av < bv) return -1 * mul;
    if (av > bv) return 1 * mul;
    const aa = String(a.r.auth_code ?? "");
    const bb = String(b.r.auth_code ?? "");
    if (aa < bb) return -1;
    if (aa > bb) return 1;
    return a.i - b.i;
  });
  return decorated.map((d) => d.r);
}

function renderHead(rootEl) {
  const parts = [];
  parts.push("<tr>");
  for (const col of COLUMNS) {
    let arrow = "";
    if (viewState.sort && viewState.sort.column === col.key) {
      arrow = viewState.sort.dir === "asc" ? " \u25B2" : " \u25BC";
    }
    parts.push(
      '<th data-action="sort" data-column="' +
        escapeHtml(col.key) +
        '">' +
        escapeHtml(col.label) +
        '<span class="arrow">' +
        escapeHtml(arrow) +
        "</span></th>",
    );
  }
  parts.push('<th class="actions-head">Actions</th>');
  parts.push("</tr>");
  const thead = rootEl.querySelector("thead");
  if (thead) thead.innerHTML = parts.join("");
}

function renderBody(rootEl, rows) {
  const parts = [];
  for (const r of rows) {
    const claimed = !!r.claimed_at;
    const cls = claimed ? "row claimed" : "row unclaimed";
    const authCode = escapeHtml(r.auth_code || "");
    const isClaiming = claimingSet.has(r.auth_code);

    parts.push('<tr class="' + cls + '" data-auth-code="' + authCode + '">');
    parts.push('<td class="mono">' + authCode + "</td>");
    parts.push("<td>" + escapeHtml(r.part_number || "") + "</td>");
    parts.push("<td>" + escapeHtml(r.description || "") + "</td>");
    parts.push("<td>" + escapeHtml(r.order_number || "") + "</td>");

    if (isClaiming) {
      parts.push(
        '<td colspan="2"><form class="claim-form" data-action="submit-claim" data-auth-code="' +
          authCode +
          '">' +
          '<input name="serial" type="text" autofocus placeholder="Serial">' +
          '<input name="claimed_by" type="text" placeholder="Your name">' +
          "<button type=\"submit\">Save</button>" +
          '<button type="button" data-action="cancel-claim" data-auth-code="' +
          authCode +
          '">Cancel</button>' +
          "</form></td>",
      );
    } else {
      parts.push('<td class="mono">' + escapeHtml(r.serial || "") + "</td>");
      parts.push("<td>" + escapeHtml(r.claimed_by || "") + "</td>");
    }

    parts.push('<td class="muted">' + escapeHtml(fmtDate(r.claimed_at)) + "</td>");

    let actionBtn = "";
    if (isClaiming) {
      actionBtn = "";
    } else if (claimed) {
      actionBtn =
        '<button class="btn" data-action="unclaim" data-auth-code="' +
        authCode +
        '">Unclaim</button>';
    } else {
      actionBtn =
        '<button class="btn" data-action="start-claim" data-auth-code="' +
        authCode +
        '">Claim</button>';
    }
    parts.push('<td><div class="row-actions">' + actionBtn + "</div></td>");

    parts.push("</tr>");
  }
  const tbody = rootEl.querySelector("tbody");
  if (tbody) tbody.innerHTML = parts.join("");
}

function fireRerender(records, visibleCount) {
  const claimed = records.filter((r) => !!r.claimed_at).length;
  const unclaimed = records.length - claimed;
  const payload = {
    visible: visibleCount,
    claimed,
    unclaimed,
    total: records.length,
  };
  for (const fn of rerenderSubscribers) {
    try {
      fn(payload);
    } catch (_err) {
      // swallow
    }
  }
}

export function render(rootEl, records) {
  lastRoot = rootEl;
  lastRecords = records || [];
  const filtered = filterRows(lastRecords, viewState.filter);
  const sorted = sortRows(filtered, viewState.sort);
  renderHead(rootEl);
  renderBody(rootEl, sorted);
  fireRerender(lastRecords, sorted.length);
}

function rerender() {
  if (lastRoot) render(lastRoot, lastRecords);
}

export function setSort(column, dir) {
  if (!dir) {
    if (viewState.sort && viewState.sort.column === column) {
      dir = viewState.sort.dir === "asc" ? "desc" : "asc";
    } else {
      dir = "asc";
    }
  }
  if (dir !== "asc" && dir !== "desc") dir = "asc";
  viewState.sort = { column, dir };
  rerender();
}

export function setFilter(text) {
  viewState.filter = String(text || "");
  rerender();
}

export function getViewState() {
  return {
    sort: viewState.sort ? { ...viewState.sort } : null,
    filter: viewState.filter,
  };
}

export function startClaimUI(authCode) {
  if (authCode) claimingSet.add(authCode);
  rerender();
}

export function endClaimUI(authCode) {
  if (authCode) claimingSet.delete(authCode);
  rerender();
}

export function onRerender(fn) {
  rerenderSubscribers.add(fn);
  return () => rerenderSubscribers.delete(fn);
}

export function attachDelegation(rootEl, handlers) {
  const h = handlers || {};

  delegate(rootEl, '[data-action="sort"]', "click", (_ev, node) => {
    const col = node.dataset.column;
    if (col && h.onSort) h.onSort(col);
  });

  delegate(rootEl, '[data-action="start-claim"]', "click", (_ev, node) => {
    const code = node.dataset.authCode;
    if (code && h.onStartClaim) h.onStartClaim(code);
  });

  delegate(rootEl, '[data-action="cancel-claim"]', "click", (_ev, node) => {
    const code = node.dataset.authCode;
    if (code && h.onCancelClaim) h.onCancelClaim(code);
  });

  delegate(rootEl, '[data-action="unclaim"]', "click", (_ev, node) => {
    const code = node.dataset.authCode;
    if (code && h.onUnclaim) h.onUnclaim(code);
  });

  delegate(rootEl, '[data-action="claim"]', "click", (_ev, node) => {
    const code = node.dataset.authCode;
    if (code && h.onClaim) h.onClaim(code);
  });

  delegate(rootEl, '[data-action="submit-claim"]', "submit", (ev, node) => {
    ev.preventDefault();
    const code = node.dataset.authCode;
    const input = node.querySelector('input[name="serial"]');
    const byInput = node.querySelector('input[name="claimed_by"]');
    const serial = input ? input.value : "";
    const claimedBy = byInput ? byInput.value : "";
    if (code && h.onSubmitClaim) h.onSubmitClaim(code, serial, claimedBy);
  });
}
