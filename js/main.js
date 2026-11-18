// Punkt wejścia: wczytanie danych, połączenie ustawień z planem, podglądem i eksportem.
import {$} from './dom.js';
import {loadCanon, loadTranslationList, loadTranslation} from './data.js';
import {buildPlan} from './planner.js';
import {RefFormatter, REF_STYLES} from './refs.js';
import {CONTENT, CONTROLS, DEFAULT_READINGS, PRESETS, PRESET_BASE, PLAN_CHAIN, SEP_OK, range, loadSaved, save, clearSaved} from './settings.js';
import {enhanceSelects} from './ui/select.js';
import {initCalendar, parseDate} from './ui/calendar.js';
import {initTheme} from './ui/theme.js';
import {initHelp} from './ui/help.js';
import {renderReadings, booksOf} from './ui/readings.js';
import {renderPreview} from './ui/preview.js';
import {toCsv, download} from './export/csv.js';
import {buildPrint, TEMPLATES} from './export/print.js';
import {toIcs} from './export/ics.js';
import {encodePlan, decodePlan, planUrl} from './share.js';

const S = {
  canon: null,
  list: null,          // data/translations.json
  tr: null,            // bieżący model przekładu
  readings: structuredClone(DEFAULT_READINGS),
  view: null,          // ostatnio policzony plan (do eksportu)
  loadToken: 0,
};
const DEF = new Map();   // domyślne wartości kontrolek (z HTML)

const ctrl = id => $(id);
const val = id => { const c = ctrl(id); return c.type === 'checkbox' ? c.checked : c.value; };
const setVal = (id, v) => { const c = ctrl(id); if(c.type === 'checkbox') c.checked = !!v; else c.value = v; };
const weekdays = () => new Set([...document.querySelectorAll('#days input')].filter(x => x.checked).map(x => +x.value));
const setWeekdays = list => document.querySelectorAll('#days input').forEach(x => { x.checked = list.includes(+x.value); });

// ---------------------------------------------------------------- start
async function boot(){
  initTheme($('themeBtn'), $('themeMenu'));
  initHelp($('helpPop'));
  [S.canon, S.list] = await Promise.all([loadCanon(), loadTranslationList()]);
  fillStaticSelects();
  CONTROLS.forEach(id => DEF.set(id, val(id)));
  restore();
  const fromLink = restoreFromLink();
  enhanceSelects();
  initCalendar($('start'), $('calBtn'), $('calPop'));
  wire();
  initMobile();
  initPwa();
  await switchTranslation();
  if(fromLink) toast(fromLink === 'ok' ? 'Wczytano plan z linku.' : 'Link do planu jest uszkodzony – pokazuję ostatnie ustawienia.');
}

function fillStaticSelects(){
  const opt = (value, label, desc) => { const o = document.createElement('option'); o.value = value; o.textContent = label; if(desc) o.dataset.desc = desc; return o; };
  $('translation').replaceChildren(...S.list.translations.map(t =>
    opt(t.id, `${t.short} – ${t.name}`, (t.books === 'all' ? '66 ksiąg' : `${t.books.length} ksiąg`) + (t.headings ? ' · z nagłówkami' : ''))));
  $('translation').value = S.list.default;
  $('abbr').replaceChildren(...S.canon.abbreviationSets.map(a => opt(a.id, a.label, a.example)));
  $('refStyle').replaceChildren(...REF_STYLES.map(s => opt(s.id, s.label, `J 3${s.cv}16${s.dash}18`)));
  $('template').replaceChildren(...TEMPLATES.map(t => opt(t.id, t.label, t.desc)));
}

function restore(){
  const saved = loadSaved();
  if(!saved) return;
  for(const [id, v] of Object.entries(saved.controls || {})){
    const c = ctrl(id);
    if(!c) continue;
    if(c.tagName === 'SELECT' && ![...c.options].some(o => o.value === v)) continue;
    setVal(id, v);
  }
  if(Array.isArray(saved.days)) setWeekdays(saved.days);
  if(saved.readings?.cont) S.readings = {...structuredClone(DEFAULT_READINGS), ...saved.readings};
}

