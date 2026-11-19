# Generator planu czytania Biblii

Aplikacja w przeglądarce do układania planów czytania Biblii: po kolei albo chronologicznie, w wybranym
polskim przekładzie, z eksportem do CSV i PDF (kilka szablonów wydruku).

Funkcje: plan po kolei lub chronologicznie w wybranym przekładzie, eksport do PDF (5 szablonów), CSV
i kalendarza (.ics z przypomnieniem), link do planu (`?plan=…`, przycisk „Udostępnij”), instalacja jako
aplikacja i działanie bez internetu (service worker `sw.js`).

Działa jako statyczna strona (GitHub Pages). Lokalnie potrzebny jest dowolny serwer HTTP, bo przeglądarka nie
wczyta modułów i plików JSON z `file://`:

```sh
python3 -m http.server 8000   # potem http://localhost:8000
```

## Struktura

```
index.html                 układ strony (bez logiki i danych)
assets/                    style (app.css, print.css), ikony
js/
  main.js                  start aplikacji, ustawienia ↔ plan ↔ podgląd ↔ eksport
  data.js                  wczytywanie plików z data/ (z pamięcią podręczną)
  bible.js                 model przekładu: wersety, słowa, mapa numeracji, nagłówki, chronologia
  planner.js               podział ksiąg na dni (czysta logika, bez DOM)
  refs.js                  zapis odnośników (zestawy skrótów, rozdział:werset / rozdział,werset)
  settings.js, share.js    ustawienia, gotowe zestawy, link do planu
  ui/, export/             interfejs; eksport CSV, PDF, kalendarz (.ics)
data/                      dane aplikacji – same odnośniki i liczby, bez tekstu przekładów
sources/versification/     numeracja wzorca i angielska (org.vrs, eng.vrs – SIL libpalaso, licencja MIT)
tools/                     konwersja modułów, budowa map, testy
sw.js, manifest.webmanifest  działanie bez internetu, instalacja
```

W repozytorium **nie ma tekstu Biblii**. Aplikacja potrzebuje tylko numerów wersetów, liczby słów
i pozycji nagłówków. Moduły źródłowe (`sources/mybible/*.mybible`) i wyciągnięty z nich tekst (`.cache/`)
są tylko lokalnie i ignorowane przez git.

## Dane (`data/`)

| Plik | Zawartość |
|---|---|
| `books.json` | 66 ksiąg: id 1–66, kod OSIS, nazwa, zestawy skrótów (`pl` ekumeniczne, `bw` Biblii Warszawskiej, `name` pełne nazwy, `en` SBL, `osis`), grupy ksiąg |
| `translations.json` | spis przekładów: skrót, nazwa, zakres ksiąg, liczba wersetów, zestaw nagłówków |
| `translations/<id>/structure.json` | budowa przekładu: liczba słów w każdym wersecie (`null` = wersetu nie ma). Na tym liczony jest plan |
| `versification/org.json` | **wzorzec**: numeracja oryginału (Biblia Hebrajska dla ST, wydania greckie dla NT) – liczba wersetów w rozdziałach |
| `versification/<id>.json` | **mapa** numeracji przekładu na wzorzec |
| `chronology.json` | chronologia historiami: 270 wątków, 1935 historii, każdy werset wzorca dokładnie raz (numeracja wzorca) |
| `headings/<zestaw>.json` | początki sekcji w numeracji wzorca (bez tytułów): `bw` (wydanie BW), `snpd` (SNP dosłowny) |

### Mapa numeracji

Każdy przekład ma jedną stałą mapę na wzorzec – jak w programach do dopasowywania tłumaczeń:

```jsonc
"links": [
  ["Gen 32:1", "Gen 31:55"],                  // przesunięcie przez granicę rozdziału
  ["Deut 5:17-20", "Deut 5:17"],              // 4 wersety wzorca = 1 werset NBG
  ["Isa 63:19", "Isa 63:19-64:1"],            // 1 werset wzorca = 2 wersety przekładu
  ["Ps 108:14", "Ps 109:1"]                   // werset w innym miejscu
],
"missing": ["Acts 24:7"],                     // wersety wzorca, których przekład nie ma
"extra":   ["Neh 7:68"]                       // wersety przekładu bez odpowiednika we wzorcu
```

Wszystko, czego w mapie nie ma, to ten sam numer we wzorcu i w przekładzie. Chronologia i nagłówki są zapisane
raz, we wzorcu, a aplikacja przenosi je na wybrany przekład wyłącznie przez mapę – bez zgadywania.
`node tools/check.mjs` sprawdza spójność map (żaden werset dwa razy, wszystkie istnieją) i to, że plan zawiera
każdy werset przekładu dokładnie raz.

