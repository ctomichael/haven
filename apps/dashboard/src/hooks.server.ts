import type { Handle } from '@sveltejs/kit';

const BACKEND = process.env.HAVEN_BACKEND_URL ?? 'http://localhost:8080';

export const handle: Handle = async ({ event, resolve }) => {
  const url = event.url;

  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/attachments')) {
    const target = new URL(url.pathname + url.search, BACKEND);

    const body = event.request.method !== 'GET' && event.request.method !== 'HEAD'
      ? await event.request.blob()
      : undefined;

    const res = await fetch(target.toString(), {
      method: event.request.method,
      headers: event.request.headers,
      body,
    });

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  }

  return resolve(event);
};
