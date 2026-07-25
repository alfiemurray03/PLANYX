import { useEffect } from 'react';

interface RuntimeRule {
  id: string;
  operation: 'set_page_css' | 'replace_text' | 'replace_html' | 'append_html' | 'hide' | 'set_attribute' | 'add_class';
  selector: string;
  value: string;
  attribute_name?: string;
}

interface RuntimePayload {
  success: boolean;
  globalCss?: string;
  rules?: RuntimeRule[];
}

const PROTECTED_PREFIXES = ['/admin', '/api', '/auth', '/sign/'];
const STYLE_GLOBAL_ID = 'planyx-ai-builder-global-css';
const STYLE_PAGE_ID = 'planyx-ai-builder-page-css';

function protectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(prefix));
}

function setStyle(id: string, css: string) {
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!css) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    document.head.appendChild(style);
  }
  style.textContent = css;
}

function applyRule(rule: RuntimeRule) {
  if (rule.operation === 'set_page_css') return;
  if (!rule.selector) return;
  let elements: Element[] = [];
  try { elements = Array.from(document.querySelectorAll(rule.selector)); } catch { return; }
  for (const element of elements) {
    const htmlElement = element as HTMLElement;
    const marker = `aiBuilder${rule.id.replace(/[^a-z0-9]/gi, '')}`;
    if (htmlElement.dataset[marker] === 'applied' && rule.operation === 'append_html') continue;
    switch (rule.operation) {
      case 'replace_text':
        htmlElement.textContent = rule.value;
        break;
      case 'replace_html':
        htmlElement.innerHTML = rule.value;
        break;
      case 'append_html':
        htmlElement.insertAdjacentHTML('beforeend', rule.value);
        htmlElement.dataset[marker] = 'applied';
        break;
      case 'hide':
        htmlElement.hidden = true;
        htmlElement.setAttribute('aria-hidden', 'true');
        break;
      case 'set_attribute':
        if (rule.attribute_name) htmlElement.setAttribute(rule.attribute_name, rule.value);
        break;
      case 'add_class':
        rule.value.split(/\s+/).filter(Boolean).forEach(className => htmlElement.classList.add(className));
        break;
      default:
        break;
    }
  }
}

function applyPayload(payload: RuntimePayload) {
  setStyle(STYLE_GLOBAL_ID, payload.globalCss || '');
  const pageCss = (payload.rules || [])
    .filter(rule => rule.operation === 'set_page_css')
    .map(rule => rule.value)
    .join('\n');
  setStyle(STYLE_PAGE_ID, pageCss);
  (payload.rules || []).forEach(applyRule);
}

export default function WebsiteBuilderRuntime() {
  useEffect(() => {
    if (typeof window === 'undefined' || protectedPath(window.location.pathname)) return;
    let stopped = false;
    let observer: MutationObserver | null = null;
    let lastPath = '';
    let scheduled = 0;
    let payload: RuntimePayload = { success: true, rules: [] };

    async function load() {
      const pathname = window.location.pathname;
      if (protectedPath(pathname)) return;
      lastPath = pathname;
      try {
        const response = await fetch(`/api/website-builder?mode=runtime&path=${encodeURIComponent(pathname)}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const data = await response.json().catch(() => ({})) as RuntimePayload;
        if (!stopped && response.ok && data.success) {
          payload = data;
          applyPayload(payload);
        }
      } catch {
        // Managed content must never prevent the core website from loading.
      }
    }

    function scheduleApply() {
      if (scheduled) return;
      scheduled = window.requestAnimationFrame(() => {
        scheduled = 0;
        if (window.location.pathname !== lastPath) void load();
        else applyPayload(payload);
      });
    }

    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);
    history.pushState = (...args) => { originalPushState(...args); window.dispatchEvent(new Event('planyx:navigation')); };
    history.replaceState = (...args) => { originalReplaceState(...args); window.dispatchEvent(new Event('planyx:navigation')); };

    void load();
    observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', load);
    window.addEventListener('planyx:navigation', load);

    return () => {
      stopped = true;
      observer?.disconnect();
      window.removeEventListener('popstate', load);
      window.removeEventListener('planyx:navigation', load);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      if (scheduled) window.cancelAnimationFrame(scheduled);
    };
  }, []);

  return null;
}
