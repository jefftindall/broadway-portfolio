import { STUDIO_PAY_LINK_LABELS } from './studioPeople.ts';

const COPY_ICON =
  '<svg class="pay-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="1.5"/><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/></svg>';

const SHARE_ICON =
  '<svg class="pay-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M12 16V4m0 0 4 4m-4-4-4 4"/><path d="M5 20h14a2 2 0 0 0 2-2v-3"/></svg>';

const CHEVRON_ICON =
  '<svg class="pay-link-icon pay-link-icon--chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

export type PayLinkAction = 'copy' | 'share';

/** Mobile prefers Share as the primary action when the Web Share API exists. */
export function prefersShareDefault(viewport = typeof window !== 'undefined' ? window : undefined): boolean {
  if (!viewport) return false;
  return viewport.matchMedia('(max-width: 767px)').matches;
}

export function primaryPayLinkAction(
  shareAvailable = typeof navigator !== 'undefined' && typeof navigator.share === 'function',
  mobile = prefersShareDefault(),
): PayLinkAction {
  if (shareAvailable && mobile) return 'share';
  return 'copy';
}

function actionLabel(action: PayLinkAction, productLabel: string): string {
  return action === 'share' ? `Share ${productLabel}` : `Copy ${productLabel}`;
}

async function copyHref(href: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(href);
    return true;
  } catch {
    return false;
  }
}

function closeMenus(except?: HTMLElement) {
  document.querySelectorAll<HTMLElement>('.pay-link-menu[data-open="true"]').forEach((menu) => {
    if (menu !== except) menu.dataset.open = 'false';
  });
}

function createMenuButton(
  action: PayLinkAction,
  productLabel: string,
  href: string,
  onError: (message: string) => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pay-link-menu__item';
  button.innerHTML = `${action === 'copy' ? COPY_ICON : SHARE_ICON}<span>${actionLabel(action, productLabel)}</span>`;
  button.addEventListener('click', () => {
    closeMenus();
    void runPayLinkAction(action, href, productLabel, onError);
  });
  return button;
}

export async function runPayLinkAction(
  action: PayLinkAction,
  href: string,
  productLabel: string,
  onError: (message: string) => void,
): Promise<boolean> {
  if (action === 'share' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: productLabel, url: href });
      return true;
    } catch {
      return false;
    }
  }
  const ok = await copyHref(href);
  if (!ok) onError('Could not copy that link.');
  return ok;
}

function setPrimaryLabel(button: HTMLButtonElement, action: PayLinkAction, productLabel: string) {
  const icon = action === 'share' ? SHARE_ICON : COPY_ICON;
  button.innerHTML = `${icon}<span>${actionLabel(action, productLabel)}</span>`;
  button.dataset.action = action;
  button.dataset.productLabel = productLabel;
}

export function createPayLinkMenu(
  href: string,
  productLabel: string,
  onError: (message: string) => void,
  opts: { shareAvailable?: boolean; mobile?: boolean } = {},
): HTMLElement {
  const shareAvailable =
    opts.shareAvailable ?? (typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  const mobile = opts.mobile ?? prefersShareDefault();
  const primary = primaryPayLinkAction(shareAvailable, mobile);
  const secondary: PayLinkAction = primary === 'copy' ? 'share' : 'copy';

  const wrap = document.createElement('div');
  wrap.className = 'pay-link-menu';
  wrap.dataset.open = 'false';

  const group = document.createElement('div');
  group.className = 'pay-link-split';

  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'pay-link-split__main';
  setPrimaryLabel(main, primary, productLabel);
  main.addEventListener('click', async () => {
    const action = (main.dataset.action as PayLinkAction) || primary;
    const label = main.dataset.productLabel || productLabel;
    if (action === 'copy') {
      const ok = await runPayLinkAction('copy', href, label, onError);
      if (ok) {
        main.innerHTML = `${COPY_ICON}<span>Copied</span>`;
        window.setTimeout(() => setPrimaryLabel(main, primary, productLabel), 1500);
      }
      return;
    }
    await runPayLinkAction('share', href, label, onError);
  });

  group.append(main);

  if (shareAvailable) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'pay-link-split__toggle';
    toggle.setAttribute('aria-haspopup', 'menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', `More ways to send ${productLabel}`);
    toggle.innerHTML = CHEVRON_ICON;
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = wrap.dataset.open === 'true';
      closeMenus(open ? undefined : wrap);
      wrap.dataset.open = open ? 'false' : 'true';
      toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
    });

    const menu = document.createElement('div');
    menu.className = 'pay-link-menu__panel';
    menu.setAttribute('role', 'menu');
    menu.append(createMenuButton(secondary, productLabel, href, onError));

    group.append(toggle, menu);
  }

  wrap.append(group);
  return wrap;
}

export function renderPayLinkMenus(
  container: HTMLElement,
  links: Record<string, string>,
  onError: (message: string) => void,
  labels: Record<string, string> = STUDIO_PAY_LINK_LABELS,
): void {
  const entries = Object.entries(links || {});
  container.replaceChildren(
    ...entries.map(([id, href]) => createPayLinkMenu(href, labels[id] || id, onError)),
  );
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (event) => {
    const target = event.target as Node | null;
    if (!target || !(target instanceof Element) || target.closest('.pay-link-menu')) return;
    closeMenus();
    document.querySelectorAll<HTMLElement>('.pay-link-split__toggle[aria-expanded="true"]').forEach((toggle) => {
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}
