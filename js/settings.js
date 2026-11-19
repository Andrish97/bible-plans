// Ustawienia: wartości domyślne, gotowe zestawy i zapamiętywanie w przeglądarce.

export const STORAGE_KEY = 'plan-ustawienia-v2';

/** Zestawy ksiąg dla czytań. 'own' = własny wybór. */
export const CONTENT = [
  {id: 'all',  label: 'Cała Biblia',                       books: () => range(1, 66)},
  {id: 'otnw', label: 'Stary Testament bez mądrościowych', books: () => range(1, 39).filter(b => b < 18 || b > 22)},
  {id: 'wis',  label: 'Mądrościowe (Hiob na końcu)',       books: () => range(18, 22)},
  {id: 'nt',   label: 'Nowy Testament',                    books: () => range(40, 66)},
  {id: 'ot',   label: 'Stary Testament',                   books: () => range(1, 39)},
  {id: 'own',  label: 'Własny wybór ksiąg',                books: () => []},
];
export function range(a, b){ const r = []; for(let i = a; i <= b; i++) r.push(i); return r; }

/** Kontrolki zapisywane w przeglądarce (id elementu -> rodzaj). */
export const CONTROLS = ['translation', 'abbr', 'refStyle', 'preset', 'nread', 'order', 'noMixOn', 'noMixMode', 'unit', 'noSplitCh', 'noSplitStory', 'useHeads',
  'start', 'ndays', 'template', 'ptitle', 'mono', 'sep', 'sepOwn', 'csvDate', 'reminder', 'fname'];

/**
 * Łańcuch ustawień planu: zmiana jednego przywraca domyślne wartości wszystkich kolejnych.
 * Przekład, zapis odnośników, kalendarz i eksport są niezależne (nie są w łańcuchu).
 * 'readings' oznacza zawartość czytań.
 */
export const PLAN_CHAIN = ['nread', 'readings', 'order', 'noMixOn', 'noMixMode', 'unit', 'noSplitCh', 'noSplitStory', 'useHeads'];

/** Własny rozdzielnik: 1–5 znaków, tylko bezpieczne znaki (bez liter, cyfr, cudzysłowu i przecinka). */
export const SEP_OK = /^[ |\/+\-;·•*#~_&^]+$/;

export const DEFAULT_READINGS = {n: 3, cont: ['otnw', 'wis', 'nt', 'ot'], own: [[], [], [], []]};

export const PRESETS = {
  p3_5:   {nread: 3, readings: ['otnw', 'wis', 'nt'], order: 'seq',   days: [0, 1, 2, 3, 4]},
  p3_7:   {nread: 3, readings: ['otnw', 'wis', 'nt'], order: 'seq',   days: [0, 1, 2, 3, 4, 5, 6]},
  p2_5:   {nread: 2, readings: ['ot', 'nt'],          order: 'seq',   days: [0, 1, 2, 3, 4]},
  p2_7:   {nread: 2, readings: ['ot', 'nt'],          order: 'seq',   days: [0, 1, 2, 3, 4, 5, 6]},
  allc_5: {nread: 1, readings: ['all'],               order: 'chron', days: [0, 1, 2, 3, 4]},
  allc_7: {nread: 1, readings: ['all'],               order: 'chron', days: [0, 1, 2, 3, 4, 5, 6]},
  alls_5: {nread: 1, readings: ['all'],               order: 'seq',   days: [0, 1, 2, 3, 4]},
  alls_7: {nread: 1, readings: ['all'],               order: 'seq',   days: [0, 1, 2, 3, 4, 5, 6]},
};
/** Wspólne dla wszystkich zestawów. */
export const PRESET_BASE = {noMixOn: true, noMixMode: 'soft', unit: 'words', noSplitCh: true, noSplitStory: true, useHeads: true};

export function loadSaved(){
  try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; }catch(e){ return null; }
}
export function save(data){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }catch(e){}
}
export function clearSaved(){
  try{ localStorage.removeItem(STORAGE_KEY); }catch(e){}
}
