// Edytor zawartości czytań: dla każdego czytania zestaw ksiąg albo własny wybór.
import {el} from '../dom.js';
import {CONTENT} from '../settings.js';

/**
 * @param {HTMLElement} host
 * @param {{n:number, cont:string[], own:number[][]}} state
 * @param {object} canon       data/books.json
 * @param {Set<number>} available księgi obecne w przekładzie
 * @param {() => void} onChange
 */
export function renderReadings(host, state, canon, available, onChange){
  host.innerHTML = '';
  const name = b => canon.books[b - 1].name;
  for(let i = 0; i < state.n; i++){
    const books = booksOf(state, i, available);
    const sel = el('select', {'aria-label': `Zawartość czytania ${i + 1}`, onchange: () => { state.cont[i] = sel.value; onChange(); }},
      CONTENT.map(c => el('option', {value: c.id}, c.label)));
    sel.value = state.cont[i];
    const total = state.cont[i] === 'own' ? null : CONTENT.find(c => c.id === state.cont[i]).books().length;
    const cnt = el('small', {className: 'cnt'}, countLabel(books.length, total));
    const box = el('div', {className: 'reading'}, el('div', {className: 'rhead'}, `Czytanie ${i + 1}`, cnt), sel);

    if(state.cont[i] === 'own'){
      const bsel = el('select', {'aria-label': 'Księga do dodania'},
        canon.sections.map(s => el('optgroup', {label: s.name},
          canon.books.filter(b => b.id >= s.from && b.id <= s.to).map(b =>
            el('option', {value: b.id, disabled: !available.has(b.id) || state.own[i].includes(b.id)}, b.name)))));
      const firstFree = canon.books.find(b => available.has(b.id) && !state.own[i].includes(b.id));
      if(firstFree) bsel.value = firstFree.id;
      const add = el('button', {type: 'button', className: 'ghost', onclick: () => {
        const b = +bsel.value;
        if(b && !state.own[i].includes(b)){ state.own[i].push(b); onChange(); }
      }}, 'Dodaj');
      const addSection = el('button', {type: 'button', className: 'ghost', title: 'Dodaj całą grupę ksiąg, w której jest wybrana księga', onclick: () => {
        const s = canon.sections.find(x => +bsel.value >= x.from && +bsel.value <= x.to);
        if(!s) return;
        for(let b = s.from; b <= s.to; b++) if(available.has(b) && !state.own[i].includes(b)) state.own[i].push(b);
        onChange();
      }}, '+ grupa');
      box.append(el('div', {className: 'addrow'}, bsel, add, addSection));
      const sorted = state.own[i].slice().sort((a, b) => a - b);
      box.append(el('div', {className: 'tags'}, sorted.map(b =>
        el('span', {className: 'tag'}, name(b),
          el('button', {type: 'button', className: 'x', 'aria-label': 'Usuń ' + name(b), onclick: () => {
            state.own[i] = state.own[i].filter(x => x !== b); onChange();
          }}, '×')))));
      if(!sorted.length) box.append(el('p', {className: 'hint'}, 'Dodaj co najmniej jedną księgę.'));
    }
    host.append(box);
  }
}

function countLabel(n, total){
  const word = n === 1 ? 'księga' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 'księgi' : 'ksiąg';
  return total !== null && n < total ? `${n} z ${total} ksiąg (reszty brak w przekładzie)` : `${n} ${word}`;
}

/** Księgi czytania i, ograniczone do obecnych w przekładzie. */
export function booksOf(state, i, available){
  const key = state.cont[i];
  const list = key === 'own' ? state.own[i].slice().sort((a, b) => a - b) : CONTENT.find(c => c.id === key).books();
  return list.filter(b => available.has(b));
}
