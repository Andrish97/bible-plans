#!/usr/bin/env python3
"""Konwersja modułów MySword (*.bbl.mybible, SQLite) do plików JSON używanych przez aplikację.

Do repozytorium trafiają wyłącznie odnośniki i liczby – bez tekstu przekładów (prawa autorskie).
Dla każdego przekładu powstaje katalog data/translations/<id>/:

  structure.json      – budowa przekładu: księgi, rozdziały, liczba słów w każdym wersecie
                        (null = werset, którego w tym przekładzie nie ma). Na tym liczony jest plan.

oraz wspólny spis data/translations.json.

Lokalnie (.cache/, ignorowane przez git) zapisywany jest czysty tekst i nagłówki modułu w jego numeracji –
z nich tools/build_versification.py raz buduje mapy numeracji (data/versification/) i nagłówki
we wzorcu (data/headings/). Moduły źródłowe w sources/mybible/ też nie są w repozytorium.

Użycie:  python3 tools/convert_mybible.py
"""
import glob
import html
import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "sources/mybible"
OUT = ROOT / "data/translations"
CACHE = ROOT / ".cache/text"
BOOKS = json.loads((ROOT / "data/books.json").read_text(encoding="utf-8"))["books"]
OSIS = {b["id"]: b["osis"] for b in BOOKS}
OSIS_ID = {b["osis"]: b["id"] for b in BOOKS}

# Kolejność na liście w aplikacji. 'headings': który zestaw nagłówków (data/headings/<zestaw>.json,
# zapisany w numeracji wzorca) ma przekład; None = bez nagłówków.
TRANSLATIONS = [
    dict(id="bw", glob="PBW_*", short="BW", name="Biblia Warszawska",
         headings="bw", headings_note="nagłówki wydania BW"),
    dict(id="snp", glob="SNP_SJ*", short="SNP", name="Stare i Nowe Przymierze (EIB)",
         headings="snpd", headings_note="nagłówki z przekładu dosłownego SNP"),
    dict(id="snpd", glob="SNPD4_*", short="SNPD", name="Stare i Nowe Przymierze – przekład dosłowny",
         headings="snpd", headings_note="nagłówki przekładu"),
    dict(id="ubg", glob="PUBG_*", short="UBG", name="Uwspółcześniona Biblia Gdańska", headings=None),
    dict(id="nbg", glob="PNBG_*", short="NBG", name="Nowa Biblia Gdańska", headings=None),
    dict(id="tnp", glob="TNP_*", short="TNP", name="Przekład Toruński (NT i część ST)", headings=None),
]

# Moduł "ma nagłówki", gdy poza Psalmami (tytuły psalmów to nie sekcje) ma ich co najmniej tyle.
MIN_REAL_HEADINGS = 200

TAG = re.compile(r"<[^>]*>")


def inline(s):
    """Tekst bez żadnych znaczników, z rozwiniętymi encjami i znormalizowanymi spacjami."""
    s = re.sub(r"<(?:br\s*/?|CL|CM)>", " ", s, flags=re.I)
    s = TAG.sub("", s)
    s = html.unescape(s).replace("\xa0", " ")
    return re.sub(r"[ \t]+", " ", s).strip()


def clean_verse(raw):
    """Rozbiór wersetu MySword -> (tekst, nagłówki [(poziom, tekst)], przypisy [{m, t}])."""
    s = raw or ""
    notes, heads = [], []

    def note(m):
        mark = (m.group(1) or "").strip()
        body = inline(m.group(2))
        if body:
            notes.append({"m": mark, "t": body})
        return ""

    s = re.sub(r"<RX[^>]*>", "", s)                                   # odsyłacze krzyżowe
    s = re.sub(r"<RF(?:\s+q=([^>]*))?>(.*?)<Rf>", note, s, flags=re.S)  # przypisy
    s = re.sub(r"<W[A-Z][^>]*>", "", s)                               # numery Stronga, morfologia
    s = re.sub(r"<TS>(.*?)<Ts>", lambda m: heads.append((1, inline(m.group(1)))) or "\n", s, flags=re.S)
    s = re.sub(r"<H>(.*?)<h>", "", s, flags=re.S)                     # litery akrostychów (Ps 119, Lm)
    s = re.sub(r"<h>(.*?)</h>", lambda m: heads.append((2, inline(m.group(1)))) or "\n", s, flags=re.S)
    s = re.sub(r"(?:<PI\d>)?<PF\d>|<CL>|<br\s*/?>", "\n", s, flags=re.I)  # wiersze poezji
    s = re.sub(r"<CM>", "\n", s)
    s = TAG.sub("", s)
    s = html.unescape(s).replace("\xa0", " ")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r" *\n[ \n]*", "\n", s).strip()
    heads = [(lvl, t) for lvl, t in heads if t]
    return s, heads, notes


def words(text):
    return len(re.findall(r"\w+", text))


def details(con):
    cur = con.execute("select * from Details")
    row = cur.fetchone()
    d = {c[0].lower(): v for c, v in zip(cur.description, row)}
    clean = lambda k: inline(str(d.get(k) or "")) or None
    return {"title": clean("title"), "description": clean("description"), "publisher": clean("publisher"),
            "source": clean("source"), "version": clean("version"), "versionDate": clean("versiondate")}


