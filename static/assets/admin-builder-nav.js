(() => {
  function apply() {
    document.querySelectorAll('a[href="/admin/age-verification"]').forEach(link => {
      const item = link.closest('li') || link.closest('[role="menuitem"]') || link;
      item.setAttribute('hidden', '');
      item.setAttribute('aria-hidden', 'true');
    });
    document.querySelectorAll('a[href="/admin/pages"]').forEach(link => {
      const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if ((node.textContent || '').trim() === 'Website Pages') node.textContent = 'AI Website Builder';
      }
      link.setAttribute('title', 'AI Website Builder');
    });
  }
  apply();
  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
