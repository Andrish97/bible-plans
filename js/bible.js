// Model przekładu: budowa (data/translations/<id>/structure.json) + mapa numeracji na wzorzec
// (data/versification/<id>.json). Chronologia i nagłówki są zapisane we wzorcu (numeracja oryginału)
// i przez mapę trafiają na wersety przekładu. Moduł jest czysty (bez DOM i fetch) – da się go testować w Node.

/** Jednostka planu: [księga, rozdział, werset od, werset do] (wersety w obrębie jednego rozdziału). */

export class Translation {
  /**
   * @param {object} info          wpis z data/translations.json
   * @param {object} structure     data/translations/<id>/structure.json
   * @param {object} canon         data/books.json
   * @param {object} org           data/versification/org.json – liczba wersetów w rozdziałach wzorca
   * @param {object|null} map      data/versification/<id>.json – połączenia różne od 1:1
   * @param {object|null} headings data/headings/<zestaw>.json – początki sekcji we wzorcu
   */
  constructor(info, structure, canon, org, map, headings){
    this.info = info;
    this.id = info.id;
    this.canon = canon;
    this.osisToId = new Map(canon.books.map(b => [b.osis, b.id]));
    /** @type {Map<number, (number|null)[][]>} */
    this.books = new Map(Object.entries(structure.books).map(([b, ch]) => [+b, ch]));
    this.bookIds = [...this.books.keys()].sort((a, b) => a - b);
    this.org = org;
    this.buildMap(map);
    this.headSet = new Set();
    if(headings) for(const ref of headings.headings){
      const r = this.parseRef(ref);
      const own = r && this.fromOrg(r.b, r.c, r.v)[0];
      if(own) this.headSet.add(own.join('.'));
    }
    this.hasHeadings = this.headSet.size > 0;
  }

