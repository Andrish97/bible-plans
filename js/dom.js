// Drobne pomocniki DOM wspólne dla modułów interfejsu.

export const $ = id => document.getElementById(id);

/** el('div', {className: 'x', onclick: fn}, 'tekst', dziecko, …) */
export function el(tag, props, ...children){
  const n = document.createElement(tag);
  if(props) for(const [k, v] of Object.entries(props)){
    if(v === undefined || v === null || v === false) continue;
    if(k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if(k === 'dataset') Object.assign(n.dataset, v);
    else if(k in n && k !== 'list') n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for(const c of children.flat()) if(c !== null && c !== undefined && c !== false) n.append(c);
  return n;
}

/** Ustawia pływający element (lista, okienko) pod kotwicą, a gdy brak miejsca – nad nią. */
export function placeFixed(node, anchor, width){
  const r = anchor.getBoundingClientRect();
  const w = width || r.width;
  node.style.position = 'fixed';
  node.style.width = w + 'px';
  node.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
  node.style.right = 'auto';
  node.style.top = (r.bottom + 4) + 'px';
  const h = node.offsetHeight;
  if(r.bottom + 4 + h > innerHeight - 8) node.style.top = Math.max(8, r.top - 4 - h) + 'px';
}

export const pad2 = n => String(n).padStart(2, '0');
export const isoDate = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
