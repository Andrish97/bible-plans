// Przełącznik motywu: jeden przycisk z ikoną aktualnego motywu i menu rozwijane.
const KEY = 'plan-motyw';

const ICONS = {
  auto: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/></svg>',
  light: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
  sepia: '<svg viewBox="0 0 24 24"><path d="M12 6.5C9.5 4.8 6.5 4.3 3.5 4.8v13.5c3-.5 6 0 8.5 1.7 2.5-1.7 5.5-2.2 8.5-1.7V4.8c-3-.5-6 0-8.5 1.7zM12 6.5v13.5"/></svg>',
  contrast: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7a5 5 0 0 1 0 10z" fill="currentColor" stroke="none"/><path d="M12 7a5 5 0 0 0 0 10"/></svg>',
};
export const THEMES = [
  {id: 'auto', label: 'Systemowy'},
  {id: 'light', label: 'Jasny'},
  {id: 'dark', label: 'Ciemny'},
  {id: 'sepia', label: 'Sepia'},
  {id: 'contrast', label: 'Wysoki kontrast'},
];

export function initTheme(btn, menu){
  const root = document.documentElement;
  let current = 'auto';
  try{ current = localStorage.getItem(KEY) || 'auto'; }catch(e){}
  if(!THEMES.some(t => t.id === current)) current = 'auto';

  menu.innerHTML = THEMES.map(t =>
    `<li role="menuitemradio" tabindex="-1" data-theme="${t.id}" aria-checked="false">${ICONS[t.id]}<span>${t.label}</span><span class="chk">✓</span></li>`).join('');
  const items = [...menu.children];

  function apply(id){
    current = id;
    if(id === 'auto') delete root.dataset.theme; else root.dataset.theme = id;
    const t = THEMES.find(x => x.id === id);
    btn.innerHTML = ICONS[id];
    btn.title = btn.ariaLabel = `Motyw: ${t.label}`;
    items.forEach(li => li.setAttribute('aria-checked', String(li.dataset.theme === id)));
    const meta = document.querySelector('meta[name=theme-color]');
    if(meta) meta.content = getComputedStyle(root).getPropertyValue('--card').trim() || '#7a2e1d';
  }
  const open = () => {
    menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
    const li = items.find(x => x.dataset.theme === current); li?.focus(); items.forEach(x => x.classList.toggle('act', x === li));
  };
  const close = (focus) => { if(menu.hidden) return; menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); if(focus) btn.focus(); };
  const choose = id => { apply(id); try{ localStorage.setItem(KEY, id); }catch(e){} close(true); };

  btn.addEventListener('click', e => { e.stopPropagation(); menu.hidden ? open() : close(); });
  btn.addEventListener('keydown', e => { if(e.key === 'ArrowDown'){ e.preventDefault(); open(); } });
  menu.addEventListener('click', e => { const li = e.target.closest('li'); if(li) choose(li.dataset.theme); });
  menu.addEventListener('keydown', e => {
    const i = items.indexOf(document.activeElement);
    if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      e.preventDefault();
      const n = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
      n.focus(); items.forEach(x => x.classList.toggle('act', x === n));
    } else if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); if(i >= 0) choose(items[i].dataset.theme); }
    else if(e.key === 'Escape' || e.key === 'Tab') close(true);
  });
  document.addEventListener('click', e => { if(!e.target.closest('#theme')) close(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => apply(current));
  apply(current);
}