  /** Rozwinięcie zakresu z mapy ('Gen 31:55', 'Gen 32:1-3', 'Gen 31:55-32:1') na wersety; last(b,c) = koniec rozdziału. */
  keysOf(ref, last){
    const m = /^(\S+) (\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/.exec(ref);
    const b = this.osisToId.get(m[1]), c1 = +m[2], v1 = +m[3];
    if(!m[5]) return [[b, c1, v1]];
    const c2 = m[4] ? +m[4] : c1, v2 = +m[5], out = [];
    for(let c = c1; c <= c2; c++) for(let v = c === c1 ? v1 : 1; v <= (c === c2 ? v2 : last(b, c)); v++) out.push([b, c, v]);
    return out;
  }

  /** Mapa wzorzec -> przekład: połączenia n:m, brakujące wersety wzorca; reszta to ten sam numer. */
  buildMap(map){
    const orgLast = (b, c) => this.org.books[b]?.[c - 1] || 0;
    this.orgToOwn = new Map();                  // 'b.c.v' wzorca -> [[b,c,v] przekładu]
    this.mappedOwn = new Set();                 // wersety przekładu, które są w jakimś połączeniu
    for(const [o, t] of map?.links || []){
      const O = this.keysOf(o, orgLast), T = this.keysOf(t, (b, c) => this.last(b, c));
      for(const k of O) this.orgToOwn.set(k.join('.'), T);
      for(const k of T) this.mappedOwn.add(k.join('.'));
    }
    for(const o of map?.missing || []) for(const k of this.keysOf(o, orgLast)) this.orgToOwn.set(k.join('.'), []);
  }

  /** Werset wzorca -> wersety przekładu (pusta lista, gdy przekład go nie ma). */
  fromOrg(b, c, v){
    const linked = this.orgToOwn.get(`${b}.${c}.${v}`);
    if(linked) return linked;
    return this.exists(b, c, v) && !this.mappedOwn.has(`${b}.${c}.${v}`) ? [[b, c, v]] : [];
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

  /** Zakres z pliku chronologii (numeracja wzorca): 'Gen 1', 'Gen 1-3', 'Gen 1:1-5', 'Gen 1:20-2:3' -> wersety wzorca. */
  orgRange(str){
    const m = /^(\S+) (\d+)(?::(\d+))?(?:-(?:(\d+):)?(\d+))?$/.exec(str.trim());
    if(!m) throw new Error('Nieprawidłowy zakres: ' + str);
    const b = this.osisToId.get(m[1]), c1 = +m[2];
    const last = c => this.org.books[b]?.[c - 1] || 0;
    let v1, c2, v2;
    if(m[3] === undefined){ v1 = 1; c2 = m[5] ? +m[5] : c1; v2 = last(c2); }
    else { v1 = +m[3]; c2 = m[4] ? +m[4] : c1; v2 = m[5] ? +m[5] : (m[4] ? last(c2) : v1); }
    if(m[3] !== undefined && m[5] && !m[4]) c2 = c1;
    const out = [];
    for(let c = c1; c <= c2; c++) for(let v = c === c1 ? v1 : 1; v <= (c === c2 ? v2 : last(c)); v++) out.push([b, c, v]);
    return out;
  }

  /**
   * Chronologia historiami (numeracja wzorca) -> historie w wersetach tego przekładu, przez mapę numeracji.
   * Gwarancja: każdy istniejący werset przekładu należy do dokładnie jednej historii
   * (werset połączony z kilkoma wersetami wzorca – do pierwszej z nich; werset bez odpowiednika
   * we wzorcu – do historii poprzedniego wersetu tej samej księgi).
   * @param {object} chron data/chronology.json
   * @returns {{threads: {name:string, first:number, count:number}[], stories: {units:number[][], thread:number, refs:string, note?:string[]}[],
   *   entries: number[][][], storyOf: Map<string, number>, attached: string[], shared: string[], duplicates: number}}
   */
  mapChronology(chron){
    const owner = new Map();                   // 'b.c.v' przekładu -> indeks historii
    const meta = [], lists = [], threads = [];
    const shared = [];                         // wersety przekładu na styku dwóch historii (zostają w pierwszej)
    chron.threads.forEach((th, t) => {
      threads.push({name: th.name, first: meta.length, count: th.stories.length});
      for(const st of th.stories){
        const i = meta.length;
        meta.push({thread: t, name: st.name, refs: st.refs, note: st.note});
        const vs = [];
        for(const part of st.refs.split(';')){
          for(const [b, c, v] of this.orgRange(part)){
            if(!this.has(b)) continue;
            for(const k of this.fromOrg(b, c, v)){
              const key = k.join('.');
              if(owner.has(key)){ if(owner.get(key) !== i) shared.push(`${key}`); continue; }  // kilka wersetów wzorca = jeden werset przekładu
              owner.set(key, i); vs.push(k);
            }
          }
        }
        lists.push(vs);
      }
    });
    // pokrycie: wersety przekładu bez historii -> historia poprzedniego (albo następnego) wersetu tej księgi,
    // w historii stoją zaraz za nim (albo przed nim)
    const attached = [], after = new Map(), before = new Map();
    const push = (m, k, x) => { if(!m.has(k)) m.set(k, []); m.get(k).push(x); };
    for(const b of this.bookIds){
      const all = [];
      for(let c = 1; c <= this.chapters(b); c++) for(let v = 1; v <= this.last(b, c); v++) if(this.exists(b, c, v)) all.push([b, c, v]);
      const key = ([b, c, v]) => `${b}.${c}.${v}`;
      for(let i = 0; i < all.length; i++){
        if(owner.has(key(all[i]))) continue;
        let j = i - 1; while(j >= 0 && !owner.has(key(all[j]))) j--;
        if(j >= 0){ owner.set(key(all[i]), owner.get(key(all[j]))); push(after, key(all[j]), all[i]); }
        else {
          let k = i + 1; while(k < all.length && !owner.has(key(all[k]))) k++;
          if(k >= all.length) continue;                   // księga bez żadnej historii
          owner.set(key(all[i]), owner.get(key(all[k]))); push(before, key(all[k]), all[i]);
        }
        attached.push(key(all[i]));
      }
    }
    // historia -> jednostki [b,c,v1,v2] w kolejności historii (relacje równoległe przeplatane)
    const stories = lists.map((vs, i) => {
      const seq = [];
      const addAfter = k => { for(const x of after.get(k.join('.')) || []){ seq.push(x); addAfter(x); } };
      for(const k of vs){ for(const x of before.get(k.join('.')) || []) seq.push(x); seq.push(k); addAfter(k); }
      const units = [];
      for(const [b, c, v] of seq){
        const u = units[units.length - 1];
        if(u && u[0] === b && u[1] === c && this.nextVerse(b, c, u[3]) === v) u[3] = v;
        else units.push([b, c, v, v]);
      }
      return {...meta[i], units};
    });
    return {threads, stories, entries: stories.map(s => s.units), storyOf: owner, attached, shared, duplicates: shared.length, rules: chron.rules || []};
  }
}
