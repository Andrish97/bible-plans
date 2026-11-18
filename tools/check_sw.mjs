// Sprawdza, że service worker (sw.js) zapisuje do pamięci offline wszystkie pliki aplikacji.
// Użycie: node tools/check_sw.mjs
import {readFileSync, readdirSync, existsSync} from 'node:fs';
const root = new URL('../', import.meta.url).pathname;
const sw = readFileSync(root + 'sw.js', 'utf8');
const listed = new Set([...sw.matchAll(/'([^']+\.(?:js|css|png|svg|json|html|webmanifest))'/g)].map(m => m[1]));
const walk = d => readdirSync(root + d, {withFileTypes: true}).flatMap(e => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]);
const need = [...walk('js'), ...walk('assets/css'), 'index.html', 'manifest.webmanifest'];
const translations = JSON.parse(readFileSync(root + 'data/translations.json', 'utf8')).translations.map(t => t.id);
const ids = (sw.match(/const TRANSLATIONS = \[([^\]]*)\]/) || [, ''])[1].match(/'(\w+)'/g)?.map(x => x.slice(1, -1)) || [];
const missing = need.filter(f => !listed.has(f));
const missingTr = translations.filter(t => !ids.includes(t));
const absent = [...listed].filter(f => !f.includes('${') && !existsSync(root + f));
for(const f of missing) console.error('brak w sw.js:', f);
for(const t of missingTr) console.error('przekład nie jest w TRANSLATIONS w sw.js:', t);
for(const f of absent) console.error('sw.js wymienia nieistniejący plik:', f);
if(missing.length || missingTr.length || absent.length) process.exit(1);
console.log(`sw.js: ${listed.size} plików + ${ids.length} przekładów – OK`);
