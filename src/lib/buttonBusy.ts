/** Disable API action buttons while a fetch is in flight (see docs/style-guide.md). */

import { BUSY_SPINNER_MARKUP } from './studioStatus.ts';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const API_BUTTON_PRIMARY_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-sm bg-gold px-4 py-2 text-sm font-semibold text-ink hover:brightness-110 disabled:cursor-wait disabled:opacity-60 disabled:hover:brightness-100';

export const API_BUTTON_SECONDARY_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-sm border border-line px-4 py-2 text-sm text-spotlight hover:border-gold disabled:cursor-wait disabled:opacity-60';

export function isButtonBusy(button: HTMLButtonElement): boolean {
  return button.dataset.busy === '1';
}

/** Disable the button, show a spinner, and optionally swap the label until cleared. */
export function setButtonBusy(
  button: HTMLButtonElement,
  busy: boolean,
  workingLabel?: string,
): void {
  if (busy) {
    if (isButtonBusy(button)) return;
    button.dataset.wasDisabledBeforeBusy = button.disabled ? '1' : '0';
    if (!button.dataset.label) {
      button.dataset.label = button.textContent?.trim() || '';
    }
    button.dataset.busy = '1';
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.classList.add('btn-busy');
    const label = workingLabel ?? button.dataset.label;
    button.innerHTML = `${BUSY_SPINNER_MARKUP}<span>${escapeHtml(label)}</span>`;
    return;
  }

  if (!isButtonBusy(button)) return;
  delete button.dataset.busy;
  button.removeAttribute('aria-busy');
  button.classList.remove('btn-busy');
  button.textContent = button.dataset.label || '';
  button.disabled = button.dataset.wasDisabledBeforeBusy === '1';
  delete button.dataset.wasDisabledBeforeBusy;
}

/** Run an async action with button busy state; always clears on success or failure. */
export async function withButtonBusy<T>(
  button: HTMLButtonElement,
  fn: () => Promise<T>,
  workingLabel?: string,
): Promise<T | undefined> {
  if (isButtonBusy(button)) return undefined;
  setButtonBusy(button, true, workingLabel);
  try {
    return await fn();
  } finally {
    setButtonBusy(button, false);
  }
}
