(() => {
  const MOBILE_QUERY = '(max-width: 767px)';
  let activeDetails = null;

  function isMobile() {
    return window.matchMedia(MOBILE_QUERY).matches;
  }

  function closeTools() {
    if (activeDetails) activeDetails.removeAttribute('open');
    document.body.classList.remove('admin-tools-open');
  }

  function enhance(details) {
    if (!(details instanceof HTMLDetailsElement) || details.dataset.mobileAdminEnhanced === 'true') return;
    details.dataset.mobileAdminEnhanced = 'true';
    activeDetails = details;

    const panel = details.querySelector(':scope > div');
    const panelHeader = panel?.firstElementChild;
    if (panelHeader && !panelHeader.querySelector('[data-admin-mobile-close]')) {
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'admin-mobile-tools-close';
      close.dataset.adminMobileClose = 'true';
      close.setAttribute('aria-label', 'Close all admin tools');
      close.textContent = '×';
      close.addEventListener('click', closeTools);
      panelHeader.appendChild(close);
    }

    details.addEventListener('toggle', () => {
      if (!isMobile()) {
        document.body.classList.remove('admin-tools-open');
        return;
      }
      document.body.classList.toggle('admin-tools-open', details.open);
    });

    panel?.addEventListener('click', event => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (link) closeTools();
    });
  }

  function scan() {
    const details = document.querySelector('.admin-portal > header details');
    if (details) enhance(details);
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeTools();
  });

  window.addEventListener('resize', () => {
    if (!isMobile()) document.body.classList.remove('admin-tools-open');
  }, { passive: true });

  window.addEventListener('popstate', closeTools);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) closeTools();
  });

  scan();
  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
