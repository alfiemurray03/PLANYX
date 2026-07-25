(() => {
  const VALID_VIEWS = new Set(['files', 'code', 'preview', 'history']);

  function addSourceTab(nav) {
    if (!(nav instanceof HTMLElement) || nav.querySelector('[data-website-source-tab]')) return;
    const source = document.createElement('a');
    source.href = '/admin/pages?view=source';
    source.dataset.websiteSourceTab = 'true';
    source.className = 'inline-flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-3 text-sm font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white';
    source.innerHTML = '<span aria-hidden="true" style="font-family:monospace;font-weight:800;margin-right:.5rem">&lt;/&gt;</span>Source Code';
    const settings = Array.from(nav.querySelectorAll('a,button')).find(item => (item.textContent || '').trim() === 'Settings');
    if (settings) nav.insertBefore(source, settings);
    else nav.appendChild(source);
  }

  function activateRequestedView(nav) {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    if (!view || !VALID_VIEWS.has(view) || nav.dataset.requestedViewApplied === view) return;
    const label = view === 'files' ? 'Files' : view === 'code' ? 'Code' : view === 'preview' ? 'Preview' : 'History';
    const control = Array.from(nav.querySelectorAll('button')).find(item => (item.textContent || '').trim() === label);
    if (control instanceof HTMLButtonElement) {
      nav.dataset.requestedViewApplied = view;
      control.click();
    }
  }

  function scan() {
    if (window.location.pathname !== '/admin/pages') return;
    const nav = document.querySelector('nav[aria-label="Website Studio workspace"]');
    if (!nav) return;
    addSourceTab(nav);
    activateRequestedView(nav);
  }

  scan();
  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