/** Plan z linku (?plan=…): zastępuje zapisane ustawienia. Zwraca 'ok', 'bad' albo null. */
function restoreFromLink(){
  const code = new URLSearchParams(location.search).get('plan');
  if(!code) return null;
  history.replaceState(null, '', location.pathname + location.hash);   // link działa raz, dalej zwykłe zapamiętywanie
  const p = decodePlan(code);
  if(!p) return 'bad';
  DEF.forEach((v, id) => setVal(id, v));
  for(const [id, v] of Object.entries(p.controls)){
    const c = ctrl(id);
    if(!c || !CONTROLS.includes(id)) continue;
    if(c.tagName === 'SELECT' && ![...c.options].some(o => o.value === v)) continue;
    setVal(id, v);
  }
  setWeekdays(p.days || range(0, 6));
  if(p.readings){
    const d = structuredClone(DEFAULT_READINGS);
    S.readings = {n: p.readings.n, cont: [...p.readings.cont, ...d.cont.slice(p.readings.cont.length)],
      own: [...(p.readings.own || []), ...d.own].slice(0, 4)};
  }
  return 'ok';
}

function currentState(){
  const controls = {};
  CONTROLS.forEach(id => { controls[id] = val(id); });
  return {controls, days: [...weekdays()].sort(), readings: S.readings};
}

function persist(){
  const controls = {};
  CONTROLS.forEach(id => { controls[id] = val(id); });
  save({controls, days: [...weekdays()], readings: S.readings});
}

// ---------------------------------------------------------------- zdarzenia
function wire(){
  const aside = document.querySelector('aside');
  aside.addEventListener('change', e => {
    const id = e.target.id;
    if(id === 'preset'){ applyPreset(e.target.value); return; }
    if(id === 'translation'){ switchTranslation(); return; }
    if(e.target.closest('#readings')) return;          // czytania obsługuje ui/readings.js
    if(id === 'nread') S.readings.n = +e.target.value;
    if(PLAN_CHAIN.includes(id)){ markCustom(); resetBelow(id); }
    if(e.target.closest('#days') || id === 'start' || id === 'ndays') markCustom();
    update();
  });
  $('sepOwn').addEventListener('input', schedule);
  $('ndays').addEventListener('input', () => { markCustom(); schedule(); });
  $('ptitle').addEventListener('input', schedule);
  $('fname').addEventListener('change', persist);
  document.querySelectorAll('.day-quick button').forEach(b => b.addEventListener('click', () => {
    setWeekdays(b.dataset.days.split(',').map(Number)); markCustom(); update();
  }));
  $('reset').addEventListener('click', reset);
  $('dl').addEventListener('click', exportCsv);
  $('pdf').addEventListener('click', exportPdf);
  $('ics').addEventListener('click', exportIcs);
  $('share').addEventListener('click', sharePlan);
}

let raf = 0;
const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
const markCustom = () => { if($('preset').value) $('preset').value = ''; };

/** Zmiana ustawienia planu przywraca domyślne wartości ustawień planu, które są pod nim. */
function resetBelow(id){
  for(const k of PLAN_CHAIN.slice(PLAN_CHAIN.indexOf(id) + 1)){
    if(k === 'readings'){
      const d = structuredClone(DEFAULT_READINGS);
      S.readings = {...d, n: S.readings.n};
    } else setVal(k, DEF.get(k));
  }
}

/** Rozdzielnik: wybrany z listy albo własny (sprawdzony). */
function sepCheck(){
  if(val('sep') !== 'own') return {ok: true, value: val('sep').replace(/\\n/g, '\n')};
  const v = val('sepOwn');
  if(!v) return {ok: false, msg: 'Wpisz własny rozdzielnik.'};
  if(v.length > 5) return {ok: false, msg: 'Rozdzielnik może mieć najwyżej 5 znaków.'};
  if(!SEP_OK.test(v)) return {ok: false, msg: 'Niedozwolony znak w rozdzielniku. Dozwolone: spacja | ; / + - · • * # ~ _ & ^'};
  return {ok: true, value: v};
}

