export function onRequestGet({ request }) {
  const destination = new URL('/admin/pages?view=settings', request.url);
  return new Response(null, {
    status: 302,
    headers: {
      Location: destination.toString(),
      'Cache-Control': 'no-store',
    },
  });
}
