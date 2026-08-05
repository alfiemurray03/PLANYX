(() => {
  'use strict';

  const API_URL = '/api/account/customer-number';
  const PANEL_ID = 'universal-customer-number';
  const SETTINGS_PATH = /^\/settings\/?$/;

  const STATUS = {
    synced: ['Connected', 'Your customer record is connected to JA Group Services Ltd Head Office.'],
    pending: ['Pending', 'Sousa Murray Planeia is still connecting your customer record.'],
    not_configured: ['Connection unavailable', 'The Head Office connection has not been activated for this environment.'],
    review_required: ['Head Office review', 'Your customer record needs a manual identity review before it can be connected.'],
    ucn_conflict: ['Head Office review', 'Your existing customer number has been protected while Head Office reviews a mismatch.'],
    error: ['Temporarily unavailable', 'Sousa Murray Planeia could not check your Head Office customer record. Please try again.'],
  };

  function onSettingsPage() {
    return SETTINGS_PATH.test(window.location.pathname);
  }

  function findEmailFieldContainer() {
    return Array.from(document.querySelectorAll('label'))
      .find((label) => label.textContent?.trim().toLowerCase() === 'email address')
      ?.closest('.space-y-2') || null;
  }

  function createPanel() {
    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.className = 'planyx-ucn-profile';
    panel.setAttribute('aria-labelledby', 'planyx-ucn-label');
    panel.innerHTML = `
      <div class="planyx-ucn-heading">
        <div>
          <span class="planyx-ucn-label" id="planyx-ucn-label">Universal Customer Number (UCN)</span>
          <p>The same permanent customer number is used across all connected JA Group Services websites.</p>
        </div>
        <span class="planyx-ucn-status is-loading" data-ucn-status>Checking</span>
      </div>
      <div class="planyx-ucn-value-row">
        <strong class="planyx-ucn-value" data-ucn-value aria-live="polite">Checking…</strong>
        <button type="button" class="planyx-ucn-copy" data-ucn-copy hidden>Copy number</button>
      </div>
      <div class="planyx-ucn-meta">
        <span data-ucn-description>Sousa Murray Planeia is checking your Head Office customer record.</span>
        <span data-ucn-synced></span>
      </div>
      <button type="button" class="planyx-ucn-retry" data-ucn-retry hidden>Retry connection</button>
    `;

    panel.querySelector('[data-ucn-retry]')?.addEventListener('click', () => retryConnection(panel));
    panel.querySelector('[data-ucn-copy]')?.addEventListener('click', () => copyUcn(panel));
    return panel;
  }

  function setStatus(panel, status, label, description) {
    const badge = panel.querySelector('[data-ucn-status]');
    const detail = panel.querySelector('[data-ucn-description]');
    if (badge) {
      badge.textContent = label;
      badge.className = `planyx-ucn-status is-${status || 'pending'}`;
    }
    if (detail) detail.textContent = description;
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }

  function renderConnection(panel, connection) {
    const ucn = /^\d{10}$/.test(String(connection?.ucn || '')) ? String(connection.ucn) : '';
    const status = String(connection?.status || 'pending');
    const [label, description] = STATUS[status] || STATUS.pending;
    const value = panel.querySelector('[data-ucn-value]');
    const retry = panel.querySelector('[data-ucn-retry]');
    const copy = panel.querySelector('[data-ucn-copy]');
    const synced = panel.querySelector('[data-ucn-synced]');

    if (value) value.textContent = ucn || 'Not allocated yet';
    if (retry) retry.hidden = status === 'synced';
    if (copy) copy.hidden = !ucn;
    if (synced) {
      const timestamp = formatDate(connection?.syncedAt);
      synced.textContent = timestamp ? `Last connected ${timestamp}` : '';
    }

    setStatus(panel, status, ucn && status === 'synced' ? 'Connected' : label, description);
    panel.dataset.ucn = ucn;
    panel.dataset.loaded = 'true';
  }

  function renderFailure(panel, message) {
    const value = panel.querySelector('[data-ucn-value]');
    const retry = panel.querySelector('[data-ucn-retry]');
    const copy = panel.querySelector('[data-ucn-copy]');
    const synced = panel.querySelector('[data-ucn-synced]');
    if (value) value.textContent = 'Unable to check';
    if (retry) retry.hidden = false;
    if (copy) copy.hidden = true;
    if (synced) synced.textContent = '';
    setStatus(panel, 'error', 'Temporarily unavailable', message || STATUS.error[1]);
    panel.dataset.loaded = 'true';
  }

  async function loadConnection(panel) {
    if (panel.dataset.loading === 'true') return;
    panel.dataset.loading = 'true';
    try {
      const response = await fetch(API_URL, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      if (response.status === 401) {
        const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.location.assign(`/account/login?return_to=${encodeURIComponent(returnTo)}`);
        return;
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success !== true) {
        throw new Error(data.error || 'The customer number service did not respond correctly.');
      }
      renderConnection(panel, data.connection || {});
    } catch (error) {
      console.error('Could not load the Universal Customer Number', error);
      renderFailure(panel, STATUS.error[1]);
    } finally {
      panel.dataset.loading = 'false';
    }
  }

  async function retryConnection(panel) {
    const retry = panel.querySelector('[data-ucn-retry]');
    if (retry) {
      retry.disabled = true;
      retry.textContent = 'Connecting…';
    }
    setStatus(panel, 'loading', 'Connecting', 'Sousa Murray Planeia is reconnecting your Head Office customer record.');

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success !== true) {
        throw new Error(data?.result?.error || data.error || 'The connection could not be completed.');
      }
      await loadConnection(panel);
    } catch (error) {
      console.error('Could not retry the CustomerOps connection', error);
      renderFailure(panel, STATUS.error[1]);
    } finally {
      if (retry) {
        retry.disabled = false;
        retry.textContent = 'Retry connection';
      }
    }
  }

  async function copyUcn(panel) {
    const ucn = panel.dataset.ucn || '';
    if (!/^\d{10}$/.test(ucn)) return;
    const button = panel.querySelector('[data-ucn-copy]');
    try {
      await navigator.clipboard.writeText(ucn);
      if (button) button.textContent = 'Copied';
      window.setTimeout(() => { if (button) button.textContent = 'Copy number'; }, 1600);
    } catch {
      if (button) button.textContent = 'Could not copy';
      window.setTimeout(() => { if (button) button.textContent = 'Copy number'; }, 1600);
    }
  }

  function mount() {
    if (!onSettingsPage()) return;
    if (document.getElementById(PANEL_ID)) return;
    const emailContainer = findEmailFieldContainer();
    if (!emailContainer) return;

    const panel = createPanel();
    emailContainer.insertAdjacentElement('afterend', panel);
    loadConnection(panel);

    if (window.location.hash === `#${PANEL_ID}`) {
      window.setTimeout(() => panel.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150);
    }
  }

  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', mount);
  document.addEventListener('DOMContentLoaded', mount, { once: true });
  mount();
})();
