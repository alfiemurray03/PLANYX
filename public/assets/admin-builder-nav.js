(() => {
  const settingsHref = '/admin/pages?view=settings';
  const gatesHref = '/admin/gates';
  const partnerGalleriesHref = '/admin/partner-galleries';

  function replaceLabel(link, from, to) {
    const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if ((node.textContent || '').trim() === from) node.textContent = to;
    }
  }

  function findAllToolsMenu() {
    return Array.from(document.querySelectorAll('header details')).find(details =>
      /all admin tools/i.test(details.querySelector('summary')?.textContent || '')
    ) || null;
  }

  function cloneAfterInToolsMenu(link, href, title, label) {
    const toolsMenu = findAllToolsMenu();
    if (!toolsMenu || !toolsMenu.contains(link) || toolsMenu.querySelector(`a[href="${href}"]`)) return;

    const clone = link.cloneNode(true);
    clone.setAttribute('href', href);
    clone.setAttribute('title', title);
    clone.removeAttribute('aria-current');

    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
    let node;
    let changed = false;
    while ((node = walker.nextNode())) {
      const value = (node.textContent || '').trim();
      if (value && !changed) {
        node.textContent = label;
        changed = true;
      }
    }

    const item = link.closest('li');
    if (item?.parentElement && toolsMenu.contains(item)) {
      const clonedItem = item.cloneNode(false);
      clonedItem.appendChild(clone);
      item.insertAdjacentElement('afterend', clonedItem);
    } else {
      link.insertAdjacentElement('afterend', clone);
    }
  }

  function keepPrimaryHeaderStable() {
    const primary = document.querySelector('nav[aria-label="Primary admin navigation"]');
    if (!primary) return;

    primary.style.flexWrap = 'nowrap';
    primary.querySelectorAll(`a[href="${gatesHref}"],a[href="${partnerGalleriesHref}"]`).forEach(link => link.remove());
    primary.querySelectorAll('a').forEach(link => {
      link.style.whiteSpace = 'nowrap';
      link.style.flexShrink = '0';
    });

    const toolsMenu = findAllToolsMenu();
    if (toolsMenu) toolsMenu.style.flexShrink = '0';

    document.querySelectorAll('header p').forEach(element => {
      if ((element.textContent || '').trim().toLowerCase() === 'administrator') {
        element.style.whiteSpace = 'nowrap';
      }
    });
  }

  function enhanceSiteSettings() {
    if (window.location.pathname !== '/admin/site-settings') return;

    document.querySelectorAll('h3').forEach(heading => {
      if (!/Coming Soon Launch Gate|Dedicated Maintenance Page/i.test(heading.textContent || '')) return;
      const section = heading.closest('div.rounded-xl, section, [data-slot="card"]');
      if (section && !section.closest('#gate-settings-cta')) section.style.display = 'none';
    });

    if (document.getElementById('gate-settings-cta')) return;
    const publicHeading = Array.from(document.querySelectorAll('h3')).find(node =>
      /Public Website Status/i.test(node.textContent || '')
    );
    const host = publicHeading?.closest('div.rounded-xl, section, [data-slot="card"]');
    if (!host?.parentElement) return;

    const panel = document.createElement('section');
    panel.id = 'gate-settings-cta';
    panel.style.cssText = 'margin-top:16px;padding:18px;border:1px solid #bfdbfe;border-radius:16px;background:linear-gradient(135deg,#eff6ff,#f5f3ff);display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap';
    panel.innerHTML = '<div><strong style="display:block;color:#0b172d;font-size:14px">Launch & Maintenance Gate Control Centre</strong><span style="display:block;margin-top:5px;color:#53657d;font-size:12px;line-height:1.55">Edit every public gate section, feature card, owner sign-in control, footer link, custom HTML and CSS from one source of truth.</span></div><a href="/admin/gates" style="display:inline-flex;min-height:40px;align-items:center;justify-content:center;padding:0 15px;border-radius:11px;background:#2864e8;color:#fff;text-decoration:none;font-size:12px;font-weight:750">Open Gate Control Centre</a>';
    host.insertAdjacentElement('afterend', panel);
  }

  function apply() {
    keepPrimaryHeaderStable();

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
      cloneAfterInToolsMenu(link, settingsHref, 'Website Builder Settings', 'Builder Settings');
    });

    const toolsMenu = findAllToolsMenu();
    toolsMenu?.querySelectorAll('a[href="/admin/site-settings"]').forEach(link => {
      cloneAfterInToolsMenu(link, gatesHref, 'Launch & Maintenance Gate Control Centre', 'Gate Control Centre');
    });
    toolsMenu?.querySelectorAll('a[href="/admin/affiliate-content"],a[href="/admin/content"]').forEach(link => {
      cloneAfterInToolsMenu(link, partnerGalleriesHref, 'Manage Headout and GetYourGuide galleries', 'Partner Galleries');
    });

    enhanceSiteSettings();
    keepPrimaryHeaderStable();
  }

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link) return;
    const path = new URL(link.href, window.location.origin).pathname.replace(/\/+$/, '') || '/';
    if (path !== partnerGalleriesHref) return;
    event.preventDefault();
    event.stopPropagation();
    window.location.assign(partnerGalleriesHref);
  }, true);

  apply();
  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();