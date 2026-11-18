// Szablony wydruku / PDF. Każdy szablon buduje zawartość #printRoot; style są w assets/css/print.css.
import {el} from '../dom.js';

export const TEMPLATES = [
  {id: 'compact',   label: 'Tabela zwarta',         desc: 'Cały rok na kilku stronach A4, kilka kolumn dni obok siebie.', page: 'A4 portrait', margin: '9mm'},
  {id: 'checklist', label: 'Lista do odhaczania',   desc: 'Większa czcionka, kratka przy każdym czytaniu i miejsce na notatki.', page: 'A4 portrait', margin: '12mm'},
  {id: 'weekly',    label: 'Kartki tygodniowe',     desc: 'Tygodnie w ramkach, dwie kolumny na stronie.', page: 'A4 portrait', margin: '10mm'},
  {id: 'calendar',  label: 'Kalendarz miesięczny',  desc: 'Jedna strona na miesiąc, czytania w kratkach dni (A4 poziomo).', page: 'A4 landscape', margin: '9mm'},
  {id: 'bookmarks', label: 'Zakładki do wycięcia',  desc: 'Cztery paski na stronie A4 poziomo – do włożenia do Biblii.', page: 'A4 landscape', margin: '8mm'},
];

const MONTHS = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
const DOW = ['Pn','Wt','Śr','Cz','Pt','So','Nd'];
const dd = d => d.toLocaleDateString('pl-PL', {day: '2-digit', month: '2-digit'});
const dow = d => DOW[(d.getDay() + 6) % 7];
const box = () => el('span', {className: 'box'});
const header = (o) => [el('h1', {className: 'p-title'}, o.title), el('p', {className: 'p-sub'}, o.subtitle)];

/**
 * @param {HTMLElement} root  #printRoot
 * @param {string} id         szablon
 * @param {object} o          {title, subtitle, parts: string[], rows: {date, texts|null}[], mono}
 */
export function buildPrint(root, id, o){
  const tpl = TEMPLATES.find(t => t.id === id) || TEMPLATES[0];
  root.className = 'tpl-' + tpl.id + (o.mono ? ' mono' : '');
  root.innerHTML = '';
  let st = document.getElementById('pageStyle');
  if(!st){ st = el('style', {id: 'pageStyle'}); document.head.append(st); }
  st.textContent = `@page{size:${tpl.page};margin:${tpl.margin}}`;
  ({compact, checklist, weekly, calendar, bookmarks})[tpl.id](root, o);
}

function compact(root, o){
  const list = o.rows.filter(r => r.texts);
  const P = o.parts.length;
  const R = 62, B = P === 1 ? 4 : (P === 2 ? 3 : 2), per = B * R;
  for(let start = 0; start < list.length; start += per){
    const page = el('div', {className: 'p-page'});
    if(start === 0) page.append(...header(o));
    const hdr = el('tr');
    for(let b = 0; b < B; b++){
      hdr.append(el('th', {className: b ? 'sep' : ''}, 'Data'));
      o.parts.forEach((p, i) => hdr.append(el('th', null, P > 1 ? `Czytanie ${i + 1}` : 'Czytanie')));
    }
    const tbody = el('tbody');
    for(let i = 0; i < R; i++){
      const tr = el('tr');
      for(let b = 0; b < B; b++){
        const r = list[start + b * R + i];
        tr.append(el('td', {className: 'date' + (b ? ' sep' : '')}, r ? dd(r.date) : ''));
        o.parts.forEach((p, pi) => tr.append(el('td', null, r ? (r.texts[pi] || '') : '')));
      }
      if(start + i >= list.length && list.length - start < R) break;
      tbody.append(tr);
    }
    page.append(el('table', null, el('thead', null, hdr), tbody));
    root.append(page);
  }
}

