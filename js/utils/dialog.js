/**
 * Shared modal focus management (P5b / FE-14).
 *
 * One lightweight trap for every light-DOM dialog:
 * - keeps Tab / Shift+Tab inside the topmost dialog
 * - Escape closes only the TOP dialog (a confirm over an edit modal
 *   does not close the edit modal behind it)
 * - restores focus to the element that opened the dialog
 *
 * Usage:
 *   this._releaseFocus = trapFocus(box, { onClose: () => this.hide() });
 *   // in close/hide():
 *   if (this._releaseFocus) { this._releaseFocus(); this._releaseFocus = null; }
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

const stack = [];

function focusableItems(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);
}

/**
 * Trap keyboard focus inside `container` until the returned
 * function is called. Nested calls form a stack; only the
 * topmost entry reacts to keys and enforces the trap.
 *
 * @param {HTMLElement} container - the role="dialog" element
 * @param {{ onClose?: () => void }} [options] Escape handler
 * @returns {() => void} release function (also restores focus)
 */
export function trapFocus(container, { onClose } = {}) {
  if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');
  const opener = document.activeElement;
  const handle = { container, onClose, opener };

  handle.onFocusIn = (e) => {
    if (stack[stack.length - 1] !== handle) return;
    if (e.target === container || container.contains(e.target)) return;
    const items = focusableItems(container);
    (items[0] || container).focus();
  };

  handle.onKeydown = (e) => {
    if (stack[stack.length - 1] !== handle) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (typeof handle.onClose === 'function') handle.onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = focusableItems(container);
    if (!items.length) {
      e.preventDefault();
      container.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const inside = active !== null && container.contains(active);
    if (e.shiftKey) {
      if (!inside || active === first || active === container) {
        e.preventDefault();
        last.focus();
      }
    } else if (!inside || active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  document.addEventListener('focusin', handle.onFocusIn, true);
  document.addEventListener('keydown', handle.onKeydown, true);
  stack.push(handle);
  container.focus();

  return function releaseFocus() {
    const idx = stack.indexOf(handle);
    if (idx >= 0) stack.splice(idx, 1);
    document.removeEventListener('focusin', handle.onFocusIn, true);
    document.removeEventListener('keydown', handle.onKeydown, true);
    const o = handle.opener;
    if (o && o !== document.body && typeof o.focus === 'function' && document.contains(o)) {
      o.focus();
    }
  };
}