function applyPreset(key){
  const p = PRESETS[key];
  if(!p) return update();
  const txt = $('preset').selectedOptions[0].textContent;
  setVal('fname', txt.replace(/\s*·\s*/g, '_').replace(/\s+/g, '_'));
  S.readings.n = p.nread;
  p.readings.forEach((c, i) => { S.readings.cont[i] = c; });
  S.readings.own = structuredClone(DEFAULT_READINGS.own);
  setVal('nread', String(p.nread));
  setVal('order', p.order);
  for(const [id, v] of Object.entries(PRESET_BASE)) setVal(id, v);
  setWeekdays(p.days);
  update();
}

function reset(){
  clearSaved();
  DEF.forEach((v, id) => { if(id !== 'translation') setVal(id, v); });
  setVal('preset', '');
  setWeekdays(range(0, 6));
  S.readings = structuredClone(DEFAULT_READINGS);
  update();
}

async function switchTranslation(){
  const info = S.list.translations.find(t => t.id === val('translation')) || S.list.translations[0];
  const token = ++S.loadToken;
  $('loading').hidden = false;
  try{
    const tr = await loadTranslation(info);
    if(token !== S.loadToken) return;
    S.tr = tr;
  }catch(err){
    showWarn([`Nie udało się wczytać przekładu: ${err.message}`]);
    return;
  }finally{
    if(token === S.loadToken) $('loading').hidden = true;
  }
  update();
}

// ---------------------------------------------------------------- logika ustawień
function partsList(){
  const avail = new Set(S.tr.bookIds);
  const out = [];
  for(let i = 0; i < S.readings.n; i++){
    const key = S.readings.cont[i];
    const name = key === 'own' ? `Własne ${i + 1}` : CONTENT.find(c => c.id === key).label;
    out.push({name, books: booksOf(S.readings, i, avail)});
  }
  return out;
}

/** Chronologia: jedno czytanie (cała Biblia, ST albo NT) albo dwa (ST i NT) – w obrębie ksiąg przekładu. */
function chronAllowed(parts){
  if(parts.some(p => !p.books.length)) return false;
  const avail = S.tr.bookIds;
  const all = avail, ot = avail.filter(b => b <= 39), nt = avail.filter(b => b >= 40);
  const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  if(parts.length === 1) return eq(parts[0].books, all) || eq(parts[0].books, ot) || eq(parts[0].books, nt);
  if(parts.length === 2){
    const [x, y] = parts.map(p => p.books);
    return (eq(x, ot) && eq(y, nt)) || (eq(x, nt) && eq(y, ot));
  }
  return false;
}

function problems(parts){
  const msgs = [];
  const sc = sepCheck(); if(!sc.ok) msgs.push(sc.msg);
  if(parts.some(p => !p.books.length)) msgs.push('Każde czytanie musi mieć przynajmniej jedną księgę.');
  if(!weekdays().size) msgs.push('Zaznacz przynajmniej jeden dzień tygodnia.');
  const n = parseInt(val('ndays'), 10);
  if(!(n >= 1 && n <= 800)) msgs.push('Liczba dni musi być od 1 do 800.');
  if(!parseDate(val('start'))) msgs.push('Podaj datę startu w formacie RRRR-MM-DD.');
  return msgs;
}
function showWarn(msgs){ $('warn').textContent = msgs.join(' '); $('warn').hidden = !msgs.length; }

function formatter(bookSep){ return new RefFormatter(S.canon, S.tr, {abbr: val('abbr'), style: val('refStyle'), bookSep}); }

