export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const destination = new URL('/admin/reports', url.origin);
  destination.search = url.search;
  return new Response(null, {
    status: 302,
    headers: {
      Location: destination.toString(),
      'Cache-Control': 'no-store',
    },
  });
}

export async function onRequest(context) {
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    return new Response('Method not allowed.', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  return onRequestGet(context);
}
