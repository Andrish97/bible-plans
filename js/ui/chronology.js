// Okno „Uzasadnienie kolejności chronologicznej”: wątki i historie planu chronologicznego
// w zapisie wybranego przekładu, z zasadami i powodami zmian kolejności.

const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

/**
 * @param {HTMLElement} body   kontener treści okna
 * @param {object} chron       tr.chronology (mapChronology)
 * @param {string[]} rules     zasady z data/chronology.json
 * @param {import('../refs.js').RefFormatter} f
 * @param {string} trName      nazwa przekładu
 */
export function renderChronology(body, chron, rules, f, trName){
  const withNotes = chron.stories.filter(s => s.note).length;
  const parts = [];
  parts.push(`<p class="cx-lead">Plan chronologiczny to ciąg <b>${chron.threads.length} wątków</b>, a w nich <b>${chron.stories.length} historii</b>.
    Historia to jedno wydarzenie razem z jego relacjami równoległymi albo jedna całość tekstu (psalm, mowa proroka, część listu).
    Wątek to kilka historii, które czyta się razem. Dzień planu kończy się najchętniej między wątkami, potem między historiami,
    a w środku historii tylko w ostateczności. Każdy werset jest w planie dokładnie raz.</p>`);
  parts.push(`<p class="cx-lead">Odnośniki w numeracji przekładu: ${esc(trName)}. ${withNotes} historii ma opisany powód swojego miejsca.</p>`);
  parts.push(`<h3>Zasady</h3><ol class="cx-rules">${rules.map(r => `<li>${esc(r)}</li>`).join('')}</ol>`);
  parts.push(`<div class="cx-tools"><input type="search" id="cxFind" placeholder="Szukaj: nazwa wątku albo księga i rozdział, np. Iz 1 lub Ps 51" aria-label="Szukaj w chronologii">
    <label class="check"><input type="checkbox" id="cxNotes"> Tylko historie z opisanym powodem</label>
    <button type="button" class="pill" id="cxAll">Rozwiń wszystko</button><button type="button" class="pill" id="cxNone">Zwiń</button></div>`);
  const th = chron.threads.map((t, n) => {
    const sts = chron.stories.slice(t.first, t.first + t.count).filter(s => s.units.length);
    const items = sts.map(s => {
      const books = new Set(s.units.map(u => u[0]));
      const text = f.seqText(s.units);
      const tags = books.size > 1 ? '<span class="cx-tag">relacje równoległe</span>' : '';
      const note = s.note ? s.note.map(x => `<p class="cx-note">${esc(x)}</p>`).join('') : '';
      return `<li data-q="${esc(text.toLowerCase())}"${s.note ? ' data-note="1"' : ''}><div class="cx-ref">${esc(text)}${tags}</div>${note}</li>`;
    }).join('');
    const nNotes = sts.filter(s => s.note).length;
    return `<details class="cx-th" data-q="${esc(t.name.toLowerCase())}"><summary><span class="cx-n">${n + 1}</span><span class="cx-name">${esc(t.name)}</span>`
      + `<span class="cx-meta">${sts.length} hist.${nNotes ? ` · ${nNotes} z powodem` : ''}</span></summary><ol>${items}</ol></details>`;
  });
  parts.push(`<div class="cx-list">${th.join('')}</div><p class="cx-empty" hidden>Nic nie znaleziono.</p>`);
  body.innerHTML = parts.join('');

  const find = body.querySelector('#cxFind'), onlyNotes = body.querySelector('#cxNotes');
  const filter = () => {
    const q = find.value.trim().toLowerCase(), notes = onlyNotes.checked;
    let any = false;
    body.querySelectorAll('.cx-th').forEach(d => {
      const nameHit = q && d.dataset.q.includes(q);
      let shown = 0;
      d.querySelectorAll('li').forEach(li => {
        const ok = (!q || nameHit || li.dataset.q.includes(q)) && (!notes || li.dataset.note);
        li.hidden = !ok; if(ok) shown++;
      });
      d.hidden = !shown; if(shown) any = true;
      d.open = !!shown && (!!q || notes);
    });
    body.querySelector('.cx-empty').hidden = any;
  };
  find.addEventListener('input', filter);
  onlyNotes.addEventListener('change', filter);
  body.querySelector('#cxAll').addEventListener('click', () => body.querySelectorAll('.cx-th:not([hidden])').forEach(d => d.open = true));
  body.querySelector('#cxNone').addEventListener('click', () => body.querySelectorAll('.cx-th').forEach(d => d.open = false));
}
