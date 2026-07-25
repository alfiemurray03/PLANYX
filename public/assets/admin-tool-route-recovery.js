(() => {
  const routes = new Map([
    ['/admin/gates', '/admin/status'],
    ['/admin/partner-galleries', '/admin/affiliate-content'],
  ]);

  function normalise(value) {
    try {
      return new URL(value, window.location.origin).pathname.replace(/\/+$/, '') || '/';
    } catch {
      return '';
    }
  }

  function replaceExactText(root, from, to) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if ((node.textContent || '').trim() === from) node.textContent = to;
    }
  }

  function apply() {
    document.querySelectorAll('a[href]').forEach((link) => {
      const current = normalise(link.getAttribute('href') || '');
      const replacement = routes.get(current);
      if (replacement) link.setAttribute('href', replacement);

      const activePath = replacement || current;
      if (activePath === '/admin/status') {
        replaceExactText(link, 'Status Centre', 'Gate Control Centre');
      }
      if (activePath === '/admin/affiliate-content') {
        replaceExactText(link, 'Affiliate Content', 'Partner Galleries');
      }
    });
  }

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link) return;
    const replacement = routes.get(normalise(link.getAttribute('href') || ''));
    if (!replacement) return;
    event.preventDefault();
    event.stopPropagation();
    window.location.assign(replacement);
  }, true);

  apply();
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
})();