function refreshControls(parts){
  const tr = S.tr, info = tr.info;
  // przekład
  const nb = tr.bookIds.length;
  $('trInfo').textContent = [
    nb < 66 ? `${nb} z 66 ksiąg – brakujące są pomijane` : '66 ksiąg',
    `${info.verses.toLocaleString('pl-PL')} wersetów`,
    info.headings ? `nagłówki: ${info.headingsNote}` : 'bez nagłówków sekcji',
  ].join(' · ') + '.';
  // zapis odnośników
  const f = formatter();
  const sample = [
    f.bookText([[19, 23, 1, tr.last(19, 23)], [19, 27, 1, tr.last(19, 27)]]),
    f.run([43, 3, 16, 3, 18]),
    f.run([45, 1, 18, 2, 4]),
  ];
  $('refExample').textContent = sample.join('; ');
  // kolejność
  const chronOk = chronAllowed(parts);
  ctrl('order').querySelector('option[value=chron]').disabled = !chronOk;
  if(!chronOk && val('order') === 'chron') setVal('order', 'seq');
  $('orderHint').hidden = chronOk;
  $('orderHint').textContent = 'Chronologia: jedno czytanie (cała Biblia, Stary albo Nowy Testament) albo dwa (Stary i Nowy Testament).';
  $('noMixWrap').hidden = val('order') !== 'seq';
  ctrl('noMixMode').disabled = !val('noMixOn');
  // rozdzielnik
  const sc = sepCheck();
  $('sepOwn').hidden = val('sep') !== 'own';
  $('sepErr').hidden = sc.ok || val('sep') !== 'own';
  $('sepErr').textContent = sc.ok ? '' : sc.msg;
  // podział i nagłówki
  const byCh = val('unit') === 'chapters';
  ctrl('noSplitCh').disabled = byCh;
  $('noSplitWrap').classList.toggle('off', byCh);
  const headsOk = tr.hasHeadings && !byCh;
  ctrl('useHeads').disabled = !headsOk;
  $('useHeadsWrap').classList.toggle('off', !headsOk);
  $('headsHint').hidden = tr.hasHeadings;
  $('headsHint').textContent = `Przekład ${info.short} nie ma nagłówków sekcji – opcja niedostępna.`;
  // eksport
  $('templateHint').textContent = TEMPLATES.find(t => t.id === val('template'))?.desc || '';
  // czytania
  renderReadings($('readings'), S.readings, S.canon, new Set(tr.bookIds), kind => { markCustom(); if(kind === 'content') resetBelow('readings'); update(); });
}

// ---------------------------------------------------------------- plan
function update(){
  if(!S.tr) return;
  const parts = partsList();
  refreshControls(parts);
  const msgs = problems(parts);
  showWarn(msgs);
  $('dl').disabled = $('pdf').disabled = $('ics').disabled = $('share').disabled = msgs.length > 0;
  persist();
  document.querySelector('.table-wrap').classList.toggle('stale', msgs.length > 0);
  if(msgs.length) return;

  const tr = S.tr;
  const {y, m, d} = parseDate(val('start'));
  const n = parseInt(val('ndays'), 10);
  const dates = Array.from({length: n}, (_, i) => new Date(y, m, d + i));
  const chron = val('order') === 'chron';
  const plan = buildPlan({
    tr, parts, dates,
    chron: chron ? tr.chronology.entries : null,
    mode: val('unit'), mix: val('noMixOn') ? val('noMixMode') : 'off',
    useHeads: tr.hasHeadings && val('useHeads'), noSplitCh: val('noSplitCh'),
    weekdays: weekdays(),
  });
  const f = formatter(sepCheck().value);
  const P = parts.length;
  S.view = {
    parts: parts.map(p => p.name),
    rows: plan.rows.map(r => ({
      date: r.date,
      texts: r.units ? r.units.map(us => us.length ? f.dayText(us) : '') : null,
      load: r.verses ? r.verses.reduce((a, b) => a + b, 0) : 0,
    })),
  };
  const today = renderPreview($('thead'), $('rows'), S.view);
  if(today && !S.scrolledToday){ S.scrolledToday = true; today.scrollIntoView({block: 'center'}); }

  const filled = S.view.rows.filter(r => r.texts).length;
  const stats = [`Dni z czytaniem: ${filled} z ${n}`];
  plan.parts.forEach((p, i) => stats.push(`${P > 1 ? p.name + ': ' : ''}${plan.totals[i].toLocaleString('pl-PL')} wersetów`));
  if(chron && tr.chronology.attached.length) stats.push(`chronologia dopasowana do ${tr.info.short} (${tr.chronology.attached.length} wers. dołączonych do sąsiednich pasaży)`);
  $('info').textContent = stats.join(' · ');
  const long = dt => dt.toLocaleDateString('pl-PL', {day: 'numeric', month: 'long', year: 'numeric'});
  S.view.subtitleShort = `${tr.info.short}${chron ? ' · chronologicznie' : ''}`;
  S.view.subtitle = `${tr.info.name}${chron ? ' · chronologicznie' : ''} · ${long(dates[0])} – ${long(dates[n - 1])}`;
}

