const RECOVERY_KEY = 'planyx:chunk-recovery';
const REFRESH_MARKER = '_japs_refresh';
const RECOVERY_WINDOW_MS = 60_000;

type RecoveryRecord = {
  path: string;
  attemptedAt: number;
  message: string;
};

type VitePreloadErrorEvent = Event & {
  payload?: unknown;
};

function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message || 'A page module could not be loaded.';
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'message' in value) {
    return String((value as { message?: unknown }).message || 'A page module could not be loaded.');
  }
  return 'A page module could not be loaded.';
}

function readRecovery(): RecoveryRecord | null {
  try {
    const value = window.sessionStorage.getItem(RECOVERY_KEY);
    if (!value) return null;
    return JSON.parse(value) as RecoveryRecord;
  } catch {
    return null;
  }
}

function saveRecovery(record: RecoveryRecord) {
  try {
    window.sessionStorage.setItem(RECOVERY_KEY, JSON.stringify(record));
  } catch {
    // Recovery must still work when storage is restricted.
  }
}

function makeButton(label: string, primary = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.style.cssText = [
    'min-height:44px',
    'border-radius:12px',
    'padding:11px 18px',
    'font:600 14px/1.2 Segoe UI,Arial,sans-serif',
    'cursor:pointer',
    primary ? 'background:#2563eb;color:#fff;border:1px solid #3b82f6' : 'background:rgba(255,255,255,.06);color:#e2e8f0;border:1px solid rgba(255,255,255,.14)',
  ].join(';');
  return button;
}

function renderEmergencyPage(message: string) {
  const reference = `JAPS-${Date.now().toString(36).toUpperCase()}`;
  document.title = 'Sousa Murray Planeia — Page update required';
  document.body.replaceChildren();
  document.body.style.margin = '0';
  document.body.style.background = '#020617';

  const main = document.createElement('main');
  main.style.cssText = 'min-height:100vh;box-sizing:border-box;padding:40px 20px;display:flex;align-items:center;justify-content:center;color:#e2e8f0;font-family:Segoe UI,Arial,sans-serif';

  const card = document.createElement('section');
  card.style.cssText = 'width:min(720px,100%);border:1px solid rgba(255,255,255,.12);border-radius:24px;background:#0f172a;box-shadow:0 30px 80px rgba(0,0,0,.45);overflow:hidden';

  const header = document.createElement('div');
  header.style.cssText = 'padding:22px 28px;border-bottom:1px solid rgba(255,255,255,.1);background:linear-gradient(90deg,rgba(37,99,235,.24),rgba(15,23,42,1),rgba(6,182,212,.12));display:flex;align-items:center;gap:14px';

  const logo = document.createElement('div');
  logo.textContent = 'JA';
  logo.style.cssText = 'width:48px;height:48px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:rgba(59,130,246,.15);border:1px solid rgba(96,165,250,.35);font-weight:900;color:#bfdbfe';

  const brand = document.createElement('div');
  const brandTitle = document.createElement('strong');
  brandTitle.textContent = 'Sousa Murray Planeia';
  brandTitle.style.cssText = 'display:block;color:#fff;font-size:16px';
  const brandSub = document.createElement('span');
  brandSub.textContent = 'Secure application recovery';
  brandSub.style.cssText = 'display:block;margin-top:3px;color:#94a3b8;font-size:13px';
  brand.append(brandTitle, brandSub);
  header.append(logo, brand);

  const content = document.createElement('div');
  content.style.cssText = 'padding:32px 28px';

  const eyebrow = document.createElement('p');
  eyebrow.textContent = 'PAGE UPDATE REQUIRED';
  eyebrow.style.cssText = 'margin:0;color:#93c5fd;font-size:12px;font-weight:800;letter-spacing:.16em';

  const title = document.createElement('h1');
  title.textContent = 'This page needs the latest Sousa Murray Planeia files';
  title.style.cssText = 'margin:10px 0 0;color:#fff;font-size:clamp(26px,5vw,36px);line-height:1.14;letter-spacing:-.025em';

  const explanation = document.createElement('p');
  explanation.textContent = 'Sousa Murray Planeia was updated while this tab was open. The page could not safely load the previous file, so a controlled refresh is required.';
  explanation.style.cssText = 'margin:16px 0 0;color:#cbd5e1;font-size:16px;line-height:1.65';

  const errorBox = document.createElement('div');
  errorBox.style.cssText = 'margin-top:24px;padding:18px;border-radius:16px;border:1px solid rgba(248,113,113,.24);background:rgba(248,113,113,.06)';
  const errorLabel = document.createElement('strong');
  errorLabel.textContent = 'Error details';
  errorLabel.style.cssText = 'display:block;color:#fecaca;font-size:14px';
  const errorText = document.createElement('p');
  errorText.textContent = message;
  errorText.style.cssText = 'margin:7px 0 0;color:#fecaca;opacity:.85;font-size:13px;line-height:1.55;overflow-wrap:anywhere';
  errorBox.append(errorLabel, errorText);

  const meta = document.createElement('p');
  meta.textContent = `Page: ${window.location.pathname} · Reference: ${reference}`;
  meta.style.cssText = 'margin:18px 0 0;color:#94a3b8;font:13px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere';

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;margin-top:25px';
  const refresh = makeButton('Refresh Sousa Murray Planeia', true);
  refresh.addEventListener('click', () => {
    const url = new URL(window.location.href);
    url.searchParams.set(REFRESH_MARKER, String(Date.now()));
    window.location.replace(url.toString());
  });
  const home = makeButton(window.location.pathname.startsWith('/admin') ? 'Admin dashboard' : 'Sousa Murray Planeia home');
  home.addEventListener('click', () => {
    window.location.assign(window.location.pathname.startsWith('/admin') ? '/admin/dashboard' : '/');
  });
  actions.append(refresh, home);

  const support = document.createElement('p');
  support.style.cssText = 'margin:25px 0 0;padding-top:20px;border-top:1px solid rgba(255,255,255,.1);color:#94a3b8;font-size:13px;line-height:1.6';
  support.textContent = 'If this continues, contact contact@jagroupservices.co.uk and include the reference above.';

  content.append(eyebrow, title, explanation, errorBox, meta, actions, support);
  card.append(header, content);
  main.append(card);
  document.body.append(main);
}

