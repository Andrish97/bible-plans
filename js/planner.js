// Podział ksiąg na dni. Czysta logika: dostaje przekład, (opcjonalnie) dopasowaną chronologię
// i ustawienia, zwraca jednostki [b, c, v1, v2] dla każdego czytania i każdego dnia.

/** Rozbicie jednostki na pojedyncze wersety (albo cały rozdział w trybie 'chapters'). */
function explode(tr, u, mode){
  if(mode === 'chapters') return [u];
  const out = [];
  for(const v of tr.versesOf(u)) out.push([u[0], u[1], v, v]);
  return out;
}
function weight(tr, u, mode){
  if(mode === 'words') return tr.wordCount(u);
  if(mode === 'verses') return tr.verseCount(u);
  return 1;
}

/**
 * Grupy do podziału: {u: [jednostki], link: historia albo null, thread: wątek albo null}.
 * Chronologia: kolejność historii; cięcie wewnątrz historii jest mocno karane, między historiami
 * jednego wątku – lekko, między wątkami – wcale.
 * Po kolei: kolejność ksiąg; jeśli podano storyOf (werset -> historia), cięcie wewnątrz historii też jest karane.
 */
export function buildGroups(tr, books, chron, mode, storyOf){
  const set = new Set(books);
  const groups = [];
  if(chron){
    // w trybie rozdziałów jednostką jest kawałek rozdziału należący do historii
    chron.stories.forEach((st, link) => {
      for(const p of st.units) if(set.has(p[0])) for(const e of explode(tr, p, mode)) groups.push({u: [e], link, thread: st.thread});
    });
    return groups;
  }
  let order = books.slice().sort((a, b) => a - b);
  if(set.has(18)){                                    // Hiob idzie po ostatniej księdze mądrościowej w tym czytaniu
    let lastW = 0;
    for(const b of order) if(b >= 19 && b <= 22) lastW = b;
    if(lastW){ order = order.filter(b => b !== 18); order.splice(order.indexOf(lastW) + 1, 0, 18); }
  }
  const story = storyOf && mode !== 'chapters' ? e => storyOf.get(`${e[0]}.${e[1]}.${e[2]}`) ?? null : () => null;
  for(const b of order){
    for(let c = 1; c <= tr.chapters(b); c++){
      if(!tr.last(b, c)) continue;
      for(const e of explode(tr, tr.chapterUnit(b, c), mode)) groups.push({u: [e], link: story(e), thread: null});
    }
  }
  return groups;
}

const groupWeight = (tr, g, mode) => g.u.reduce((s, u) => s + weight(tr, u, mode), 0);

/**
 * Podział ciągu grup na K dni: programowanie dynamiczne po granicach dni, z karami za złe miejsca cięcia.
 * Kolejność ważności: nagłówki, nie mieszaj ksiąg, nie dziel rozdziałów, równomierność.
 */
