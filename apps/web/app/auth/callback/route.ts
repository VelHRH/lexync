const extensionIdPattern = /^[a-p]{32}$/;

export function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const extensionId = requestUrl.searchParams.get('extension_id');

  if (!extensionId || !extensionIdPattern.test(extensionId)) {
    return new Response('The Lexync extension identity is invalid.', { status: 400 });
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
