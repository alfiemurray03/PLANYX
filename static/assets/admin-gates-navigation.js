(() => {
  function normalisePath(value) {
    try {
      return new URL(value, window.location.origin).pathname.replace(/\/+$/, '') || '/';
    } catch {
      return '';
    }
  }

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!target) return;

    const href = target.getAttribute('href') || '';
    if (normalisePath(href) !== '/admin/gates') return;

    event.preventDefault();
    event.stopPropagation();
    window.location.assign('/admin/gates');
  }, true);
})();