export function splitGroups(tr, groups, K, mode, opt){
  const {useHeads = false, noSplitCh = false, softMix = false} = opt || {};
  const days = Array.from({length: K}, () => []);
  const G = groups.length;
  if(K === 0 || G === 0) return days;
  if(G < K){ groups.forEach((g, i) => { days[Math.floor(i * K / G)].push(...g.u); }); return days; }
  const cum = []; let t = 0;
  for(const g of groups){ t += groupWeight(tr, g, mode); cum.push(t); }
  const total = t || 1;
  const PEN = 0.25 * total / K;          // cięcie wewnątrz historii: ćwierć dnia
  const THREAD_PEN = 0.06 * total / K;   // cięcie między historiami jednego wątku
  const HEADS_PEN = total / K;           // cięcie poza nagłówkiem: cały dzień
  const CH_PEN = 0.6 * total / K;        // cięcie w środku rozdziału
  const NOMIX_PEN = 0.5 * total / K;     // miękkie „nie łącz ksiąg”: cięcie w środku księgi
  const first = e => groups[e].u[0];
  const lastU = e => groups[e].u[groups[e].u.length - 1];
  const headCut = e => e < G && tr.isHeading(first(e)[0], first(e)[1], first(e)[2]);
  const sameBookCut = e => e < G && lastU(e - 1)[0] === first(e)[0];
  const chapCut = e => e < G && lastU(e - 1)[0] === first(e)[0] && lastU(e - 1)[1] === first(e)[1];
  const inside = e => e < G && groups[e - 1].link != null && groups[e - 1].link === groups[e].link;
  const inThread = e => e < G && groups[e - 1].thread != null && groups[e - 1].thread === groups[e].thread;
  // kary za cięcie po każdej granicy liczone raz
  // rozdział: ciąg grup z tego samego rozdziału; nie zostawiamy 1–3 wersetów, a krótkich rozdziałów nie dzielimy
  const MIN_PART = 4, SHORT_CH = 30;
  const key = i => groups[i].u[0][0] * 1000 + groups[i].u[0][1];
  const runStart = new Int32Array(G), runEnd = new Int32Array(G);
  for(let i = 0; i < G; ){ let j = i; while(j < G && key(j) === key(i)) j++; for(let k = i; k < j; k++){ runStart[k] = i; runEnd[k] = j; } i = j; }
  const pen = new Float64Array(G + 1);
  for(let e = 1; e < G; e++){
    pen[e] = (inside(e) ? PEN : inThread(e) ? THREAD_PEN : 0) + (useHeads && !headCut(e) ? HEADS_PEN : 0) + (noSplitCh && chapCut(e) ? CH_PEN : 0) + (softMix && sameBookCut(e) ? NOMIX_PEN : 0);
    if(chapCut(e)){
      const left = e - runStart[e - 1], right = runEnd[e] - e, len = runEnd[e] - runStart[e - 1];
      if(left < MIN_PART || right < MIN_PART || (noSplitCh && len <= SHORT_CH)) pen[e] = Infinity;
    }
  }
  const valid = (p, e) => e > p && !(e - p < MIN_PART && key(p) === key(e - 1));
  // programowanie dynamiczne po granicach dni: minimalna suma odchyleń i kar; W = dopuszczalne odchylenie granicy
  const dpEnds = W => {
    const layers = [{e: [0], c: [0], b: [null]}];
    for(let k = 1; k < K; k++){
      const target = total * k / K;
      const ce = [], cc = [], cb = [], prevL = layers[k - 1];
      for(let e = 1; e < G; e++){
        if(pen[e] === Infinity) continue;
        const dev = Math.abs(cum[e - 1] - target);
        if(dev > W) continue;
        let bc = Infinity, bi = -1;
        for(let j = 0; j < prevL.e.length; j++){
          if(!valid(prevL.e[j], e)) continue;
          if(prevL.c[j] < bc){ bc = prevL.c[j]; bi = j; }
        }
        if(bi < 0) continue;
        ce.push(e); cc.push(bc + dev + pen[e]); cb.push(bi);
      }
      if(!ce.length) return null;
      layers.push({e: ce, c: cc, b: cb});
    }
    const last = layers[K - 1];
    let bc = Infinity, bi = -1;
    for(let j = 0; j < last.e.length; j++){ if(valid(last.e[j], G) && last.c[j] < bc){ bc = last.c[j]; bi = j; } }
    if(bi < 0) return null;
    const ends = [G];
    for(let k = K - 1; k >= 1; k--){ ends.push(layers[k].e[bi]); bi = layers[k].b[bi]; }
    return ends.reverse();
  };
  let ends = null;
  for(const wm of [3, 6, 12, 1e9]){ ends = dpEnds(wm * total / K); if(ends) break; }
  if(!ends){                                         // awaryjnie: najbliżej celu, bez kar
    ends = []; let prev = 0;
    for(let k = 1; k < K; k++){
      const t = total * k / K; let best = prev + 1;
      for(let e = prev + 1; e <= G - (K - k); e++) if(Math.abs(cum[e - 1] - t) < Math.abs(cum[best - 1] - t)) best = e;
      ends.push(best); prev = best;
    }
    ends.push(G);
  }
  let s = 0;
  for(let k = 0; k < K; k++){
    for(let i = s; i < ends[k]; i++) days[k].push(...groups[i].u);
    s = ends[k];
  }
  return days;
}

