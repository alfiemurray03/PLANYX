(() => {
  const V1_PATH = '/api/admin/website-studio';
  const V2_PATH = '/api/admin/website-studio-v2';
  const SETTINGS_PATH = '/admin/pages?view=settings';
  const nativeFetch = window.fetch.bind(window);

  function rewriteUrl(value) {
    try {
      const url = new URL(String(value), window.location.origin);
      if (url.origin === window.location.origin && url.pathname === V1_PATH) {
        url.pathname = V2_PATH;
        return url.toString();
      }
    } catch {}
    return value;
  }

  window.fetch = function websiteStudioFetch(input, init) {
    if (input instanceof Request) {
      const rewritten = rewriteUrl(input.url);
      if (rewritten !== input.url) {
        return nativeFetch(new Request(rewritten, input), init);
      }
      return nativeFetch(input, init);
    }
    return nativeFetch(rewriteUrl(input), init);
  };

  function fixLinks() {
    document.querySelectorAll('a[href="/admin/website-builder-settings"]').forEach(link => {
      link.setAttribute('href', SETTINGS_PATH);
    });
  }

  if (window.location.pathname === '/admin/website-builder-settings') {
    window.location.replace(SETTINGS_PATH);
    return;
  }

  fixLinks();
  const observer = new MutationObserver(fixLinks);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
