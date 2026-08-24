/** Studio status line + busy spinner markup (see docs/style-guide.md). */

export const BUSY_STATUS_CLASS = 'busy-status';

export const BUSY_SPINNER_MARKUP = '<span class="busy-spinner" aria-hidden="true"></span>';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Initial/static markup children for a loading status line (parent needs `busy-status`). */
export function busyStatusChildrenMarkup(message: string): string {
  return `${BUSY_SPINNER_MARKUP}<span>${escapeHtml(message)}</span>`;
}

/** Set a `role="status"` line; pass `busy: true` while waiting on the API. */
export function setStudioStatus(el: HTMLElement, message: string, busy = false): void {
  if (!message) {
    clearStudioStatus(el);
    return;
  }
  if (busy) {
    el.classList.add(BUSY_STATUS_CLASS);
    el.innerHTML = busyStatusChildrenMarkup(message);
    return;
  }
  el.classList.remove(BUSY_STATUS_CLASS);
  el.textContent = message;
}

export function clearStudioStatus(el: HTMLElement): void {
  el.classList.remove(BUSY_STATUS_CLASS);
  el.replaceChildren();
}
