// Tabela podglądu planu.
import {el} from '../dom.js';

const fmtDate = d => [
  d.toLocaleDateString('pl-PL', {weekday: 'short'}) + ' ',
  d.toLocaleDateString('pl-PL', {day: '2-digit', month: '2-digit'}),
  el('span', {className: 'yr'}, '.' + d.getFullYear()),
];

/**
 * @param {HTMLElement} thead
 * @param {HTMLElement} tbody
 * @param {{parts: string[], rows: {date: Date, texts: string[]|null, load: number}[]}} view
 */
export function renderPreview(thead, tbody, view){
  thead.replaceChildren(el('tr', null,
    el('th', null, 'Data'),
    view.parts.map((p, i) => el('th', {title: p}, el('span', {className: 'full'}, p), el('span', {className: 'short'}, view.parts.length > 1 ? `Czytanie ${i + 1}` : 'Czytanie'))),
    el('th', {className: 'even', title: 'Liczba wersetów dnia względem średniej w planie'}, 'Obciążenie')));

  const loads = view.rows.map(r => r.load).filter(x => x > 0);
  const avg = loads.reduce((s, x) => s + x, 0) / Math.max(1, loads.length);
  const today = new Date().toDateString();
  const frag = document.createDocumentFragment();
  let todayRow = null;
  view.rows.forEach((r, i) => {
    const cls = [];
    if(!r.texts) cls.push('off');
    if(i && (r.date.getDay() === 1)) cls.push('week');
    if(r.date.toDateString() === today) cls.push('today');
    const tr = el('tr', {className: cls.join(' ')}, el('td', {className: 'date'}, fmtDate(r.date)));
    view.parts.forEach((p, pi) => tr.append(el('td', {className: 'txt'}, r.texts?.[pi] || '—')));
    const even = el('td', {className: 'even'});
    if(r.load > 0){
      const pct = Math.round(100 * r.load / avg);
      even.append(el('span', {className: 'bar'}, el('i', {style: `width:${Math.min(pct, 200) / 2}%`})), el('b', null, pct + '%'));
      even.title = `Dzień: ${r.load} wers., średnio w planie: ${Math.round(avg)} wers.`;
    } else even.textContent = '—';
    tr.append(even);
    if(cls.includes('today')) todayRow = tr;
    frag.append(tr);
  });
  tbody.replaceChildren(frag);
  return todayRow;
}