/** Twarde „nie łącz ksiąg”: dzień to fragment jednej księgi albo same całe (małe) księgi. null = nie da się. */
export function splitBookSafe(tr, groups, K, mode, opt){
  const segs = [];
  for(const g of groups){
    const bk = g.u[0][0];
    const last = segs[segs.length - 1];
    if(last && last.bk === bk) last.groups.push(g); else segs.push({bk, groups: [g]});
  }
  segs.forEach(s => { s.w = s.groups.reduce((a, g) => a + groupWeight(tr, g, mode), 0); s.n = s.groups.length; });
  const total = segs.reduce((a, s) => a + s.w, 0) || 1;
  const target = total / K;
  const blocks = [];
  for(const s of segs){
    if(s.w > target) blocks.push({big: true, segs: [s], w: s.w, n: s.n});
    else {
      const last = blocks[blocks.length - 1];
      if(last && !last.big){ last.segs.push(s); last.w += s.w; last.n += 1; }
      else blocks.push({big: false, segs: [s], w: s.w, n: 1});
    }
  }
  if(blocks.length > K) return null;
  blocks.forEach(bl => { bl.d = Math.max(1, Math.min(bl.n, Math.round(bl.w / target))); });
  let sum = blocks.reduce((a, bl) => a + bl.d, 0);
  while(sum < K){
    const cand = blocks.filter(bl => bl.d < bl.n);
    if(!cand.length) return null;
    cand.sort((x, y) => (y.w / y.d) - (x.w / x.d))[0].d++; sum++;
  }
  while(sum > K){
    const cand = blocks.filter(bl => bl.d > 1);
    if(!cand.length) return null;
    cand.sort((x, y) => (x.w / x.d) - (y.w / y.d))[0].d--; sum--;
  }
  const days = [];
  for(const bl of blocks){
    if(bl.big) days.push(...splitGroups(tr, bl.segs[0].groups, bl.d, mode, {...opt, softMix: false}));
    else {
      const pseudo = bl.segs.map(s => ({u: s.groups.flatMap(g => g.u), link: null, thread: null}));
      days.push(...splitGroups(tr, pseudo, bl.d, mode, {}));
    }
  }
  return days;
}

/**
 * Cały plan.
 * @param {object} p
 * @param {import('./bible.js').Translation} p.tr
 * @param {{name:string, books:number[]}[]} p.parts  czytania
 * @param {object|null} p.chron                     chronologia dopasowana do przekładu (tr.chronology) albo null = po kolei
 * @param {Map<string,number>|null} p.storyOf       po kolei: werset -> historia (nie dziel historii) albo null
 * @param {'words'|'verses'|'chapters'} p.mode
 * @param {'off'|'soft'|'hard'} p.mix
 * @param {boolean} p.useHeads
 * @param {boolean} p.noSplitCh
 * @param {Date[]} p.dates  wszystkie dni planu
 * @param {Set<number>} p.weekdays  0 = poniedziałek … 6 = niedziela
 */
export function buildPlan(p){
  const {tr, parts, chron, mode} = p;
  const slots = [];
  p.dates.forEach((d, i) => { if(p.weekdays.has((d.getDay() + 6) % 7)) slots.push(i); });
  const K = slots.length;
  const opt = {useHeads: p.useHeads && mode !== 'chapters', noSplitCh: p.noSplitCh && mode !== 'chapters', softMix: !chron && p.mix === 'soft'};
  const perPart = parts.map(pt => {
    const groups = buildGroups(tr, pt.books, chron, mode, chron ? null : p.storyOf);
    return (!chron && p.mix === 'hard' && splitBookSafe(tr, groups, K, mode, opt)) || splitGroups(tr, groups, K, mode, opt);
  });
  const rows = p.dates.map(d => ({date: d, units: null, verses: 0}));
  for(let j = 0; j < K; j++){
    const units = perPart.map(days => days[j]);
    if(units.some(u => u.length)){
      const r = rows[slots[j]];
      r.units = units;
      r.verses = units.map(us => us.reduce((a, u) => a + tr.verseCount(u), 0));
    }
  }
  const totals = parts.map((pt, i) => perPart[i].reduce((s, d) => s + d.reduce((a, u) => a + tr.verseCount(u), 0), 0));
  return {rows, parts, totals};
}