// ---------------------------------------------------------------- eksport
function safeName(){
  return (val('fname') || '').trim().replace(/[\\/:*?"<>|]+/g, '_') || 'plan_czytania';
}
function exportCsv(){
  if(!S.view || $('dl').disabled) return;
  download(safeName() + '.csv', toCsv(S.view.rows, {sep: sepCheck().value, withDate: val('csvDate')}));
}
function exportPdf(){
  if(!S.view || $('pdf').disabled) return;
  buildPrint($('printRoot'), val('template'), {...S.view, title: val('ptitle') || 'Plan czytania Biblii', mono: val('mono')});
  const old = document.title;
  document.title = safeName();
  addEventListener('afterprint', () => { document.title = old; }, {once: true});
  print();
}

function exportIcs(){
  if(!S.view || $('ics').disabled) return;
  const title = val('ptitle') || 'Plan czytania Biblii';
  download(safeName() + '.ics', toIcs(S.view.rows, {title, parts: S.view.parts, reminder: val('reminder')}), 'text/calendar;charset=utf-8', false);
  toast('Pobrano plik kalendarza. Otwórz go albo zaimportuj w Kalendarzu Google / Apple / Outlook.');
}

async function sharePlan(){
  if($('share').disabled) return;
  const defaults = {controls: Object.fromEntries(DEF), days: range(0, 6)};
  const url = planUrl(encodePlan(currentState(), defaults));
  if(navigator.share && matchMedia('(pointer: coarse)').matches){
    try{ await navigator.share({title: val('ptitle') || 'Plan czytania Biblii', url}); return; }catch(e){ if(e.name === 'AbortError') return; }
  }
  try{ await navigator.clipboard.writeText(url); toast('Skopiowano link do planu.'); }
  catch(e){ prompt('Skopiuj link do planu:', url); }
}

let toastTimer = 0;
function toast(msg){
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

// ---------------------------------------------------------------- aplikacja instalowana (PWA), działanie bez internetu
function initPwa(){
  if('serviceWorker' in navigator && location.protocol !== 'file:'){
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker:', err));
  }
  let deferred = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('install').hidden = false; });
  addEventListener('appinstalled', () => { $('install').hidden = true; deferred = null; });
  $('install').addEventListener('click', async () => {
    if(!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null; $('install').hidden = true;
  });
}

// ---------------------------------------------------------------- telefon: ustawienia i podgląd jako osobne ekrany
function initMobile(){
  const route = () => { document.body.classList.toggle('show-preview', location.hash === '#podglad'); scrollTo(0, 0); };
  $('toPreview').addEventListener('click', () => { location.hash = 'podglad'; });
  $('toSettings').addEventListener('click', () => { if(location.hash === '#podglad') history.back(); else location.hash = ''; });
  addEventListener('hashchange', route);
  route();
}

boot().catch(err => {
  console.error(err);
  showWarn([`Błąd uruchamiania: ${err.message}. Aplikacja musi być otwarta z serwera (np. GitHub Pages albo python3 -m http.server).`]);
});

// do podglądu stanu w konsoli przeglądarki
window.__plan = S;
