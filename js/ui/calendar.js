// Własny kalendarz wyboru daty startu (wartość w polu tekstowym jako RRRR-MM-DD).
import {placeFixed, pad2} from '../dom.js';

const MONTHS = ['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];
const DOW = ['Pn','Wt','Śr','Cz','Pt','So','Nd'];

export function parseDate(s){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s || '').trim());
  if(!m) return null;
  const y = +m[1], mo = +m[2] - 1, d = +m[3];
  const dt = new Date(y, mo, d);
  return dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === d ? {y, m: mo, d} : null;
}

export function initCalendar(inp, btn, pop){
  const fmt = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
  const today = () => { const t = new Date(); return {y: t.getFullYear(), m: t.getMonth(), d: t.getDate()}; };
  let view = parseDate(inp.value) || today();
  const anchor = inp.parentElement;

  function render(){
    const sel = parseDate(inp.value), t = today();
    const lead = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
    const days = new Date(view.y, view.m + 1, 0).getDate();
    let html = `<div class="cal-head"><button type="button" class="cal-nav" data-nav="-1" aria-label="Poprzedni miesiąc">‹</button><span class="cal-title">${MONTHS[view.m]} ${view.y}</span><button type="button" class="cal-nav" data-nav="1" aria-label="Następny miesiąc">›</button></div><div class="cal-grid">`;
    html += DOW.map(x => `<div class="cal-dow">${x}</div>`).join('');
    for(let i = 0; i < lead; i++) html += `<span class="cal-day blank"></span>`;
    for(let d = 1; d <= days; d++){
      const cls = ['cal-day'];
      if(sel && sel.y === view.y && sel.m === view.m && sel.d === d) cls.push('sel');
      if(t.y === view.y && t.m === view.m && t.d === d) cls.push('today');
      html += `<button type="button" class="${cls.join(' ')}" data-d="${d}">${d}</button>`;
    }
    html += `</div><div class="cal-foot"><button type="button" data-today="1">Dziś</button><button type="button" data-next-year="1">1 stycznia</button><button type="button" data-close="1">Zamknij</button></div>`;
    pop.innerHTML = html;
  }
  const open = () => { view = parseDate(inp.value) || view; render(); pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); placeFixed(pop, anchor, 272); };
  const close = () => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  function setDate(y, m, d){
    inp.value = fmt(y, m, d);
    view = {y, m, d};
    inp.dispatchEvent(new Event('change', {bubbles: true}));
  }
  addEventListener('scroll', e => { if(!pop.hidden && !pop.contains(e.target)) close(); }, true);
  addEventListener('resize', () => { if(!pop.hidden) placeFixed(pop, anchor, 272); });
  btn.addEventListener('click', e => { e.stopPropagation(); pop.hidden ? open() : close(); });
  pop.addEventListener('click', e => {
    e.stopPropagation();
    const nav = e.target.closest('[data-nav]');
    if(nav){ let m = view.m + +nav.dataset.nav, y = view.y; if(m < 0){ m = 11; y--; } if(m > 11){ m = 0; y++; } view = {y, m, d: 1}; render(); return; }
    const day = e.target.closest('[data-d]');
    if(day){ setDate(view.y, view.m, +day.dataset.d); close(); btn.focus(); return; }
    if(e.target.closest('[data-today]')){ const t = today(); setDate(t.y, t.m, t.d); close(); btn.focus(); return; }
    if(e.target.closest('[data-next-year]')){ const y = today().y + (today().m === 0 && today().d === 1 ? 0 : 1); setDate(y, 0, 1); close(); btn.focus(); return; }
    if(e.target.closest('[data-close]')){ close(); btn.focus(); }
  });
  inp.addEventListener('input', () => { const p = parseDate(inp.value); if(p) view = p; if(!pop.hidden) render(); if(p) inp.dispatchEvent(new Event('change', {bubbles: true})); });
  inp.addEventListener('keydown', e => { if(e.key === 'ArrowDown'){ e.preventDefault(); open(); } if(e.key === 'Escape') close(); });
  document.addEventListener('click', e => { if(!pop.hidden && !e.target.closest('.cal')) close(); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape') close(); });
}
