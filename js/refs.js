// Formatowanie odnośników biblijnych: zestaw skrótów ksiąg + zapis rozdziału i wersetu.

/**
 * Style zapisu: cv – rozdział/werset, dash – zakres, vs – lista wersetów w jednym rozdziale,
 * list – lista całych rozdziałów.
 */
export const REF_STYLES = [
  {id: 'colon',    label: 'Dwukropek',                cv: ':', dash: '-', vs: ',', list: ','},
  {id: 'comma',    label: 'Polski (przecinek)',       cv: ',', dash: '-', vs: '.', list: '; '},
  {id: 'comma-en', label: 'Polski z półpauzą',        cv: ',', dash: '–', vs: '.', list: '; '},
  {id: 'dot',      label: 'Kropka',                   cv: '.', dash: '-', vs: ',', list: ','},
];

export class RefFormatter {
  /**
   * @param {object} canon data/books.json
   * @param {import('./bible.js').Translation} tr
   * @param {{abbr: string, style: string}} opts
   */
  constructor(canon, tr, opts){
    this.tr = tr;
    this.style = REF_STYLES.find(s => s.id === opts.style) || REF_STYLES[0];
    this.names = new Map(canon.books.map(b => [b.id, b.abbr[opts.abbr] || b.abbr.pl]));
    this.bookSep = opts.bookSep || '; ';
  }
  book(b){ return this.names.get(b); }

  /** Jeden ciągły odcinek [b, c1, v1, c2, v2] -> np. 'Rdz 1:1-2:3' / 'Rdz 1-2' / 'Rdz 1:5'. */
  run([b, c1, v1, c2, v2]){
    const {cv, dash} = this.style, tr = this.tr;
    const fullStart = v1 <= tr.firstVerse(b, c1), fullEnd = v2 >= tr.last(b, c2);
    let s;
    if(c1 === c2) s = (fullStart && fullEnd) ? `${c1}` : (v1 === v2 ? `${c1}${cv}${v1}` : `${c1}${cv}${v1}${dash}${v2}`);
    else if(fullStart && fullEnd) s = `${c1}${dash}${c2}`;
    else s = `${c1}${cv}${v1}${dash}${c2}${cv}${v2}`;
    return `${this.book(b)} ${s}`;
  }

  /** Jednostki jednej księgi w jednym dniu -> jeden napis (sąsiednie fragmenty sklejone). */
  bookText(list){
    const tr = this.tr, bk = list[0][0];
    const runs = [];
    for(const [, ch, vs, ve] of list){
      const r = runs[runs.length - 1];
      if(r){
        const [, , , pc2, pv2] = r;
        const sameCh = pc2 === ch && vs <= tr.nextVerse(bk, ch, pv2);
        const nextCh = pc2 + 1 === ch && vs <= tr.firstVerse(bk, ch) && pv2 >= tr.last(bk, pc2);
        if(sameCh || nextCh){ r[3] = Math.max(pc2, ch); r[4] = sameCh ? Math.max(pv2, ve) : ve; continue; }
      }
      runs.push([bk, ch, vs, ch, ve]);
    }
    // jedna nazwa księgi na dzień: 'Ps 23:1,4; 51:3-5,12; 91' / 'Rdz 11,1-31; 12-14' / 'Rdz 1,3'
    const {cv, dash, vs: VS, list: LS} = this.style;
    const tok = runs.map(([, c1, v1, c2, v2]) => {
      const fs = v1 <= tr.firstVerse(bk, c1), fe = v2 >= tr.last(bk, c2);
      if(c1 !== c2 && fs && fe) return {t: 'w', c: c1, s: `${c1}${dash}${c2}`};
      if(c1 !== c2) return {t: 'x', e: c2, s: `${c1}${cv}${v1}${dash}${c2}${cv}${v2}`};
      if(fs && fe) return {t: 'w', c: c1, s: `${c1}`};
      return {t: 'v', c: c1, s: v1 === v2 ? `${v1}` : `${v1}${dash}${v2}`};
    });
    let out = '', prev = null;
    for(const x of tok){
      if(!prev) out = x.t === 'v' ? `${x.c}${cv}${x.s}` : x.s;
      else if(x.t === 'v' && ((prev.t === 'v' && prev.c === x.c) || (prev.t === 'x' && prev.e === x.c))) out += VS + x.s;
      else if(x.t === 'w' && prev.t === 'w') out += LS + x.s;
      else if(x.t === 'v') out += `; ${x.c}${cv}${x.s}`;
      else out += '; ' + x.s;
      prev = x;
    }
    return `${this.book(bk)} ${out}`;
  }

  /** Wszystkie jednostki jednego czytania w jednym dniu -> tekst. */
  /** Jednostki w podanej kolejności (np. historia z relacjami równoległymi): kolejne kawałki jednej księgi razem. */
  seqText(units, sep = '; '){
    const runs = [];
    for(const u of units){ const r = runs[runs.length - 1]; if(r && r[0][0] === u[0]) r.push(u); else runs.push([u]); }
    return runs.map(l => this.bookText(l)).join(sep);
  }
  dayText(units){
    const order = [], byBook = new Map();
    for(const u of units){
      if(!byBook.has(u[0])){ byBook.set(u[0], []); order.push(u[0]); }
      byBook.get(u[0]).push(u);
    }
    return order.map(b => byBook.get(b).slice().sort((x, y) => x[1] - y[1] || x[2] - y[2]))
      .map(l => this.bookText(l)).join(this.bookSep);
  }
}
