// Model przekładu zbudowany z plików data/translations/<id>/*.json.
// Wszystko liczone jest na rzeczywistej budowie wybranego przekładu: liczbie rozdziałów,
// wersetów (z lukami) i słów. Moduł jest czysty (bez DOM i fetch) – da się go testować w Node.

/** Jednostka planu: [księga, rozdział, werset od, werset do] (wersety w obrębie jednego rozdziału). */

export class Translation {
  /**
   * @param {object} info      wpis z data/translations.json
   * @param {object} structure data/translations/<id>/structure.json
   * @param {object|null} headings data/translations/<id>/headings.json albo null
   * @param {object} canon     data/books.json
   */
  constructor(info, structure, headings, canon){
    this.info = info;
    this.id = info.id;
    this.canon = canon;
    this.osisToId = new Map(canon.books.map(b => [b.osis, b.id]));
    /** @type {Map<number, (number|null)[][]>} */
    this.books = new Map(Object.entries(structure.books).map(([b, ch]) => [+b, ch]));
    this.bookIds = [...this.books.keys()].sort((a, b) => a - b);
    this.headSet = new Set();
    if(headings) for(const h of headings.headings){
      const r = this.parseRef(h.ref);
      if(r && (h.level || 1) === 1) this.headSet.add(`${r.b}.${r.c}.${r.v}`);
    }
    this.hasHeadings = this.headSet.size > 0;
  }

  has(b){ return this.books.has(b); }
  chapters(b){ return this.books.get(b)?.length || 0; }
  /** Numer ostatniego wersetu rozdziału (0, gdy rozdziału nie ma). */
  last(b, c){ return this.books.get(b)?.[c - 1]?.length || 0; }
  exists(b, c, v){ const ch = this.books.get(b)?.[c - 1]; return !!ch && v >= 1 && v <= ch.length && ch[v - 1] !== null; }
  words(b, c, v){ return this.books.get(b)?.[c - 1]?.[v - 1] || 0; }
  firstVerse(b, c){ const ch = this.books.get(b)?.[c - 1] || []; const i = ch.findIndex(x => x !== null); return i + 1; }
  /** Następny istniejący werset po v w tym samym rozdziale (albo last+1). */
  nextVerse(b, c, v){ const L = this.last(b, c); let n = v + 1; while(n <= L && !this.exists(b, c, n)) n++; return n; }

  /** Wszystkie istniejące wersety jednostki. */
  *versesOf([b, c, v1, v2]){ for(let v = v1; v <= v2; v++) if(this.exists(b, c, v)) yield v; }
  verseCount(u){ let n = 0; for(const _ of this.versesOf(u)) n++; return n; }
  wordCount(u){ let n = 0; for(const v of this.versesOf(u)) n += this.words(u[0], u[1], v); return n; }
  chapterUnit(b, c){ return [b, c, 1, this.last(b, c)]; }

  isHeading(b, c, v){ return this.headSet.has(`${b}.${c}.${v}`); }

  /** 'Gen 1:1' -> {b, c, v} */
  parseRef(ref){
    const m = /^(\S+) (\d+):(\d+)$/.exec(ref);
    if(!m) return null;
    const b = this.osisToId.get(m[1]);
    return b ? {b, c: +m[2], v: +m[3]} : null;
  }

  /**
   * Zakres z pliku chronologii -> {b, c1, v1, c2, v2}; v1 = null to początek rozdziału, v2 = null to jego koniec.
   * Składnia: 'Gen 1', 'Gen 1-3', 'Gen 1:1-5', 'Gen 1:20-2:3', 'Gen 1:20-end', 'Gen 1:20-3:end'.
   */
  parseRange(str){
    const m = /^(\S+) (\d+)(?::(\d+))?(?:-(?:(\d+):)?(\d+|end))?$/.exec(str.trim());
    if(!m) throw new Error('Nieprawidłowy zakres: ' + str);
    const b = this.osisToId.get(m[1]);
    const c1 = +m[2];
    if(m[3] === undefined){                         // całe rozdziały: 'Gen 1' / 'Gen 1-3'
      return {b, c1, v1: null, c2: m[5] ? +m[5] : c1, v2: null};
    }
    const v1 = +m[3];
    if(m[5] === undefined) return {b, c1, v1, c2: c1, v2: v1};
    const c2 = m[4] ? +m[4] : c1;
    return {b, c1, v1, c2, v2: m[5] === 'end' ? null : +m[5]};
  }

