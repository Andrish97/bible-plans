# Generator planu czytania Biblii

Aplikacja w przeglądarce do układania planów czytania Biblii: po kolei albo chronologicznie, w wybranym
polskim przekładzie, z eksportem do CSV i PDF (kilka szablonów wydruku).

Działa jako statyczna strona (GitHub Pages). Lokalnie potrzebny jest dowolny serwer HTTP, bo przeglądarka nie
wczyta modułów i plików JSON z `file://`:

```sh
python3 -m http.server 8000   # potem http://localhost:8000
```

## Struktura

```
index.html                 układ strony (bez logiki i danych)
assets/
  css/app.css              wygląd, motywy (systemowy, jasny, ciemny, sepia, wysoki kontrast)
  css/print.css            szablony wydruku / PDF
  favicon.svg, apple-touch-icon.png
js/
  main.js                  start aplikacji, ustawienia ↔ plan ↔ podgląd ↔ eksport
  data.js                  wczytywanie plików z data/ (z pamięcią podręczną)
  bible.js                 model przekładu: wersety, słowa, nagłówki, dopasowanie chronologii
  planner.js               podział ksiąg na dni (czysta logika, bez DOM)
  refs.js                  zapis odnośników (zestawy skrótów, rozdział:werset / rozdział,werset)
  settings.js              wartości domyślne, gotowe zestawy, zapamiętywanie w przeglądarce
  dom.js                   pomocniki DOM
  ui/                      listy rozwijane, kalendarz, motyw, pomoc „?”, czytania, podgląd
  export/                  csv.js, print.js (szablony PDF)
data/                      dane używane przez aplikację (generowane, patrz niżej)
sources/
  mybible/                 źródłowe moduły MySword (*.bbl.mybible, SQLite)
  headings/bw.json         granice nagłówków Biblii Warszawskiej
tools/                     skrypty konwersji i test kompletności
```

## Dane (`data/`)

| Plik | Zawartość |
|---|---|
| `books.json` | 66 ksiąg: id 1–66, kod OSIS, nazwa, zestawy skrótów (`pl` ekumeniczne, `bw` Biblii Warszawskiej, `name` pełne nazwy, `en` SBL, `osis`), grupy ksiąg |
| `translations.json` | spis przekładów: skrót, nazwa, zakres ksiąg, liczba wersetów, czy ma nagłówki |
| `translations/<id>/structure.json` | budowa przekładu: liczba słów w każdym wersecie (`null` = wersetu nie ma). Na tym liczony jest plan |
| `translations/<id>/headings.json` | początki sekcji (tylko przekłady z nagłówkami) |
| `translations/<id>/text/NN.json` | czysty tekst księgi NN: `{c, verses: [{v, t, h?, n?}]}`; `t` tekst (wiersze poezji rozdzielone `\n`), `h` nagłówki przed wersetem, `n` przypisy `{m: znacznik, t: treść}` |
| `chronology.json` | uniwersalna kolejność chronologiczna (1749 pasaży) + liczba wersetów w rozdziałach numeracji, w której ją zapisano |

Zapis zakresów w chronologii i nagłówkach: kod OSIS + `rozdział[:werset][-[rozdział:]werset|end]`,
np. `Gen 1`, `Gen 1-3`, `1Chr 1:1-4`, `Gen 1:20-2:3`, `Gen 1:20-end`.

### Przekłady

| id | Przekład | Księgi | Nagłówki |
|---|---|---|---|
| `bw` | Biblia Warszawska | 66 | tak – nagłówki wydania BW (`sources/headings/bw.json`) |
| `snp` | Stare i Nowe Przymierze (EIB) | 66 | tak – z przekładu dosłownego SNP |
| `snpd` | SNP – przekład dosłowny | 66 | tak – własne (≈2700) |
| `ubg` | Uwspółcześniona Biblia Gdańska | 66 | nie (tylko tytuły psalmów) |
| `nbg` | Nowa Biblia Gdańska | 66 | nie |
| `tnp` | Przekład Toruński | 47 (NT, mądrościowe, Megilot, prorocy mniejsi) | nie (tylko tytuły psalmów) |

Opcja „Zaczynaj dzień od nagłówka sekcji” jest dostępna tylko w przekładach z nagłówkami. Konwerter sam
wykrywa nagłówki w module (`<TS>` poza Psalmami), więc moduł z nagłówkami dla innego przekładu wystarczy
wrzucić do `sources/mybible/` i dopisać w `TRANSLATIONS` w `tools/convert_mybible.py`.

### Różnice wersyfikacji a chronologia

Przekłady różnią się numeracją (np. Lb 16/17, 1 Krn 5/6, Jl 2/3, Ml 3/4, tytuły psalmów). Chronologia jest
zapisana raz, w jednej numeracji, a aplikacja przelicza ją na wybrany przekład (`Translation.mapChronology`):

1. W odcinkach księgi, w których oba przekłady mają tyle samo wersetów, werset liczony jest po kolejnym
   numerze w księdze – przesunięta granica rozdziału trafia we właściwe miejsce.
2. Gdzie sumy się nie zgadzają (np. numeracja tytułów psalmów), zostaje rozdział:werset bez zmian.
3. Werset, którego nie objął żaden zakres, dołącza do pasażu sąsiedniego wersetu; powtórzony zostaje w pierwszym.

`node tools/check.mjs` sprawdza dla każdego przekładu i kilku ustawień, że plan zawiera każdy werset
dokładnie raz.

### Uwagi o modułach źródłowych

- **BW**: moduł nie zawiera części wersetów numeracji hebrajskiej (m.in. Lb 17:14-28, Lb 30:17, 1 Krn 5:27-41,
  1 Krn 12:41, Ez 21:33-37), a w ich miejscu ma zaślepki `- - -`. Zaślepki są pomijane. Odnośniki w planie
  pozostają poprawne (np. „Lb 17” to cały rozdział), tylko liczba słów w tych dniach jest nieco zaniżona.
- **SNPD**: wiersz bez numeru w 2 Krl 15 to duplikat wersetu 27 – usuwany przy konwersji.
- **SNP**: brak Dz 24:7 (tak jest w przekładzie).

## Narzędzia

```sh
python3 tools/convert_mybible.py        # sources/mybible/*.mybible -> data/translations/
node tools/check.mjs                    # test kompletności planów
python3 tools/extract_legacy.py OLD.html  # jednorazowo: chronologia i nagłówki BW z dawnego index.html
```
