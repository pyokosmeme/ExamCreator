/* Service Worker for serving selected JSON files */
let currentExamText = null;
let currentSolutionsText = null;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', async (event) => {
  const { type, text, target } = event.data || {};
  
  if (type === 'setExamData') {
    try {
      JSON.parse(text); // Validate JSON
      currentExamText = text;
      event.ports[0] && event.ports[0].postMessage({ ok: true });
    } catch (e) {
      event.ports[0] && event.ports[0].postMessage({ ok: false, error: e.message });
    }
  } 
  else if (type === 'setSolutionsData') {
    try {
      JSON.parse(text); // Validate JSON
      currentSolutionsText = text;
      event.ports[0] && event.ports[0].postMessage({ ok: true });
    } catch (e) {
      event.ports[0] && event.ports[0].postMessage({ ok: false, error: e.message });
    }
  }
  else if (type === 'setData') {
    // Generic setter - sets both to same data (for templates that use exam_data.json)
    try {
      JSON.parse(text);
      if (target === 'solutions') {
        currentSolutionsText = text;
      } else if (target === 'exam') {
        currentExamText = text;
      } else {
        // Default: set both
        currentExamText = text;
        currentSolutionsText = text;
      }
      event.ports[0] && event.ports[0].postMessage({ ok: true });
    } catch (e) {
      event.ports[0] && event.ports[0].postMessage({ ok: false, error: e.message });
    }
  }
  else if (type === 'claim') {
    self.clients.claim();
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Intercept exam_data.json
  if (url.pathname.endsWith('/exam_data.json')) {
    if (currentExamText) {
      event.respondWith(new Response(currentExamText, {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }));
    } else {
      const msg = JSON.stringify({ error: "No exam JSON loaded. Open loader.html and choose a file first." }, null, 2);
      event.respondWith(new Response(msg, { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }
    return;
  }
  
  // Intercept solutions_data.json
  if (url.pathname.endsWith('/solutions_data.json')) {
    if (currentSolutionsText) {
      event.respondWith(new Response(currentSolutionsText, {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }));
    } else {
      const msg = JSON.stringify({ error: "No solutions JSON loaded. Open loader.html and choose a file first." }, null, 2);
      event.respondWith(new Response(msg, { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }
    return;
  }
});
