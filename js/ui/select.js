// Własne listy rozwijane w kolorach motywu. Ukryty <select> zostaje źródłem prawdy:
// ten sam id, ta sama wartość i to samo zdarzenie 'change'. Obsługuje <optgroup> i opis opcji (data-desc).
import {placeFixed} from '../dom.js';

const protoDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
const wrappers = new Set();

function build(sel){
  sel.classList.add('native');
  sel.dataset.ready = '1';
  const wrap = document.createElement('div'); wrap.className = 'dd';
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'dd-btn';
  btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
  const label = sel.getAttribute('aria-label') || sel.closest('fieldset,.field,div')?.querySelector('.lab,legend')?.textContent?.replace('?', '').trim();
  if(label) btn.setAttribute('aria-label', label);
  const lbl = document.createElement('span'); lbl.className = 'lbl';
  const car = document.createElement('span'); car.className = 'car';
  btn.append(lbl, car);
  const list = document.createElement('ul'); list.className = 'dd-list'; list.setAttribute('role', 'listbox'); list.hidden = true;
  wrap.append(btn);
  document.body.append(list);
  sel.parentNode.insertBefore(wrap, sel);
  const st = {sel, wrap, btn, list, act: -1};

  const sync = () => {
    const o = sel.options[sel.selectedIndex];
    lbl.textContent = o ? o.textContent : '';
    list.querySelectorAll('li[data-i]').forEach(li => {
      const opt = sel.options[+li.dataset.i];
      li.setAttribute('aria-selected', String(+li.dataset.i === sel.selectedIndex));
      li.classList.toggle('dis', !!opt?.disabled);
      li.setAttribute('aria-disabled', String(!!opt?.disabled));
    });
  };
  const rebuild = () => {
    list.innerHTML = '';
    let i = 0;
    for(const node of sel.children){
      const opts = node.tagName === 'OPTGROUP' ? [...node.children] : [node];
      if(node.tagName === 'OPTGROUP'){ const g = document.createElement('li'); g.className = 'grp'; g.textContent = node.label; list.append(g); }
      for(const opt of opts){
        const li = document.createElement('li');
        li.setAttribute('role', 'option'); li.dataset.i = i++;
        li.textContent = opt.textContent;
        if(opt.dataset.desc){ const s = document.createElement('small'); s.textContent = opt.dataset.desc; li.append(s); }
        list.append(li);
      }
    }
    sync();
  };
  const items = () => [...list.querySelectorAll('li[data-i]')];
  const highlight = () => items().forEach(li => li.classList.toggle('act', +li.dataset.i === st.act));
  const onScroll = e => { if(!list.contains(e.target)) close(); };
  const close = () => {
    if(list.hidden) return;
    wrap.classList.remove('open'); list.hidden = true; btn.setAttribute('aria-expanded', 'false');
    removeEventListener('scroll', onScroll, true); removeEventListener('resize', close);
  };
  const open = () => {
    wrappers.forEach(w => { if(w !== st) w.close(); });
    rebuild();
    wrap.classList.add('open'); list.hidden = false; btn.setAttribute('aria-expanded', 'true');
    st.act = sel.selectedIndex; highlight();
    placeFixed(list, btn, Math.max(btn.offsetWidth, 180));
    list.querySelector('li.act')?.scrollIntoView({block: 'nearest'});
    addEventListener('scroll', onScroll, true); addEventListener('resize', close);
  };
  const choose = i => {
    const opt = sel.options[i];
    if(!opt || opt.disabled) return;
    protoDesc.set.call(sel, opt.value);
    sync();
    sel.dispatchEvent(new Event('change', {bubbles: true}));
    close(); btn.focus();
  };
  Object.assign(st, {sync, rebuild, close});
  wrappers.add(st);
  rebuild();

  // wartość ustawiana z kodu także odświeża widok
  Object.defineProperty(sel, 'value', {configurable: true,
    get(){ return protoDesc.get.call(this); },
    set(v){ protoDesc.set.call(this, v); sync(); }});
  // zmiana opcji lub ich dostępności (disabled) odświeża listę
  new MutationObserver(rebuild).observe(sel, {childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'label']});

  btn.addEventListener('click', () => list.hidden ? open() : close());
  list.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if(li) choose(+li.dataset.i); });
  list.addEventListener('mousemove', e => { const li = e.target.closest('li[data-i]'); if(li){ st.act = +li.dataset.i; highlight(); } });
  btn.addEventListener('keydown', e => {
    if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      e.preventDefault(); if(list.hidden) open();
      const n = sel.options.length; let i = st.act;
      do { i = (i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; } while(sel.options[i].disabled && i !== st.act);
      st.act = i; highlight();
      list.querySelector('li.act')?.scrollIntoView({block: 'nearest'});
    } else if(e.key === 'Enter' || e.key === ' '){
      if(!list.hidden && st.act >= 0){ e.preventDefault(); choose(st.act); }
    } else if(e.key === 'Escape' || e.key === 'Tab') close();
  });
}

/** Zamienia wszystkie <select> (także dodane później) na własne listy. */
export function enhanceSelects(){
  const scan = () => {
    document.querySelectorAll('select:not([data-ready])').forEach(build);
    // usunięte z dokumentu selecty: sprzątamy ich listy
    wrappers.forEach(w => { if(!w.sel.isConnected){ w.list.remove(); wrappers.delete(w); } });
  };
  scan();
  new MutationObserver(scan).observe(document.body, {childList: true, subtree: true});
  document.addEventListener('click', e => { wrappers.forEach(w => { if(!w.wrap.contains(e.target) && !w.list.contains(e.target)) w.close(); }); });
}
