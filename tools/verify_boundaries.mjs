// Weryfikacja treściowa granic chronologii: dla każdego zakresu zaczynającego się w środku rozdziału
// porównuje tekst wersetu na granicy z przekładem o numeracji zgodnej z chronologią.
// Użycie: node tools/verify_boundaries.mjs
import {readFileSync, existsSync} from 'node:fs';
import {Translation} from '../js/bible.js';
const R=new URL('../', import.meta.url).pathname;
const json = p => JSON.parse(readFileSync(R+p,'utf8'));
const canon=json('data/books.json'), chron=json('data/chronology.json');
const list=json('data/translations.json').translations;
const structs=Object.fromEntries(list.map(t=>[t.id,json(`data/translations/${t.id}/structure.json`).books]));
const txtCache={};
const text=(id,b,c)=>{const k=id+b; if(!(k in txtCache)){const f=R+`data/translations/${id}/text/${String(b).padStart(2,'0')}.json`; txtCache[k]=existsSync(f)?JSON.parse(readFileSync(f,'utf8')):null;}
  const d=txtCache[k]; if(!d||c<1||c>d.chapters.length) return {}; return Object.fromEntries(d.chapters[c-1].verses.map(x=>[x.v,x.t]));};
const toks=s=>new Set((s.toLowerCase().match(/[\p{L}\d]+/gu)||[]).filter(w=>w.length>=4));
const sim=(a,b)=>{const A=toks(a||''),B=toks(b||'');let i=0;for(const x of A)if(B.has(x))i++;return i/Math.max(1,A.size+B.size-i);};
const osisId=Object.fromEntries(canon.books.map(b=>[b.osis,b.id]));
let bad=0,total=0;
for(const info of list){
  const vp=`data/translations/${info.id}/versification.json`;
  const ver=existsSync(R+vp)?json(vp):null;
  const tr=new Translation(info,json(`data/translations/${info.id}/structure.json`),null,canon);
  const m=tr.mapChronology(chron,ver);
  if(m.attached.length) console.log(info.id,'dołączone:',m.attached.join(' '));
  for(const part of chron.entries.flatMap(e=>e.split(';'))){
    const r=tr.parseRange(part); if(!tr.has(r.b)||!r.v1||r.v1===1) continue;
    const ref=chron.chapters[r.b][r.c1-1];
    const pivot=list.find(t=>t.id!==info.id&&structs[t.id][r.b]&&structs[t.id][r.b][r.c1-1]?.length===ref);
    if(!pivot) continue;
    const one=tr.mapChronology({...chron,entries:[part, `${part.split(' ')[0]} 1-200`]},ver);
    const first=one.entries[0]; if(!first||first[0][0]!==r.b) continue;
    const [,c,v]=first[0]; total++;
    const pv=text(pivot.id,r.b,r.c1)[r.v1]; const own=text(info.id,r.b,c);
    // najlepiej pasujący werset przekładu w okolicy (w tym rozdziale i sąsiednich)
    const cands=[]; for(const cc of [c-1,c,c+1]){const t=text(info.id,r.b,cc); for(const [vv,s] of Object.entries(t)) if(Math.abs((cc-c)*100+ +vv - v)<=4||cc!==c&&false) cands.push([cc,+vv,sim(pv,s)]);}
    const best=cands.sort((a,b)=>b[2]-a[2])[0];
    const here=sim(pv,own[v]);
    if(best && (best[0]!==c||best[1]!==v) && best[2]>=0.25 && best[2]>here+0.15){bad++; console.log(`  ${info.id} ${part}: początek ${c}:${v} (podob. ${here.toFixed(2)}), lepiej ${best[0]}:${best[1]} (${best[2].toFixed(2)}) [wzór ${pivot.id}]`);}
  }
}
console.log(`sprawdzone granice: ${total}, podejrzane: ${bad}`);
if(bad) process.exit(1);
