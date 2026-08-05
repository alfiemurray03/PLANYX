const recoveryKey = 'planyx:analytics-compat-refresh';
const now = Date.now();
let previousAttempt = 0;

try {
  previousAttempt = Number(sessionStorage.getItem(recoveryKey) || 0);
} catch {
  previousAttempt = 0;
}

if (!previousAttempt || now - previousAttempt > 60000) {
  try {
    sessionStorage.setItem(recoveryKey, String(now));
  } catch {
    // Continue with the refresh when browser storage is unavailable.
  }

  const url = new URL(window.location.href);
  url.searchParams.set('_japs_refresh', String(now));
  window.location.replace(url.toString());
} else {
  document.title = 'Sousa Murray Planeia — Page update required';
  const app = document.getElementById('app');
  if (app) {
    app.replaceChildren();
    const message = document.createElement('div');
    message.style.cssText = 'min-height:100vh;box-sizing:border-box;background:#020617;color:#e2e8f0;padding:40px 20px;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif';
    const card = document.createElement('div');
    card.style.cssText = 'width:min(680px,100%);padding:32px;border-radius:24px;border:1px solid rgba(255,255,255,.12);background:#0f172a;box-shadow:0 30px 80px rgba(0,0,0,.4)';
    const title = document.createElement('h1');
    title.textContent = 'Sousa Murray Planeia needs to be refreshed';
    title.style.cssText = 'margin:0;color:#fff;font-size:30px;line-height:1.2';
    const detail = document.createElement('p');
    detail.textContent = 'The Analytics page belongs to an earlier application version. Refresh the page to load the current secure release.';
    detail.style.cssText = 'margin:16px 0 24px;color:#cbd5e1;line-height:1.65';
    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.textContent = 'Refresh Sousa Murray Planeia';
    refresh.style.cssText = 'min-height:44px;border:1px solid #3b82f6;border-radius:12px;background:#2563eb;color:#fff;padding:11px 18px;font:600 14px Segoe UI,Arial,sans-serif;cursor:pointer';
    refresh.addEventListener('click', () => {
      const next = new URL(window.location.href);
      next.searchParams.set('_japs_refresh', String(Date.now()));
      window.location.replace(next.toString());
    });
    card.append(title, detail, refresh);
    message.append(card);
    app.append(message);
  }
}

export default function AnalyticsCompatibilityPage() {
  return null;
}
