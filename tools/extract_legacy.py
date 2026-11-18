#!/usr/bin/env python3
"""Jednorazowe wyciągnięcie danych z dawnego, jednoplikowego index.html.

Stary generator miał w sobie wbudowane tablice (BOOKS, ENTRY_SEGS, HEADS).
Ten skrypt zamienia je na czytelne pliki:

  data/chronology.json        – uniwersalna kolejność chronologiczna (zapis odnośników OSIS)
  sources/headings/bw.json    – granice nagłówków Biblii Warszawskiej

Użycie:
  git show f498231:index.html > /tmp/old.html   # ostatnia wersja jednoplikowa
  python3 tools/extract_legacy.py /tmp/old.html
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOOKS = json.loads((ROOT / "data/books.json").read_text(encoding="utf-8"))["books"]
OSIS = {b["id"]: b["osis"] for b in BOOKS}


def grab(src, name):
    m = re.search(r"const " + name + r"\s*=\s*(.*?);\n", src, re.S)
    if not m:
        sys.exit(f"Nie znaleziono {name}")
    txt = m.group(1)
    if txt.startswith("new Set("):
        txt = txt[len("new Set("):-1]
    return json.loads(txt)


def fmt_range(b, c1, v1, c2, v2, last):
    """Zapis zakresu: 'Gen 1', 'Gen 1-3', 'Gen 1:1-5', 'Gen 1:20-2:3', 'Gen 1:20-end', 'Gen 1:20-3:end'."""
    whole_start = v1 == 1
    whole_end = v2 == last(b, c2)
    o = OSIS[b]
    if whole_start and whole_end:
        return f"{o} {c1}" if c1 == c2 else f"{o} {c1}-{c2}"
    end = "end" if whole_end else str(v2)
    if c1 == c2:
        return f"{o} {c1}:{v1}" if v1 == v2 else f"{o} {c1}:{v1}-{end}"
    return f"{o} {c1}:{v1}-{c2}:{end}"


def main(path):
    src = Path(path).read_text(encoding="utf-8")
    books = grab(src, "BOOKS")
    last = lambda b, c: books[b - 1]["ch"][c - 1]

    # --- chronologia -------------------------------------------------------
    entries = []
    for segs in grab(src, "ENTRY_SEGS"):
        pieces = [p for seg in segs for p in seg]
        runs = []  # [b, c1, v1, c2, v2]
        for b, c, v1, v2 in pieces:
            if runs:
                r = runs[-1]
                contiguous = r[0] == b and (
                    (r[3] == c and v1 == r[4] + 1) or (r[3] + 1 == c and v1 == 1 and r[4] == last(b, r[3]))
                )
                if contiguous:
                    r[3], r[4] = c, v2
                    continue
            runs.append([b, c, v1, c, v2])
        entries.append("; ".join(fmt_range(*r, last) for r in runs))

    chron = {
        "description": "Uniwersalna kolejność chronologiczna całej Biblii. Każdy element to jeden pasaż "
                       "(może składać się z kilku zakresów rozdzielonych średnikiem). Plan dzieli ten ciąg na dni.",
        "source": "Kolejność pasaży planu The One Year Chronological Bible (YouVersion).",
        "versification": "Numeracja, w której zapisano zakresy: liczba wersetów w rozdziałach każdej księgi. "
                         "Aplikacja przelicza zakresy na wersyfikację wybranego przekładu.",
        "syntax": "OSIS rozdział[:werset][-[rozdział:]werset|end]; 'end' = koniec rozdziału w danym przekładzie",
        "entries": entries,
    }
    out = ROOT / "data/chronology.json"
    body = ",\n".join("  " + json.dumps(e, ensure_ascii=False) for e in entries)
    chapters = ",\n".join(f'  "{b["n"]}": ' + json.dumps(b["ch"], separators=(",", ":")) for b in books)
    head = json.dumps({k: v for k, v in chron.items() if k != "entries"}, ensure_ascii=False, indent=1)[:-2]
    out.write_text(head + ',\n "chapters": {\n' + chapters + '\n },\n "entries": [\n' + body + "\n ]\n}\n", encoding="utf-8")
    print(f"chronologia: {len(entries)} pasaży -> {out.relative_to(ROOT)}")

    # --- nagłówki BW -------------------------------------------------------
    heads = sorted((tuple(map(int, h.split("."))) for h in grab(src, "HEADS")))
    hb = {
        "description": "Granice nagłówków (początki sekcji) Biblii Warszawskiej, bez treści nagłówków.",
        "versification": "bw",
        "headings": [f"{OSIS[b]} {c}:{v}" for b, c, v in heads],
    }
    out = ROOT / "sources/headings/bw.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(hb, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"nagłówki BW: {len(heads)} -> {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ROOT / "index.html")
