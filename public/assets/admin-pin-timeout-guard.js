(() => {
  if (!window.location.pathname.startsWith('/admin')) return;

  const nativeFetch = window.fetch.bind(window);
  const TIMEOUT_MS = 6500;

  function isAdminPinRequest(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      const url = new URL(raw, window.location.origin);
      return url.origin === window.location.origin
        && url.pathname === '/admin/api'
        && url.searchParams.get('section') === 'adminpin';
    } catch {
      return false;
    }
  }

  window.fetch = function guardedFetch(input, init = {}) {
    if (!isAdminPinRequest(input)) return nativeFetch(input, init);

    const controller = new AbortController();
    const callerSignal = init?.signal;
    let timedOut = false;

    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, TIMEOUT_MS);

    const forwardAbort = () => controller.abort();
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort();
      else callerSignal.addEventListener('abort', forwardAbort, { once: true });
    }

    return nativeFetch(input, { ...init, signal: controller.signal })
      .catch((error) => {
        if (!timedOut) throw error;
        return new Response(JSON.stringify({
          success: false,
          configured: true,
          unlocked: false,
          error: 'Administrator PIN verification timed out. The portal remained locked. Refresh the page or try again.'
        }), {
          status: 503,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
          }
        });
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (callerSignal) callerSignal.removeEventListener('abort', forwardAbort);
      });
  };
})();