function checklist(root, o){
  root.append(...header(o));
  const P = o.parts.length;
  const tbody = el('tbody');
  let prevWeek = null;
  for(const r of o.rows){
    if(!r.texts) continue;
    const wk = weekKey(r.date);
    const tr = el('tr', {className: prevWeek !== null && wk !== prevWeek ? 'week' : ''});
    prevWeek = wk;
    tr.append(el('td', {className: 'date'}, `${dow(r.date)} ${dd(r.date)}`));
    r.texts.forEach(t => tr.append(el('td', null, t ? [box(), t] : '')));
    tr.append(el('td', {className: 'notes'}));
    tbody.append(tr);
  }
  const head = el('tr', null, el('th', null, 'Dzień'), o.parts.map((p, i) => el('th', null, P > 1 ? p : 'Czytanie')), el('th', null, 'Notatki'));
  root.append(el('table', null, el('thead', null, head), tbody));
}

function weekly(root, o){
  root.append(...header(o));
  const weeks = new Map();
  for(const r of o.rows){
    if(!r.texts) continue;
    const k = weekKey(r.date);
    if(!weeks.has(k)) weeks.set(k, []);
    weeks.get(k).push(r);
  }
  const grid = el('div', {className: 'weeks'});
  let n = 0;
  for(const days of weeks.values()){
    n++;
    const tb = el('tbody');
    for(const r of days){
      tb.append(el('tr', null, el('td', {className: 'date'}, `${dow(r.date)} ${dd(r.date)}`),
        el('td', null, r.texts.filter(Boolean).map((t, i) => el('div', null, box(), t)))));
    }
    grid.append(el('div', {className: 'wk'}, el('h3', null, `Tydzień ${n} · ${dd(days[0].date)}–${dd(days[days.length - 1].date)}`), el('table', null, tb)));
  }
  root.append(grid);
}

function calendar(root, o){
  if(!o.rows.length) return;
  const byDay = new Map(o.rows.map(r => [r.date.toDateString(), r]));
  const first = o.rows[0].date, last = o.rows[o.rows.length - 1].date;
  for(let y = first.getFullYear(), m = first.getMonth(); y < last.getFullYear() || (y === last.getFullYear() && m <= last.getMonth()); m === 11 ? (y++, m = 0) : m++){
    const page = el('div', {className: 'p-page'});
    page.append(el('div', {className: 'month'}, `${MONTHS[m]} ${y}`, el('small', null, `${o.title} · ${o.subtitleShort || ''}`)));
    const tbody = el('tbody');
    const lead = (new Date(y, m, 1).getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    let tr = el('tr');
    for(let i = 0; i < lead; i++) tr.append(el('td', {className: 'out'}));
    for(let d = 1; d <= days; d++){
      const date = new Date(y, m, d);
      const r = byDay.get(date.toDateString());
      const td = el('td', {className: !r ? 'out' : (r.texts ? '' : 'rest')}, el('span', {className: 'dn'}, d));
      if(r?.texts) r.texts.forEach(t => { if(t) td.append(el('span', {className: 'r'}, t)); });
      tr.append(td);
      if(tr.children.length === 7){ tbody.append(tr); tr = el('tr'); }
    }
    if(tr.children.length){ while(tr.children.length < 7) tr.append(el('td', {className: 'out'})); tbody.append(tr); }
    page.append(el('table', null, el('thead', null, el('tr', null, DOW.map(x => el('th', null, x)))), tbody));
    root.append(page);
  }
}

function bookmarks(root, o){
  const strips = el('div', {className: 'strips'});
  strips.append(el('div', {className: 'bm-head'}, ...header(o)));
  for(const r of o.rows){
    if(!r.texts) continue;
    const texts = r.texts.filter(Boolean);
    const day = el('div', {className: 'bm-day'}, box(), el('b', null, dd(r.date)));
    if(texts.length === 1) day.append(texts[0]);
    else texts.forEach(t => day.append(el('span', {className: 'r'}, t)));
    strips.append(day);
  }
  root.append(strips);
}

function weekKey(d){
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() + 6) % 7);
  return m.toDateString();
}