function recoverFromChunkFailure(message: string) {
  const now = Date.now();
  const path = `${window.location.pathname}${window.location.search}`;
  const previous = readRecovery();
  const recentlyRetried = previous
    && previous.path === path
    && now - previous.attemptedAt < RECOVERY_WINDOW_MS;

  if (!recentlyRetried) {
    saveRecovery({ path, attemptedAt: now, message });
    const url = new URL(window.location.href);
    url.searchParams.set(REFRESH_MARKER, String(now));
    window.location.replace(url.toString());
    return;
  }

  renderEmergencyPage(message);
}

export function installChunkRecovery() {
  if (typeof window === 'undefined') return;

  const currentUrl = new URL(window.location.href);
  if (currentUrl.searchParams.has(REFRESH_MARKER)) {
    currentUrl.searchParams.delete(REFRESH_MARKER);
    window.history.replaceState(null, '', currentUrl.toString());
  }

  window.addEventListener('vite:preloadError', (rawEvent) => {
    const event = rawEvent as VitePreloadErrorEvent;
    event.preventDefault();
    recoverFromChunkFailure(errorMessage(event.payload));
  });

  window.addEventListener('unhandledrejection', (event) => {
    const message = errorMessage(event.reason);
    if (!/dynamically imported module|failed to fetch.*module|preload|importing a module/i.test(message)) return;
    event.preventDefault();
    recoverFromChunkFailure(message);
  });

  window.setTimeout(() => {
    try {
      window.sessionStorage.removeItem(RECOVERY_KEY);
    } catch {
      // Nothing else is required.
    }
  }, RECOVERY_WINDOW_MS);
}
