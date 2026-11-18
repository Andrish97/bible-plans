// Service worker: aplikacja działa bez internetu.
// Strategia „najpierw pamięć, w tle odświeżenie” (stale-while-revalidate): strona otwiera się od razu,
// a nowa wersja plików pobiera się w tle i jest używana przy następnym otwarciu.
// Przy zmianie listy plików podnieś VERSION (tools/check_sw.mjs pilnuje, że lista jest kompletna).
const VERSION = 'v2';
const CACHE = 'plan-biblii-' + VERSION;
const TRANSLATIONS = ['bw', 'snp', 'snpd', 'ubg', 'nbg', 'tnp'];

const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'assets/css/app.css', 'assets/css/print.css',
  'assets/favicon.svg', 'assets/apple-touch-icon.png', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/icon-maskable-512.png',
  'js/theme-init.js', 'js/main.js', 'js/dom.js', 'js/data.js', 'js/bible.js', 'js/planner.js', 'js/refs.js', 'js/settings.js', 'js/share.js',
  'js/ui/select.js', 'js/ui/calendar.js', 'js/ui/theme.js', 'js/ui/help.js', 'js/ui/readings.js', 'js/ui/preview.js',
  'js/export/csv.js', 'js/export/print.js', 'js/export/ics.js',
  'data/books.json', 'data/translations.json', 'data/chronology.json', 'data/versification/org.json',
  'data/headings/bw.json', 'data/headings/snpd.json',
  ...TRANSLATIONS.flatMap(t => [`data/translations/${t}/structure.json`, `data/versification/${t}.json`]),
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('plan-biblii-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if(req.method !== 'GET' || url.origin !== location.origin) return;
  // strona z linkiem do planu (?plan=…) to ta sama strona główna
  const key = req.mode === 'navigate' ? new Request(new URL('./', location).href) : req;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(key, {ignoreSearch: req.mode === 'navigate'});
    const fresh = fetch(req).then(res => {
      if(res.ok) cache.put(key, res.clone());
      return res;
    }).catch(() => cached);
    if(cached){ e.waitUntil(fresh); return cached; }
    return fresh;
  }));
});
