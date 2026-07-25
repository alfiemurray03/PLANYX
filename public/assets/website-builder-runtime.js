(() => {
  const path = window.location.pathname;
  if (/^\/(?:admin|api|auth)(?:\/|$)/.test(path) || path.startsWith('/sign/')) return;
  const globalId = 'planyx-ai-builder-global-css';
  const pageId = 'planyx-ai-builder-page-css';

  function setStyle(id, css) {
    let style = document.getElementById(id);
    if (!css) { if (style) style.remove(); return; }
    if (!style) { style = document.createElement('style'); style.id = id; document.head.appendChild(style); }
    style.textContent = css;
  }

  function applyRule(rule) {
    if (rule.operation === 'set_page_css' || !rule.selector) return;
    let elements = [];
    try { elements = Array.from(document.querySelectorAll(rule.selector)); } catch { return; }
    for (const element of elements) {
      const marker = `aiBuilder${String(rule.id || '').replace(/[^a-z0-9]/gi, '')}`;
      if (element.dataset[marker] === 'applied' && rule.operation === 'append_html') continue;
      if (rule.operation === 'replace_text') element.textContent = rule.value || '';
      else if (rule.operation === 'replace_html') element.innerHTML = rule.value || '';
      else if (rule.operation === 'append_html') { element.insertAdjacentHTML('beforeend', rule.value || ''); element.dataset[marker] = 'applied'; }
      else if (rule.operation === 'hide') { element.hidden = true; element.setAttribute('aria-hidden', 'true'); }
      else if (rule.operation === 'set_attribute' && rule.attribute_name) element.setAttribute(rule.attribute_name, rule.value || '');
      else if (rule.operation === 'add_class') String(rule.value || '').split(/\s+/).filter(Boolean).forEach(name => element.classList.add(name));
    }
  }

  function apply(payload) {
    setStyle(globalId, payload.globalCss || '');
    setStyle(pageId, (payload.rules || []).filter(rule => rule.operation === 'set_page_css').map(rule => rule.value || '').join('\n'));
    (payload.rules || []).forEach(applyRule);
  }

  fetch(`/api/website-builder?mode=runtime&path=${encodeURIComponent(path)}`, { credentials: 'same-origin', cache: 'no-store' })
    .then(response => response.ok ? response.json() : null)
    .then(payload => { if (payload && payload.success) apply(payload); })
    .catch(() => {});
})();
