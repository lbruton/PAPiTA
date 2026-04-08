// Claim orchestration — start/cancel/commit/unclaim plus duplicate-serial
// and recovery modals. All user-supplied values flow through textContent via
// el() to avoid HTML injection.

import * as store from "./store.js";
import * as render from "./render.js";
import { el } from "./utils/dom.js";

let renderTrigger = () => {};
let escapeListenerAttached = false;

function getModalRoot() {
  return document.getElementById("modal-root");
}

function closeAllModals() {
  const root = getModalRoot();
  if (!root) return;
  while (root.firstChild) root.removeChild(root.firstChild);
}

function mountModal(node) {
  const root = getModalRoot();
  if (!root) return;
  closeAllModals();
  root.appendChild(node);
}

export function startClaim(authCode) {
  render.startClaimUI(authCode);
  renderTrigger();
}

export function cancelClaim(authCode) {
  render.endClaimUI(authCode);
  renderTrigger();
}

export function unclaim(authCode) {
  store.unclaim(authCode);
  // store.subscribe triggers re-render via app.js
}

export function commitClaim(authCode, serial, claimedBy) {
  const result = store.claim(authCode, serial, { claimedBy });
  if (result && result.ok) {
    render.endClaimUI(authCode);
    renderTrigger();
    return;
  }
  if (result && result.conflict) {
    openDuplicateModal({
      authCode,
      serial: result.conflict.serial || serial,
      otherCode: result.conflict.authCode,
      claimedBy,
    });
    return;
  }
  // Non-conflict error — leave row in claim-in-progress for the user to retry.
}

function openDuplicateModal({ authCode, serial, otherCode, claimedBy = "" }) {
  const cancelBtn = el(
    "button",
    {
      type: "button",
      class: "btn",
      "data-modal-action": "cancel",
    },
    "Cancel",
  );

  const overrideBtn = el(
    "button",
    {
      type: "button",
      class: "btn btn-danger",
      "data-modal-action": "override",
    },
    "Override",
  );

  cancelBtn.addEventListener("click", () => {
    closeAllModals();
  });

  overrideBtn.addEventListener("click", () => {
    const result = store.claim(authCode, serial, { override: true, claimedBy });
    if (result && result.ok) {
      render.endClaimUI(authCode);
      closeAllModals();
      renderTrigger();
    }
  });

  const serialCode = el("code", { class: "mono" }, serial);
  const otherCodeEl = el("code", { class: "mono" }, otherCode);

  const body = el("p", { class: "modal-body" }, [
    "Serial ",
    serialCode,
    " is already claimed by auth code ",
    otherCodeEl,
    ". Override?",
  ]);

  const panel = el(
    "div",
    {
      class: "modal-panel",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "dup-title",
    },
    [
      el("h2", { id: "dup-title", class: "modal-title" }, "Duplicate serial"),
      body,
      el("div", { class: "modal-actions" }, [cancelBtn, overrideBtn]),
    ],
  );

  const backdrop = el(
    "div",
    { class: "modal-backdrop", role: "presentation" },
    panel,
  );

  mountModal(backdrop);
  setTimeout(() => cancelBtn.focus(), 0);
}

export function showRecoveryModal({ onExportRaw, onClear }) {
  const exportBtn = el(
    "button",
    { type: "button", class: "btn", "data-modal-action": "export" },
    "Export Raw",
  );
  const clearBtn = el(
    "button",
    { type: "button", class: "btn btn-danger", "data-modal-action": "clear" },
    "Clear",
  );

  exportBtn.addEventListener("click", () => {
    try {
      if (typeof onExportRaw === "function") onExportRaw();
    } finally {
      closeAllModals();
    }
  });

  clearBtn.addEventListener("click", () => {
    try {
      if (typeof onClear === "function") onClear();
    } finally {
      closeAllModals();
    }
  });

  const panel = el(
    "div",
    {
      class: "modal-panel",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "rec-title",
    },
    [
      el("h2", { id: "rec-title", class: "modal-title" }, "Stored data is corrupt"),
      el(
        "p",
        { class: "modal-body" },
        "The locally-stored dataset could not be parsed. You may export the raw payload for recovery, or clear it and start fresh.",
      ),
      el("div", { class: "modal-actions" }, [exportBtn, clearBtn]),
    ],
  );

  const backdrop = el(
    "div",
    { class: "modal-backdrop", role: "presentation" },
    panel,
  );

  mountModal(backdrop);
  setTimeout(() => exportBtn.focus(), 0);
}

export function init({ renderTrigger: trigger } = {}) {
  if (typeof trigger === "function") renderTrigger = trigger;
  if (!escapeListenerAttached) {
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        const root = getModalRoot();
        if (root && root.firstChild) {
          closeAllModals();
        }
      }
    });
    escapeListenerAttached = true;
  }
}
