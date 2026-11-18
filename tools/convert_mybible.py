#!/usr/bin/env python3
"""Konwersja modułów MySword (*.bbl.mybible, SQLite) do plików JSON używanych przez aplikację.

Dla każdego przekładu powstaje katalog data/translations/<id>/:

  structure.json   – budowa przekładu: księgi, rozdziały, liczba słów w każdym wersecie
                     (null = werset, którego w tym przekładzie nie ma). Na tym liczony jest plan.
  headings.json    – początki sekcji (tylko gdy przekład ma nagłówki)
  text/NN.json     – czysty tekst księgi NN (01–66): wersety, nagłówki, przypisy; bez znaczników MySword

oraz wspólny spis data/translations.json.

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
BOOKS = json.loads((ROOT / "data/books.json").read_text(encoding="utf-8"))["books"]
OSIS = {b["id"]: b["osis"] for b in BOOKS}
OSIS_ID = {b["osis"]: b["id"] for b in BOOKS}

# Kolejność na liście w aplikacji. 'headings':
#   'own'          – nagłówki z samego modułu (o ile ma prawdziwe nagłówki sekcji),
#   'file:<path>'  – lista granic z pliku (sources/headings/...),
#   'from:<id>'    – nagłówki pożyczone z innego przekładu o tej samej wersyfikacji.
TRANSLATIONS = [
    dict(id="bw", glob="PBW_*", short="BW", name="Biblia Warszawska",
         headings="file:sources/headings/bw.json", headings_note="nagłówki wydania BW"),
    dict(id="snp", glob="SNP_SJ*", short="SNP", name="Stare i Nowe Przymierze (EIB)",
         headings="from:snpd", headings_note="nagłówki z przekładu dosłownego SNP"),
    dict(id="snpd", glob="SNPD4_*", short="SNPD", name="Stare i Nowe Przymierze – przekład dosłowny",
         headings="own", headings_note="nagłówki przekładu"),
    dict(id="ubg", glob="PUBG_*", short="UBG", name="Uwspółcześniona Biblia Gdańska", headings="own"),
    dict(id="nbg", glob="PNBG_*", short="NBG", name="Nowa Biblia Gdańska", headings="own"),
    dict(id="tnp", glob="TNP_*", short="TNP", name="Przekład Toruński (NT i część ST)", headings="own"),
]

# Przekład "ma nagłówki", gdy poza Psalmami (tytuły psalmów to nie sekcje) ma ich co najmniej tyle.
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
    (out / "text").mkdir(parents=True, exist_ok=True)

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
        (out / "text" / f"{b:02d}.json").write_text(json.dumps(book_json, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    (out / "structure.json").write_text(
        "{\n" + f' "translation": "{t["id"]}",\n "note": "Liczba słów w każdym wersecie; null = wersetu nie ma w tym przekładzie.",\n "books": {{\n'
        + ",\n".join(f'  "{b}": ' + json.dumps(ch, separators=(",", ":")) for b, ch in structure.items())
        + "\n }\n}\n", encoding="utf-8")

    real = [h for h in own_heads if h[0] == 1 and h[1] != 19]
    print(f"   {len(structure)} ksiąg, {nverses} wersetów, nagłówki w module: {len(own_heads)} (poza Ps: {len(real)})")
    return dict(t=t, meta=meta, structure=structure, own_heads=own_heads, real=len(real), nverses=nverses, out=out)


def verse_exists(structure, b, c, v):
    ch = structure.get(str(b))
    return bool(ch) and c <= len(ch) and v <= len(ch[c - 1]) and ch[c - 1][v - 1] is not None


def point_mapper(ref, own):
    """Przelicznik (rozdział, werset) z numeracji odniesienia na numerację przekładu (jak pointMapper w js/bible.js).
    ref, own: liczba wersetów w kolejnych rozdziałach jednej księgi."""
    cum = lambda a: [sum(a[:i + 1]) for i in range(len(a))]
    cr, ct = cum(ref), cum(own)
    index = [False] * (len(ref) + 1)
    start = 1
    for c in range(1, len(ref) + 1):
        if c <= len(own) and cr[c - 1] == ct[c - 1]:
            for k in range(start, c + 1):
                index[k] = True
            start = c + 1
    if ref and own and cr[-1] == ct[-1]:
        for k in range(start, len(ref) + 1):
            index[k] = True

    def to_own(o):
        c = next((i + 1 for i, x in enumerate(ct) if x >= o), len(own))
        return c, o - (ct[c - 2] if c >= 2 else 0)

    def m(c, v):
        if c <= len(ref) and index[c] and v <= ref[c - 1]:
            return to_own((cr[c - 2] if c >= 2 else 0) + v)
        return c, v
    return m


def remap_headings(heads, ref_chapters, structure):
    """Nagłówki zapisane w innej numeracji -> numeracja przekładu."""
    out, mappers = [], {}
    for h in heads:
        b, c, v = parse_ref(h["ref"])
        rc = ref_chapters.get(str(b))
        own = structure.get(str(b))
        if rc and own:
            if b not in mappers:
                mappers[b] = point_mapper(rc, [len(x) for x in own])
            c, v = mappers[b](c, v)
        out.append({**h, "ref": f"{OSIS[b]} {c}:{v}"})
    return out


def write_headings(res, all_res):
    t, structure = res["t"], res["structure"]
    kind = t["headings"]
    heads = None
    if kind == "own":
        if res["real"] >= MIN_REAL_HEADINGS:
            heads = [{"ref": ref(b, c, v), "title": h, "level": lvl} for lvl, b, c, v, h in res["own_heads"]]
    elif kind.startswith("file:"):
        # lista granic zapisana w numeracji chronologii (data/chronology.json -> chapters)
        src = json.loads((ROOT / kind[5:]).read_text(encoding="utf-8"))
        chapters = json.loads((ROOT / "data/chronology.json").read_text(encoding="utf-8"))["chapters"]
        heads = remap_headings([{"ref": r, "level": 1} for r in src["headings"]], chapters, structure)
    elif kind.startswith("from:"):
        other = all_res.get(kind[5:])
        if other:
            heads = [{"ref": ref(b, c, v), "title": h, "level": lvl} for lvl, b, c, v, h in other["own_heads"]]
            chapters = {b: [len(x) for x in ch] for b, ch in other["structure"].items()}
            heads = remap_headings(heads, chapters, structure)
    path = res["out"] / "headings.json"
    if not heads:
        if path.exists():
            path.unlink()
        print(f"   {t['id']}: bez nagłówków")
        return 0
    # tylko wersety, które w tym przekładzie istnieją; jeden wpis na werset (pierwszy, najwyższy poziom)
    seen, kept, dropped = set(), [], 0
    for h in heads:
        b, c, v = parse_ref(h["ref"])
        if not verse_exists(structure, b, c, v):
            dropped += 1
            continue
        if h["ref"] in seen:
            continue
        seen.add(h["ref"])
        kept.append(h)
    data = {"translation": t["id"], "source": t.get("headings_note"), "headings": kept}
    body = ",\n".join("  " + json.dumps(h, ensure_ascii=False) for h in kept)
    head = json.dumps({k: v for k, v in data.items() if k != "headings"}, ensure_ascii=False, indent=1)[:-2]
    path.write_text(head + ',\n "headings": [\n' + body + "\n ]\n}\n", encoding="utf-8")
    print(f"   {t['id']}: {len(kept)} nagłówków" + (f" (pominięto {dropped} spoza wersyfikacji)" if dropped else ""))
    return len(kept)


def main():
    results = {}
    for t in TRANSLATIONS:
        r = convert(t)
        if r:
            results[t["id"]] = r
    index = []
    for tid, r in results.items():
        n = write_headings(r, results)
        t, m = r["t"], r["meta"]
        books = sorted(int(b) for b in r["structure"])
        index.append({
            "id": tid, "short": t["short"], "name": t["name"],
            "title": m["title"] or m["description"],
            "publisher": m["publisher"], "source": m["source"], "version": m["version"],
            "books": books if len(books) < 66 else "all",
            "verses": r["nverses"],
            "headings": n > 0,
            "headingsNote": t.get("headings_note") if n else None,
        })
    (ROOT / "data/translations.json").write_text(
        json.dumps({"default": "bw", "translations": index}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"spis: data/translations.json ({len(index)} przekładów)")


if __name__ == "__main__":
    sys.exit(main())
