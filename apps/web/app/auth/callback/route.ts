const extensionIdPattern = /^[a-p]{32}$/;

export function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const extensionId = requestUrl.searchParams.get('extension_id');

  if (!extensionId || !extensionIdPattern.test(extensionId)) {
    const code = requestUrl.searchParams.get('code');
    const type = requestUrl.searchParams.get('type');
    if (!code) {
      if (!type || !['recovery', 'signup'].includes(type)) return new Response('The Lexync extension identity is invalid.', { status: 400 });
      return new Response("<script>window.location.replace('/auth/complete' + window.location.search + window.location.hash)</script>", {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    const callback = new URL('/auth/complete', requestUrl.origin);
    callback.searchParams.set('code', code);
    if (type && ['recovery', 'signup'].includes(type)) callback.searchParams.set('type', type);
    return Response.redirect(callback);
  }

  const callback = new URL(`chrome-extension://${extensionId}/auth-callback.html`);

  for (const key of ['code', 'error', 'error_description']) {
    const value = requestUrl.searchParams.get(key);

    if (value) {
      callback.searchParams.set(key, value);
    }
  }

  if (!callback.searchParams.has('code') && !callback.searchParams.has('error')) {
    return new Response('The authentication response is incomplete.', { status: 400 });
  }

  return new Response(null, {
    headers: { Location: callback.toString() },
    status: 302,
  });
}