def read_module(path):
    con = sqlite3.connect(path)
    rows = con.execute("select Book, Chapter, Verse, Scripture from Bible order by Book, Chapter, Verse").fetchall()
    # naprawa wierszy bez numeru wersetu: duplikat istniejącego wersetu jest usuwany,
    # w przeciwnym razie wiersz dostaje pierwszy brakujący numer w rozdziale
    fixed, by_ch = [], {}
    for b, c, v, s in rows:
        by_ch.setdefault((b, c), []).append([v, s])
    for (b, c), vs in by_ch.items():
        nums = {v for v, _ in vs if v is not None}
        texts = {clean_verse(s)[0]: v for v, s in vs if v is not None}
        miss = [n for n in range(1, max(nums) + 2) if n not in nums]
        for item in vs:
            if item[0] is None:
                if clean_verse(item[1])[0] in texts:
                    print(f"   poprawka: {OSIS[b]} {c} – usunięto duplikat wersetu {texts[clean_verse(item[1])[0]]} (bez numeru)")
                    item[0] = -1
                else:
                    item[0] = miss.pop(0)
                    print(f"   poprawka: {OSIS[b]} {c} – werset bez numeru dostał nr {item[0]}")
        vs[:] = [x for x in vs if x[0] != -1]
        for v, s in sorted(vs, key=lambda x: x[0]):
            fixed.append((b, c, v, s))
    return details(con), fixed


def ref(b, c, v):
    return f"{OSIS[b]} {c}:{v}"


def parse_ref(r):
    o, cv = r.split(" ")
    c, v = cv.split(":")
    return OSIS_ID[o], int(c), int(v)


def convert(t):
    files = glob.glob(str(SRC / (t["glob"] + ".mybible")))
    if not files:
        print(f"!! brak pliku dla {t['id']} ({t['glob']})")
        return None
    path = files[0]
    print(f"== {t['id']}: {Path(path).name}")
    meta, rows = read_module(path)

    books = {}       # b -> {c -> {v: (text, heads, notes)}}
    for b, c, v, raw in rows:
        text, heads, notes = clean_verse(raw)
        # pusty werset albo zaślepka bez słów ("<>", "- - -", "(bg 32)") = werset nieobecny w tym przekładzie
        if not re.search(r"[^\W\d_]", text) or re.fullmatch(r"\(\w+ \d+\)", text):
            continue
        books.setdefault(b, {}).setdefault(c, {})[v] = (text, heads, notes)

    out = OUT / t["id"]
    (CACHE / t["id"]).mkdir(parents=True, exist_ok=True)
    import shutil
    if (out / "text").exists():          # dawny katalog z tekstem w repozytorium
        shutil.rmtree(out / "text")
    for old in ("headings.json", "versification.json"):   # zastąpione przez data/headings i data/versification
        (out / old).unlink(missing_ok=True)

    structure, own_heads, nverses = {}, [], 0
    for b in sorted(books):
        chapters = []
        text_ch = []
        for c in range(1, max(books[b]) + 1):
            vs = books[b].get(c, {})
            n = max(vs) if vs else 0
            chapters.append([words(vs[v][0]) if v in vs else None for v in range(1, n + 1)])
            verses = []
            for v in range(1, n + 1):
                if v not in vs:
                    continue
                text, heads, notes = vs[v]
                item = {"v": v}
                if heads:
                    item["h"] = [h for _, h in heads]
                    own_heads.extend((lvl, b, c, v, h) for lvl, h in heads)
                item["t"] = text
                if notes:
                    item["n"] = notes
                verses.append(item)
                nverses += 1
            text_ch.append({"c": c, "verses": verses})
        structure[str(b)] = chapters
        book_json = {"translation": t["id"], "book": b, "osis": OSIS[b], "chapters": text_ch}
        (CACHE / t["id"] / f"{b:02d}.json").write_text(json.dumps(book_json, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    (out / "structure.json").write_text(
        "{\n" + f' "translation": "{t["id"]}",\n "note": "Liczba słów w każdym wersecie; null = wersetu nie ma w tym przekładzie.",\n "books": {{\n'
        + ",\n".join(f'  "{b}": ' + json.dumps(ch, separators=(",", ":")) for b, ch in structure.items())
        + "\n }\n}\n", encoding="utf-8")

    real = [h for h in own_heads if h[0] == 1 and h[1] != 19]
    if len(real) >= MIN_REAL_HEADINGS:   # surowe nagłówki modułu (jego numeracja) – tylko lokalnie
        hp = ROOT / ".cache/headings" / f"{t['id']}.json"
        hp.parent.mkdir(parents=True, exist_ok=True)
        hp.write_text(json.dumps(sorted({ref(b, c, v) for lvl, b, c, v, _ in own_heads if lvl == 1},
                                        key=lambda r: parse_ref(r))), encoding="utf-8")
    print(f"   {len(structure)} ksiąg, {nverses} wersetów, nagłówki w module: {len(own_heads)} (poza Ps: {len(real)})")
    return dict(t=t, meta=meta, structure=structure, own_heads=own_heads, real=len(real), nverses=nverses, out=out)


def main():
    results = {}
    for t in TRANSLATIONS:
        r = convert(t)
        if r:
            results[t["id"]] = r
    index = []
    for tid, r in results.items():
        t, m = r["t"], r["meta"]
        books = sorted(int(b) for b in r["structure"])
        index.append({
            "id": tid, "short": t["short"], "name": t["name"],
            "title": m["title"] or m["description"],
            "publisher": m["publisher"], "source": m["source"], "version": m["version"],
            "books": books if len(books) < 66 else "all",
            "verses": r["nverses"],
            "headings": t["headings"],
            "headingsNote": t.get("headings_note") if t["headings"] else None,
        })
    (ROOT / "data/translations.json").write_text(
        json.dumps({"default": "bw", "translations": index}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"spis: data/translations.json ({len(index)} przekładów)")
    print("dalej: python3 tools/build_versification.py (mapy numeracji i nagłówki we wzorcu)")


if __name__ == "__main__":
    sys.exit(main())
