// Okienka pomocy przy przyciskach „?” (atrybut data-h wskazuje tekst).
import {placeFixed} from '../dom.js';

export const HELP = {
  przeklad: 'Plan liczony jest na rzeczywistej budowie wybranego przekładu: jego rozdziałach, wersetach i liczbie słów. Przekłady różnią się numeracją wersetów w kilku miejscach (np. Lb 16–17, Jl 2–3, Ml 3–4), dlatego plan może się minimalnie różnić. Przekład Toruński zawiera tylko część Starego Testamentu – brakujące księgi są pomijane.',
  zapis: 'Nazwy ksiąg: skróty ekumeniczne (Rdz, Mt), skróty z Biblii Warszawskiej (1 Mojż, Mat), pełne nazwy, skróty angielskie albo kody OSIS. Rozdział i werset: dwukropek (Ps 23:1,4), zapis polski z przecinkiem i kropką między wersetami (Ps 23,1.4) albo kropka (Ps 23.1,4). Nazwa księgi pojawia się w dniu tylko raz.',
  czytania: 'Ile czytań dziennie i co zawiera każde z nich. Każde czytanie to osobna lista ksiąg, rozłożona na te same dni. „Własny” pozwala złożyć czytanie z dowolnych ksiąg.',
  kolejnosc: 'Po kolei: księgi w kolejności kanonicznej (Hiob po pozostałych mądrościowych). Chronologicznie: fragmenty w kolejności wydarzeń. Chronologia jest dopasowywana do wersyfikacji przekładu – każdy werset trafia do planu dokładnie raz. Dostępna przy jednym czytaniu (cała Biblia, Stary albo Nowy Testament) albo dwóch (Stary i Nowy Testament).',
  nie_laczy: 'Odznaczone: dzień może zawierać końcówkę jednej księgi i początek następnej. Tryb miękki: unika takich dni, o ile nie psuje to równego podziału. Tryb twardy: dzień to fragment jednej księgi albo kilka całych krótkich ksiąg. Tylko przy kolejności „po kolei”.',
  podzial: 'Po długości tekstu: dni wyrównane liczbą słów w wybranym przekładzie. Po wersetach: liczbą wersetów. Po rozdziałach: liczbą rozdziałów (dni nigdy nie dzielą rozdziału).',
  nie_dziel: 'Dzień kończy się na granicy rozdziału, o ile nie psuje to równego podziału. Krótkich rozdziałów (do 30 wersetów) nie dzielimy wcale, a przy cięciu nigdy nie zostaje kawałek 1–3 wersetów.',
  naglowki: 'Dzień zaczyna się od nagłówka sekcji, o ile nie rozjeżdża to za bardzo równego podziału. Dostępne tylko w przekładach z nagłówkami (BW, SNP, SNPD).',
  kalendarz: 'Data startu to pierwszy dzień planu. Liczba dni (1–800) to długość planu w dniach kalendarzowych.',
  dni: 'Dni tygodnia, w które są czytania. Np. Pn–Pt zostawia weekend jako bufor na nadrabianie.',
  eksport: 'Szablon PDF określa wygląd wydruku. „Drukuj / PDF” otwiera okno drukowania – wybierz „Zapisz jako PDF”. CSV zawiera jeden wiersz na dzień. Rozdzielnik oddziela czytania w komórce CSV i różne księgi w jednym czytaniu. Własny rozdzielnik: 1–5 znaków spośród spacji i | ; / + - · • * # ~ _ & ^.',
};

export function initHelp(pop){
  let cur = null;
  const close = () => { if(cur) cur.setAttribute('aria-expanded', 'false'); cur = null; pop.hidden = true; };
  document.addEventListener('click', e => {
    const b = e.target.closest('.qb');
    if(b){
      e.preventDefault(); e.stopPropagation();
      if(cur === b){ close(); return; }
      close();
      cur = b; pop.textContent = HELP[b.dataset.h] || ''; pop.hidden = false;
      b.setAttribute('aria-expanded', 'true'); placeFixed(pop, b, 280);
      return;
    }
    if(!pop.hidden && !e.target.closest('#helpPop')) close();
  }, true);
  document.addEventListener('keydown', e => { if(e.key === 'Escape') close(); });
  addEventListener('scroll', e => { if(!pop.hidden && !pop.contains(e.target)) close(); }, true);
  addEventListener('resize', close);
}
