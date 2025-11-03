/* Service Worker for serving a selected JSON as /exam_data.json */
let currentExamText = null;
const EXAM_PATH = (self.registration.scope.endsWith('/') ? self.registration.scope : self.registration.scope + '/') + 'exam_data.json';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', async (event) => {
  const { type, text } = event.data || {};
  if (type === 'setExamData') {
    try {
      // Validate JSON
      JSON.parse(text);
      currentExamText = text;
      event.ports[0] && event.ports[0].postMessage({ ok: true });
    } catch (e) {
      event.ports[0] && event.ports[0].postMessage({ ok: false, error: e.message });
    }
  } else if (type === 'claim') {
    self.clients.claim();
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // If the page requests exam_data.json relative to our scope, serve the in-memory JSON.
  if (url.pathname.endsWith('/exam_data.json')) {
    if (currentExamText) {
      event.respondWith(new Response(currentExamText, {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }));
    } else {
      // No data set yet: return a helpful message
      const msg = JSON.stringify({ error: "No exam JSON loaded. Open loader.html and choose a file first." }, null, 2);
      event.respondWith(new Response(msg, { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }
  }
});
