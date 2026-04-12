// Purchase date picker modal — displayed before PDF/CSV import to capture
// the purchase date for license expiration calculation. Follows claim.js modal pattern.

import { el } from "./utils/dom.js";

let escapeListenerAttached = false;
let currentResolve = null;

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

/**
 * Show purchase date picker modal.
 * @returns {Promise<string|null>} - Resolves to YYYY-MM-DD date string or null on cancel
 */
export function showPurchaseDateModal() {
  return new Promise((resolve) => {
    currentResolve = resolve;

    const dateInput = el("input", {
      type: "date",
      id: "purchase-date-input",
      name: "purchase_date",
      required: true,
    });

    // Default to today
    dateInput.valueAsDate = new Date();

    const warningEl = el("p", {
      class: "purchase-date-warning",
      style: "display: none; color: var(--danger); margin-top: 8px;",
    }, "Date is in the future — continue?");

    // Validate for future date
    dateInput.addEventListener("input", () => {
      const selected = dateInput.valueAsDate;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selected && selected > today) {
        warningEl.style.display = "block";
      } else {
        warningEl.style.display = "none";
      }
    });

    const confirmBtn = el(
      "button",
      {
        type: "button",
        class: "btn btn-primary",
      },
      "Confirm",
    );

    const cancelBtn = el(
      "button",
      {
        type: "button",
        class: "btn",
      },
      "Cancel",
    );

    confirmBtn.addEventListener("click", () => {
      closeAllModals();
      const val = dateInput.value || null;
      currentResolve(val);
      currentResolve = null;
    });

    cancelBtn.addEventListener("click", () => {
      closeAllModals();
      currentResolve(null);
      currentResolve = null;
    });

    const panel = el(
      "div",
      {
        class: "modal-panel",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "purchase-date-title",
      },
      [
        el("h2", { id: "purchase-date-title", class: "modal-title" }, "Purchase Date"),
        el("p", { class: "modal-body" }, "Select the purchase date for this import:"),
        el("div", { class: "modal-body" }, [dateInput, warningEl]),
        el("div", { class: "modal-actions" }, [confirmBtn, cancelBtn]),
      ],
    );

    const backdrop = el(
      "div",
      { class: "modal-backdrop", role: "presentation" },
      panel,
    );

    // Backdrop click closes modal
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        closeAllModals();
        currentResolve(null);
        currentResolve = null;
      }
    });

    mountModal(backdrop);

    // Focus date input
    setTimeout(() => dateInput.focus(), 0);

    // Escape key closes modal
    if (!escapeListenerAttached) {
      document.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") {
          const root = getModalRoot();
          if (root && root.firstChild) {
            closeAllModals();
            if (currentResolve) {
              currentResolve(null);
              currentResolve = null;
            }
          }
        }
      });
      escapeListenerAttached = true;
    }
  });
}
