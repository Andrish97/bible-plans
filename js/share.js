// Link do planu: ustawienia zakodowane w adresie (?plan=…), tylko wartości różne od domyślnych.

const b64url = {
  enc: str => btoa(String.fromCharCode(...new TextEncoder().encode(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))),
};

/**
 * @param {{controls: object, days: number[], readings: object}} state
 * @param {{controls: object, days: number[], readings: object}} defaults
 */
export function encodePlan(state, defaults){
  const c = {};
  for(const [k, v] of Object.entries(state.controls)) if(defaults.controls[k] !== v) c[k] = v;
  const data = {v: 1, c};
  if(state.days.join() !== defaults.days.join()) data.d = state.days;
  const r = state.readings;
  data.r = {n: r.n, c: r.cont.slice(0, r.n)};
  if(r.cont.slice(0, r.n).includes('own')) data.r.o = r.own.slice(0, r.n);
  return b64url.enc(JSON.stringify(data));
}

/** -> {controls, days?, readings} albo null, gdy link jest uszkodzony. */
export function decodePlan(s){
  try{
    const data = JSON.parse(b64url.dec(s));
    if(data.v !== 1 || typeof data.c !== 'object') return null;
    const readings = data.r ? {n: data.r.n, cont: data.r.c, own: data.r.o} : null;
    return {controls: data.c, days: data.d || null, readings};
  }catch(e){ return null; }
}

/** Adres strony z zakodowanym planem. */
export function planUrl(code){
  const u = new URL(location.href);
  u.hash = '';
  u.search = '?plan=' + code;
  return u.toString();
}
