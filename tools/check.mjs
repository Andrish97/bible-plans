// Test kompletności: dla każdego przekładu i kilku ustawień plan musi zawierać
// każdy istniejący werset dokładnie raz (nic pominięte, nic podwójnie).
// Użycie: node tools/check.mjs
import {readFileSync, existsSync} from 'node:fs';
import {Translation} from '../js/bible.js';
import {buildPlan} from '../js/planner.js';
import {RefFormatter} from '../js/refs.js';

const root = new URL('../', import.meta.url);
const json = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const canon = json('data/books.json');
const chron = json('data/chronology.json');
const {translations} = json('data/translations.json');

const days = n => Array.from({length: n}, (_, i) => new Date(2027, 0, 1 + i));
let failed = 0;

for(const info of translations){
  const hp = `data/translations/${info.id}/headings.json`;
  const tr = new Translation(info, json(`data/translations/${info.id}/structure.json`), existsSync(new URL(hp, root)) ? json(hp) : null, canon);
  const all = [];
  for(const b of tr.bookIds) for(let c = 1; c <= tr.chapters(b); c++) for(let v = 1; v <= tr.last(b, c); v++) if(tr.exists(b, c, v)) all.push(`${b}.${c}.${v}`);
  const vp = `data/translations/${info.id}/versification.json`;
  const mapped = tr.mapChronology(chron, existsSync(new URL(vp, root)) ? json(vp) : null);
  console.log(`${info.id}: ${all.length} wersetów, chronologia: ${mapped.entries.length} pasaży, dołączono ${mapped.attached.length}, duplikaty ${mapped.duplicates}, nagłówki ${tr.headSet.size}`);

  const cases = [
    {name: 'chron/words', chron: mapped.entries, mode: 'words', parts: [tr.bookIds]},
    {name: 'chron/chapters', chron: mapped.entries, mode: 'chapters', parts: [tr.bookIds]},
    {name: 'seq/3 czytania/hard', chron: null, mode: 'words', mix: 'hard', parts: [tr.bookIds.filter(b => b < 18 || (b > 22 && b < 40)), tr.bookIds.filter(b => b >= 18 && b <= 22), tr.bookIds.filter(b => b >= 40)]},
    {name: 'seq/verses/heads', chron: null, mode: 'verses', useHeads: true, parts: [tr.bookIds]},
  ];
  for(const cs of cases){
    const plan = buildPlan({tr, parts: cs.parts.map((books, i) => ({name: 'C' + i, books})), chron: cs.chron, mode: cs.mode,
      mix: cs.mix || 'soft', useHeads: !!cs.useHeads, noSplitCh: true, dates: days(365), weekdays: new Set([0, 1, 2, 3, 4])});
    const seen = new Map();
    for(const r of plan.rows) if(r.units) for(const us of r.units) for(const u of us) for(const v of tr.versesOf(u)){
      const k = `${u[0]}.${u[1]}.${v}`; seen.set(k, (seen.get(k) || 0) + 1);
    }
    const missing = all.filter(k => !seen.has(k)), dup = [...seen].filter(([, n]) => n > 1);
    const ok = !missing.length && !dup.length && seen.size === all.length;
    if(!ok) failed++;
    console.log(`   ${ok ? 'OK ' : 'BŁĄD'} ${cs.name}: ${seen.size}/${all.length}` + (missing.length ? ` brak ${missing.length} np. ${missing.slice(0, 3)}` : '') + (dup.length ? ` podwójne ${dup.length}` : ''));
  }
  const f = new RefFormatter(canon, tr, {abbr: 'pl', style: 'colon'});
  const plan = buildPlan({tr, parts: [{name: 'x', books: tr.bookIds}], chron: mapped.entries, mode: 'words', mix: 'off', useHeads: false, noSplitCh: true, dates: days(3), weekdays: new Set([0,1,2,3,4,5,6])});
  console.log('   przykład:', plan.rows.map(r => f.dayText(r.units[0])).join(' | ').slice(0, 160));
}
if(failed){ console.error(`\n${failed} przypadków z błędem`); process.exit(1); }
console.log('\nWszystko kompletne.');