Mapy zbudowano raz (`tools/build_versification.py`): znane połączenia numeracji angielskiej z oryginałem
(`eng.vrs`), dopasowanie każdego przekładu po treści do wzorca, a wszystkie miejsca niezgodne z `eng.vrs`
przeczytane i rozstrzygnięte ręcznie (`MANUAL` w tym pliku).

### Przekłady

| id | Przekład | Księgi | Nagłówki | Numeracja |
|---|---|---|---|---|
| `bw` | Biblia Warszawska | 66 | tak – wydanie BW | mieszana (angielska + hebrajska), braki modułu – patrz niżej |
| `snp` | Stare i Nowe Przymierze (EIB) | 66 | tak – z SNP dosłownego | wzorzec, w 8 księgach angielska |
| `snpd` | SNP – przekład dosłowny | 66 | tak – własne | wzorzec, w 8 księgach angielska |
| `ubg` | Uwspółcześniona Biblia Gdańska | 66 | nie | angielska |
| `nbg` | Nowa Biblia Gdańska | 66 | nie | mieszana, kilka połączonych/podzielonych wersetów |
| `tnp` | Przekład Toruński | 47 (NT, mądrościowe, Megilot, prorocy mniejsi) | nie | angielska |

Opcja „Zaczynaj dzień od nagłówka sekcji” jest dostępna tylko w przekładach z nagłówkami.

### Chronologia historiami

`data/chronology.json` to ciąg **wątków**, a w każdym **historie**. Historia to jedno wydarzenie razem z relacjami
równoległymi (np. Samuel–Kroniki, cztery Ewangelie) albo jedna całość tekstu (psalm, mowa, rozdział listu).
Plan chronologiczny kończy dzień najchętniej między wątkami, potem między historiami, a wewnątrz historii tylko
w ostateczności. W planie „po kolei” opcja „Nie dziel historii” używa tych samych historii.

Historie są zapisane raz, we wzorcu, i trafiają na każdy przekład przez jego mapę numeracji (`Translation.mapChronology`):
każdy werset przekładu należy do dokładnie jednej historii (sprawdza `tools/check.mjs`).

Kolejność pochodzi z planu *The One Year Chronological Bible* (Tyndale, `sources/chronology/tyndale_plan.json`),
a historie i zmiany są decyzjami po przeczytaniu tekstu (`sources/chronology/decisions.json`, z powodem każdej zmiany
i zasadami: proroctwo stoi tam, gdzie zostało wypowiedziane; psalm przy historii, z którą łączy go tytuł albo treść;
list tam, gdzie został napisany).

### Uwagi o modułach źródłowych

- **BW**: moduł nie ma 44 wersetów wzorca (m.in. Lb 17:14-28, Pwt 28:69, 1 Krn 5:27-41, Ez 21:33-37, Pnp 7:14),
  w ich miejscu ma zaślepki `- - -`. W mapie są jako `missing`. Odnośniki w planie pozostają poprawne
  (np. „Lb 17” to cały rozdział), tylko liczba słów w tych dniach jest nieco zaniżona.
- **SNPD**: wiersz bez numeru w 2 Krl 15 to duplikat wersetu 27 – usuwany przy konwersji.
- **SNP**: brak Dz 24:7 (tak jest w przekładzie).
- **NBG**: Ps 109:1 to treściowo Ps 108:14; Pwt 5:17 obejmuje cztery przykazania (wzorzec 5:17-20).

## Narzędzia

```sh
node tools/check.mjs                      # spójność map i kompletność planów
node tools/check_sw.mjs                   # czy sw.js zapisuje offline wszystkie pliki aplikacji

# tylko przy nowym albo poprawionym module (wymaga sources/mybible/*.mybible lokalnie):
python3 tools/convert_mybible.py          # moduły -> data/translations/ (+ tekst lokalnie w .cache/)
python3 tools/build_versification.py      # mapy -> data/versification/, nagłówki -> data/headings/;
                                          # raport do przeczytania: .cache/versification_report.txt

# chronologia: historie (sources/chronology/stories.json) + decyzje -> data/chronology.json
python3 tools/chronology/apply_decisions.py
```

Testy (`check.mjs`, `check_sw.mjs` i kontrolę, że w repozytorium nie ma tekstu) uruchamia GitHub Actions
(`.github/workflows/check.yml`) przy każdym wypchnięciu zmian.

Po zmianie listy plików aplikacji dopisz je do `SHELL` w `sw.js` i podnieś `VERSION`.
