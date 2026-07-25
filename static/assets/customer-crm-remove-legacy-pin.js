(() => {
  if (!/^\/admin\/users\/[^/?#]+/i.test(window.location.pathname)) return;

  const LEGACY_HEADING = /administrator\s+(security\s+verification|security\s+pin|pin\s+verification)/i;
  const LEGACY_BADGE = /personal\s+pin\s+required/i;

  function removeLegacyPanel() {
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, [role="heading"]'));

    for (const heading of headings) {
      const text = String(heading.textContent || '').trim();
      if (!LEGACY_HEADING.test(text)) continue;

      const panel = heading.closest('[data-slot="card"], article, section, form');
      if (!panel || panel.id === 'crm-governed-verification-root' || panel.closest('#crm-governed-verification-root')) continue;
      if (!panel.querySelector('#admin-security-pin, input[inputmode="numeric"], input[type="password"]')) continue;

      panel.remove();
    }

    const pinInput = document.querySelector('#admin-security-pin');
    if (pinInput && !pinInput.closest('#crm-governed-verification-root')) {
      let candidate = pinInput.parentElement;
      while (candidate && candidate.parentElement && candidate.id !== 'app') {
        const text = String(candidate.textContent || '');
        if ((LEGACY_HEADING.test(text) || LEGACY_BADGE.test(text)) && !/customer-specific access|registered-email support code/i.test(text)) {
          candidate.remove();
          break;
        }
        candidate = candidate.parentElement;
      }
    }
  }

  removeLegacyPanel();

  const observer = new MutationObserver(removeLegacyPanel);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('pageshow', removeLegacyPanel);
})();
