(() => {
  const settingsHref = '/admin/pages?view=settings';

  function replaceLabel(link, from, to) {
    const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if ((node.textContent || '').trim() === from) node.textContent = to;
    }
  }

  function apply() {
    document.querySelectorAll('a[href="/admin/age-verification"]').forEach(link => {
      const item = link.closest('li') || link.closest('[role="menuitem"]') || link;
      item.setAttribute('hidden', '');
      item.setAttribute('aria-hidden', 'true');
    });

    document.querySelectorAll('a[href="/admin/website-builder-settings"]').forEach(link => {
      link.setAttribute('href', settingsHref);
    });

    document.querySelectorAll('a[href="/admin/pages"]').forEach(link => {
      replaceLabel(link, 'Website Pages', 'AI Website Builder');
      link.setAttribute('title', 'AI Website Builder');

      if (document.querySelector(`a[href="${settingsHref}"]`)) return;
      const clone = link.cloneNode(true);
      clone.setAttribute('href', settingsHref);
      clone.setAttribute('title', 'Website Builder Settings');
      replaceLabel(clone, 'AI Website Builder', 'Builder Settings');
      replaceLabel(clone, 'Website Pages', 'Builder Settings');
      clone.removeAttribute('aria-current');

      const item = link.closest('li');
      if (item?.parentElement) {
        const clonedItem = item.cloneNode(false);
        clonedItem.appendChild(clone);
        item.insertAdjacentElement('afterend', clonedItem);
      } else {
        link.insertAdjacentElement('afterend', clone);
      }
    });
  }

  apply();
  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
