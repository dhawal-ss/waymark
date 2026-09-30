// Web Share Target (Android, installed app). The share arrives as a POST, so the case JSON never
// appears in a URL or a server log. The text is kept in a private cache until the app reads it.
const CACHE = 'waymark-share';
const MAX_BYTES = 5 * 1024 * 1024;

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || !url.pathname.endsWith('/share-target')) return;
  event.respondWith(
    (async () => {
      let text;
      try {
        const form = await event.request.formData();
        const parts = [];
        for (const key of ['shared_text', 'shared_url']) {
          const value = form.get(key);
          if (typeof value === 'string' && value.trim()) parts.push(value.trim());
        }
        const file = form.get('shared_file');
        if (file && typeof file === 'object' && file.size <= MAX_BYTES)
          parts.push(await file.text());
        text = parts.join('\n');
      } catch {
        text = '';
      }
      const cache = await caches.open(CACHE);
      await cache.put('shared-text', new Response(text));
      return Response.redirect(new URL('./?action=shared', self.registration.scope).href, 303);
    })(),
  );
});
