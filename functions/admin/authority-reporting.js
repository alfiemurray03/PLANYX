export async function onRequest(context) {
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    return new Response('Method not allowed.', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  // Continue to the Cloudflare Pages application so React can render the
  // protected /admin/authority-reporting route. The previous redirect to
  // /admin/reports caused this dedicated page to fall through to the public
  // not-found route in some deployments.
  return context.next();
}