  /**
   * Przelicznik punktów z wersyfikacji odniesienia (np. BW) na ten przekład, dla jednej księgi.
   * Rozdziały, po których oba przekłady mają tyle samo wersetów od początku księgi, są punktami zgodności.
   * Między takimi punktami (i do końca księgi, gdy suma się zgadza) werset liczymy po kolejnym numerze
   * w księdze – to obsługuje przesunięte granice rozdziałów (Lb 16/17, 1 Krn 5/6, Jl 2/3, Ml 3/4…).
   * Gdzie sumy się nie zgadzają (np. numeracja tytułów psalmów) zostaje rozdział:werset bez zmian.
   */
  pointMapper(b, refChapters){
    const ref = refChapters;
    const own = (this.books.get(b) || []).map(c => c.length);
    const cum = a => a.reduce((acc, x) => (acc.push((acc.at(-1) || 0) + x), acc), []);
    const cr = cum(ref), ct = cum(own);
    const index = new Array(ref.length + 1).fill(false);    // index[c] = rozdział c liczony po numerze w księdze
    let start = 1;
    for(let c = 1; c <= ref.length; c++){
      if(c <= own.length && cr[c - 1] === ct[c - 1]){ for(let k = start; k <= c; k++) index[k] = true; start = c + 1; }
    }
    if(cr.at(-1) === ct.at(-1)) for(let k = start; k <= ref.length; k++) index[k] = true;
    const toOwn = o => {                                     // numer w księdze -> [rozdział, werset]
      let c = ct.findIndex(x => x >= o) + 1;
      if(c === 0) c = own.length;
      return [c, o - (ct[c - 2] || 0)];
    };
    return {
      /** Punkt odniesienia -> punkt przekładu. atEnd = koniec rozdziału; początek za końcem rozdziału = pusty zakres. */
      map: (c, v, atEnd, isStart) => {
        if(c > ref.length) return atEnd ? [c, this.last(b, c)] : [c, v];
        if(index[c]){
          if(isStart && v > ref[c - 1]) return [Infinity, 0];
          const vv = atEnd ? ref[c - 1] : Math.min(v, ref[c - 1]);
          return toOwn((cr[c - 2] || 0) + vv);
        }
        return [c, atEnd ? this.last(b, c) : v];
      },
    };
  }

  /**
   * Dopasowanie uniwersalnej chronologii do wersyfikacji przekładu.
   * Gwarancja: każdy istniejący werset przekładu trafia do dokładnie jednego pasażu.
   *  - granice zakresów przeliczane są z wersyfikacji odniesienia (pointMapper),
   *  - werset zgłoszony dwa razy zostaje w pierwszym pasażu,
   *  - werset, którego nie objął żaden zakres, dołącza do pasażu poprzedniego wersetu tej samej księgi
   *    (albo następnego, gdy to początek księgi).
   * @param {object} chron  data/chronology.json (zakresy + liczba wersetów w rozdziałach numeracji odniesienia)
   * @returns {{entries: number[][][], attached: string[], duplicates: number}}
   */
  mapChronology(chron){
    const owner = new Map();                   // 'b.c.v' -> indeks pasażu
    const lists = chron.entries.map(() => []); // indeks pasażu -> [[b,c,v], ...]
    const mappers = new Map();
    const mapper = b => {
      if(!mappers.has(b)){
        const refCh = chron.chapters?.[b];
        mappers.set(b, refCh ? this.pointMapper(b, refCh) : {map: (c, v, atEnd) => [c, atEnd ? this.last(b, c) : v]});
      }
      return mappers.get(b);
    };
    let duplicates = 0;
    chron.entries.forEach((entry, i) => {
      for(const part of entry.split(';')){
        const r = this.parseRange(part);
        if(!this.has(r.b)) continue;
        const m = mapper(r.b);
        const [sc, sv] = m.map(r.c1, r.v1 || 1, false, true);
        const [ec, ev] = m.map(r.c2, r.v2 || 0, r.v2 === null);
        for(let c = sc; c <= ec; c++){
          const L = this.last(r.b, c);
          for(let v = c === sc ? sv : 1; v <= (c === ec ? Math.min(ev, L) : L); v++){
            if(!this.exists(r.b, c, v)) continue;
            const k = `${r.b}.${c}.${v}`;
            if(owner.has(k)){ duplicates++; continue; }
            owner.set(k, i); lists[i].push([r.b, c, v]);
          }
        }
      }
    });
    // pokrycie: wersety bez pasażu
    const attached = [];
    for(const b of this.bookIds){
      const all = [];
      for(let c = 1; c <= this.chapters(b); c++) for(let v = 1; v <= this.last(b, c); v++) if(this.exists(b, c, v)) all.push([b, c, v]);
      const key = ([b, c, v]) => `${b}.${c}.${v}`;
      for(let i = 0; i < all.length; i++){
        if(owner.has(key(all[i]))) continue;
        let j = i - 1; while(j >= 0 && !owner.has(key(all[j]))) j--;
        let target;
        if(j >= 0) target = owner.get(key(all[j]));
        else { let k = i + 1; while(k < all.length && !owner.has(key(all[k]))) k++; target = k < all.length ? owner.get(key(all[k])) : -1; }
        if(target === -1){ lists.push([]); target = lists.length - 1; }
        owner.set(key(all[i]), target); lists[target].push(all[i]);
        attached.push(`${b}.${all[i][1]}.${all[i][2]}`);
      }
    }
    // pasaż -> jednostki [b,c,v1,v2] (kolejność ksiąg jak w pasażu, wersety rosnąco)
    const entries = lists.map(vs => {
      const bookOrder = [];
      for(const [b] of vs) if(!bookOrder.includes(b)) bookOrder.push(b);
      vs.sort((x, y) => bookOrder.indexOf(x[0]) - bookOrder.indexOf(y[0]) || x[1] - y[1] || x[2] - y[2]);
      const units = [];
      for(const [b, c, v] of vs){
        const u = units[units.length - 1];
        if(u && u[0] === b && u[1] === c && this.nextVerse(b, c, u[3]) === v) u[3] = v;
        else units.push([b, c, v, v]);
      }
      return units;
    }).filter(u => u.length);
    return {entries, attached, duplicates};
  }
}
