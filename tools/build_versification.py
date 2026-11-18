#!/usr/bin/env python3
"""Jednorazowa budowa map wersyfikacji: każdy przekład -> wzorzec „org” (numeracja oryginału:
Biblia Hebrajska dla ST, wydania greckie dla NT; sources/versification/org.vrs z SIL/Paratext).

Wynik: data/versification/<id>.json – lista połączeń różnych od 1:1 (n:m, także przez granice rozdziałów
i poza kolejnością). Wszystko, czego w mapie nie ma, to ten sam numer we wzorcu i w przekładzie.

Jak powstaje mapa:
  1. Tekst wzorcowy: tekst SNPD przepięty na numerację org przez znane połączenia z eng.vrs
     (SNPD ma numerację org, a w 8 księgach angielską).
  2. Każdy przekład dopasowany do tekstu wzorcowego w obrębie księgi (programowanie dynamiczne
     z ruchami 1:1, 1:2, 2:1, 1:3, 3:1 i pominięciami), potem wersety poza kolejnością.
  3. Raport .cache/versification_report.txt: wszystkie połączenia różne od 1:1 z tekstem obu stron
     i ocena pewności – do przeczytania i ręcznych poprawek w MANUAL poniżej.

Potrzebny lokalny tekst (.cache/text, tworzy go tools/convert_mybible.py). Tekst nie trafia do repozytorium.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEXT = ROOT / ".cache/text"
OUT = ROOT / "data/versification"
BOOKS = json.loads((ROOT / "data/books.json").read_text(encoding="utf-8"))["books"]
OSIS = {b["id"]: b["osis"] for b in BOOKS}
PT = ("GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN "
      "HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI "
      "2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV").split()
PIVOT = "snpd"

# Ręczne rozstrzygnięcia po przeczytaniu raportu: przekład -> [(wersety wzorca, wersety przekładu)].
# Zapis: 'Isa 63:19' albo kilka wersetów po przecinku: 'Isa 63:19, Isa 64:1'. Pusty napis = brak odpowiednika.
NUM25 = [("Num 25:18", "Num 25:18"), ("Num 25:19, Num 26:1", "Num 26:1")]   # „Po tej pladze…” na początku 26:1
MANUAL = {
    # Iz 63:19 w oryginale obejmuje też „Obyś rozdarł niebiosa…”, które numeracja angielska ma jako 64:1
    "snpd": [("Isa 63:19", "Isa 63:19, Isa 64:1")] + NUM25,
    "snp": [("Isa 63:19", "Isa 63:19, Isa 64:1"), ("Isa 64:1", "Isa 64:2")],
    "ubg": NUM25,
    # BW: moduł nie ma Lb 17:14-28 (laska Aarona) – 18:1 to zwykłe 18:1
    "bw": [("Num 17:27, Num 17:28", ""), ("Num 18:1", "Num 18:1"), ("Isa 63:19", "Isa 63:19, Isa 64:1")] + NUM25,
    # NBG łączy przykazania 17-20 w jednym wersecie i Am 2:14-15 w jednym wersecie
    "nbg": [("Deut 5:16", "Deut 5:16"), ("Deut 5:17, Deut 5:18, Deut 5:19, Deut 5:20", "Deut 5:17"),
            ("Amos 2:14, Amos 2:15", "Amos 2:14"), ("Amos 2:16", "Amos 2:15")],
}


def parse_keys(s):
    out = []
    for part in filter(None, (x.strip() for x in s.split(","))):
        o, cv = part.split(" ")
        c, v = cv.split(":")
        out.append((next(b["id"] for b in BOOKS if b["osis"] == o), int(c), int(v)))
    return out


# ------------------------------------------------------------------ wersyfikacje
def load_vrs(path):
    counts, maps = {}, []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split("#")[0].strip()
        if not line:
            continue
        if "=" in line:
            maps.append([x.strip() for x in line.split("=")])
            continue
        p = line.split()
        if p[0] in PT:
            counts[PT.index(p[0]) + 1] = [int(x.split(":")[1]) for x in p[1:]]
    return counts, maps


def expand(ref):
    """'GEN 32:1-32' -> [(b, c, v), ...]"""
    m = re.fullmatch(r"(\w+) (\d+):(\d+)(?:-(\d+))?", ref)
    if not m or m.group(1) not in PT:
        return None
    b, c, v1 = PT.index(m.group(1)) + 1, int(m.group(2)), int(m.group(3))
    v2 = int(m.group(4) or v1)
    return [(b, c, v) for v in range(v1, v2 + 1)]


ORG, _ = load_vrs(ROOT / "sources/versification/org.vrs")
ENG, ENG_MAPS = load_vrs(ROOT / "sources/versification/eng.vrs")
ENG_LINES = []                       # [(wersety eng, wersety org)] – linie o równej długości
for left, right in ENG_MAPS:
    a, b = expand(left), expand(right)
    if a and b and len(a) == len(b):
        ENG_LINES.append((a, b))


def eng_to_org(b, counts):
    """Przeliczenie eng -> org dla księgi b, tylko w liniach eng.vrs, których rozdziały źródłowe mają
    w przekładzie numerację angielską (liczba wersetów = eng, różna od org)."""
    m = {}
    for a, o in ENG_LINES:
        if a[0][0] != b:
            continue
        chs = {c for _, c, _ in a}
        if all(c <= len(counts) and counts[c - 1] == ENG[b][c - 1] for c in chs) and \
                any(counts[c - 1] != ORG[b][c - 1] for c in chs if c <= len(ORG[b])):
            m.update(zip(a, o))
    return m


def org_verses(b):
    return [(b, c + 1, v) for c, n in enumerate(ORG[b]) for v in range(1, n + 1)]


# ------------------------------------------------------------------ tekst
def book_text(tid, b, with_titles=False):
    f = TEXT / tid / f"{b:02d}.json"
    if not f.exists():
        return {}
    out = {}
    for ch in json.loads(f.read_text(encoding="utf-8"))["chapters"]:
        for v in ch["verses"]:
            t = v["t"]
            if with_titles and v.get("h") and b == 19:      # tytuł psalmu zapisany jako nagłówek wersetu 1
                t = " ".join(v["h"]) + " " + t
            out[(b, ch["c"], v["v"])] = t
    return out


def stem_set(t):
    return {w[:5] for w in re.findall(r"\w+", t.lower()) if len(w) >= 3}


def pivot_text(b):
    """Tekst wzorcowy w numeracji org: SNPD; księgi SNPD w numeracji angielskiej przeliczone przez eng.vrs."""
    src = book_text(PIVOT, b)
    own = {}
    for (bb, c, v), t in src.items():
        own.setdefault(c, 0)
        own[c] = max(own[c], v)
    counts = [own.get(c, 0) for c in range(1, max(own) + 1)] if own else []
    m = eng_to_org(b, counts) if b in ENG else {}
    out = {}
    for key, t in src.items():
        out[m.get(key, key)] = t
    return out, bool(m)


# ------------------------------------------------------------------ dopasowanie
MOVES = [(1, 1, 0.0), (1, 2, 0.06), (2, 1, 0.06), (1, 3, 0.12), (3, 1, 0.12)]
GAP = -0.12


def align_book(tv, ov, tt, ot):
    """tv: wersety przekładu, ov: wersety org (uporządkowane). Zwraca listę grup ([t...], [o...], podobieństwo)."""
    n, m = len(tv), len(ov)
    ts = [stem_set(tt.get(k, "")) for k in tv]
    os_ = [stem_set(ot.get(k, "")) for k in ov]
    band = max(60, abs(n - m) + 30)

    def sim(i0, i1, j0, j1):
        A = set().union(*ts[i0:i1]); B = set().union(*os_[j0:j1])
        if not A or not B:
            return 0.0
        return len(A & B) / len(A | B)

    NEG = -1e9
    S = {(0, 0): 0.0}
    back = {}
    for i in range(0, n + 1):
        jc = int(i * m / max(1, n))
        for j in range(max(0, jc - band), min(m, jc + band) + 1):
            if (i, j) == (0, 0):
                continue
            best, arg = NEG, None
            for di, dj, pen in MOVES:
                p = S.get((i - di, j - dj))
                if p is not None and p > NEG:
                    sc = p + sim(i - di, i, j - dj, j) - pen
                    if sc > best:
                        best, arg = sc, (di, dj)
            for di, dj in ((1, 0), (0, 1)):
                p = S.get((i - di, j - dj))
                if p is not None and p + GAP > best:
                    best, arg = p + GAP, (di, dj)
            if arg:
                S[(i, j)] = best
                back[(i, j)] = arg
    groups, i, j = [], n, m
    if (n, m) not in back:
        raise RuntimeError("brak ścieżki dopasowania")
    while (i, j) != (0, 0):
        di, dj = back[(i, j)]
        groups.append((tv[i - di:i], ov[j - dj:j], sim(i - di, i, j - dj, j) if di and dj else None))
        i, j = i - di, j - dj
    groups.reverse()
    # wersety poza kolejnością: pominięty werset przekładu łączymy z najlepszym pominiętym wersetem org
    lone_t = [g for g in groups if g[0] and not g[1]]
    lone_o = [g for g in groups if g[1] and not g[0]]
    for gt in lone_t:
        best, bo = 0.0, None
        A = stem_set(tt.get(gt[0][0], ""))
        for go in lone_o:
            B = stem_set(ot.get(go[1][0], ""))
            s = len(A & B) / max(1, len(A | B))
            if s > best:
                best, bo = s, go
        if bo and best >= 0.3:
            groups.remove(bo)
            idx = groups.index(gt)
            groups[idx] = (gt[0], bo[1], best)
            lone_o.remove(bo)
    return groups


def fmt(keys):
    """[(b,c,v),...] -> 'Gen 32:1-3' / 'Gen 31:55-32:1'"""
    if not keys:
        return None
    b, c1, v1 = keys[0]
    _, c2, v2 = keys[-1]
    if (c1, v1) == (c2, v2):
        return f"{OSIS[b]} {c1}:{v1}"
    return f"{OSIS[b]} {c1}:{v1}-{v2}" if c1 == c2 else f"{OSIS[b]} {c1}:{v1}-{c2}:{v2}"


def build(tid, report):
    struct = json.loads((ROOT / f"data/translations/{tid}/structure.json").read_text(encoding="utf-8"))["books"]
    links, missing, extra, stats = [], [], [], {"1:1": 0, "inne": 0, "niepewne": 0}
    for b_str, chapters in struct.items():
        b = int(b_str)
        tv = [(b, c + 1, v + 1) for c, ch in enumerate(chapters) for v, w in enumerate(ch) if w is not None]
        ov = org_verses(b)
        tt = book_text(tid, b, with_titles=True)
        ot, _ = pivot_text(b)
        if [len(ch) for ch in chapters] == ORG[b] and tid != PIVOT:
            # ta sama budowa księgi: sprawdzamy tylko, czy treść się zgadza 1:1
            groups = [([k], [k], None) for k in tv]
            gaps = [k for k in ov if k not in set(tv)]
            groups += [([], [k], None) for k in gaps]
        else:
            groups = align_book(tv, ov, tt, ot)
        for o_str, t_str in MANUAL.get(tid, []):
            mo, mt = parse_keys(o_str), parse_keys(t_str)
            if (mo or mt)[0][0] != b:
                continue
            groups = [g for g in groups if not (set(g[0]) & set(mt) or set(g[1]) & set(mo))]
            groups.append((mt, mo, 1.0))
        groups.sort(key=lambda g: (g[0] or g[1])[0][1:])
        for t_keys, o_keys, s in groups:
            if t_keys and o_keys and len(t_keys) == 1 and t_keys == o_keys:
                stats["1:1"] += 1
                continue
            if t_keys and not o_keys:
                extra.append(fmt(t_keys)); kind = "tylko w przekładzie"
            elif o_keys and not t_keys:
                missing.append(fmt(o_keys)); kind = "brak w przekładzie"
            else:
                links.append([fmt(o_keys), fmt(t_keys)]); kind = f"{len(o_keys)}:{len(t_keys)}"
            stats["inne"] += 1
            unsure = s is not None and s < 0.25
            if unsure:
                stats["niepewne"] += 1
            report.append(f"{tid:5} {'?' if unsure else ' '} {kind:20} org {fmt(o_keys) or '—':22} = {tid} {fmt(t_keys) or '—':22}"
                          + (f" (podob. {s:.2f})" if s is not None else ""))
            for k in t_keys[:2]:
                report.append(f"        {tid}: {tt.get(k, '')[:110]}")
            for k in o_keys[:2]:
                report.append(f"        org: {ot.get(k, '')[:110]}")
    data = {
        "translation": tid,
        "standard": "org",
        "note": "Mapa numeracji przekładu na wzorzec org (numeracja oryginału, SIL/Paratext org.vrs). "
                "links: [wersety wzorca, wersety przekładu]; missing: wersety wzorca, których przekład nie ma; "
                "extra: wersety przekładu bez odpowiednika. Wszystko inne: ten sam numer.",
        "links": links, "missing": missing, "extra": extra,
    }
    OUT.mkdir(parents=True, exist_ok=True)
    body = ",\n".join("  " + json.dumps(l, ensure_ascii=False) for l in links)
    head = json.dumps({k: v for k, v in data.items() if k not in ("links", "missing", "extra")}, ensure_ascii=False, indent=1)[:-2]
    (OUT / f"{tid}.json").write_text(
        head + ',\n "links": [\n' + body + '\n ],\n "missing": ' + json.dumps(missing, ensure_ascii=False)
        + ',\n "extra": ' + json.dumps(extra, ensure_ascii=False) + "\n}\n", encoding="utf-8")
    print(f"{tid}: {stats['1:1']} wersetów 1:1, {len(links)} połączeń innych, {len(missing)} brakujących, "
          f"{len(extra)} dodatkowych, niepewnych {stats['niepewne']}")


# ------------------------------------------------------------------ wszystko, co uniwersalne -> wzorzec
OSIS_ID = {v: k for k, v in OSIS.items()}


def keys_of(ref, counts):
    """'Gen 31:55' / 'Gen 32:1-3' / 'Gen 31:55-32:1' -> [(b,c,v)]; counts: {b: [liczba wersetów w rozdziale]}."""
    m = re.fullmatch(r"(\S+) (\d+):(\d+)(?:-(?:(\d+):)?(\d+))?", ref)
    b, c1, v1 = OSIS_ID[m[1]], int(m[2]), int(m[3])
    if not m[5]:
        return [(b, c1, v1)]
    c2, v2 = int(m[4] or c1), int(m[5])
    out = []
    for c in range(c1, c2 + 1):
        lo = v1 if c == c1 else 1
        hi = v2 if c == c2 else counts[b][c - 1]
        out += [(b, c, v) for v in range(lo, hi + 1)]
    return out


def own_to_org(tid):
    """werset przekładu -> [wersety wzorca] (tylko połączenia z mapy; reszta: ten sam numer)."""
    struct = json.loads((ROOT / f"data/translations/{tid}/structure.json").read_text(encoding="utf-8"))["books"]
    own = {int(b): [len(c) for c in ch] for b, ch in struct.items()}
    data = json.loads((OUT / f"{tid}.json").read_text(encoding="utf-8"))
    m = {}
    for o_ref, t_ref in data["links"]:
        O, T = keys_of(o_ref, ORG), keys_of(t_ref, own)
        for i, t in enumerate(T):        # n:m – wersety wzorca rozdzielone proporcjonalnie
            lo, hi = i * len(O) // len(T), max(i * len(O) // len(T) + 1, (i + 1) * len(O) // len(T))
            m[t] = O[lo:hi]
    return m, own


def fmt_ranges(keys):
    """Kolejne wersety wzorca -> zakresy: 'Gen 1', 'Gen 1-3', 'Gen 1:1-5', 'Gen 1:20-2:3'."""
    runs = []
    for b, c, v in keys:
        r = runs[-1] if runs else None
        if r and r[0] == b and ((r[3] == c and r[4] + 1 == v) or (r[3] + 1 == c and v == 1 and r[4] == ORG[b][r[3] - 1])):
            r[3], r[4] = c, v
        else:
            runs.append([b, c, v, c, v])
    out = []
    for b, c1, v1, c2, v2 in runs:
        o, full = OSIS[b], v1 == 1 and v2 == ORG[b][c2 - 1]
        if full:
            out.append(f"{o} {c1}" if c1 == c2 else f"{o} {c1}-{c2}")
        elif c1 == c2:
            out.append(f"{o} {c1}:{v1}" if v1 == v2 else f"{o} {c1}:{v1}-{v2}")
        else:
            out.append(f"{o} {c1}:{v1}-{c2}:{v2}")
    return "; ".join(out)


def universal():
    OUT.mkdir(parents=True, exist_ok=True)
    org_file = {"standard": "org", "source": "SIL/Paratext org.vrs (BHS dla ST, UBS GNT dla NT)",
                "note": "Liczba wersetów w rozdziałach numeracji wzorca.",
                "books": {str(b): ORG[b] for b in range(1, 67)}}
    (OUT / "org.json").write_text(json.dumps(org_file, ensure_ascii=False, indent=1).replace(",\n   ", ",").replace("[\n   ", "[").replace("\n  ]", "]") + "\n", encoding="utf-8")

    bw_map, bw_counts = own_to_org("bw")
    chron_path = ROOT / "data/chronology.json"
    chron = json.loads(chron_path.read_text(encoding="utf-8"))
    leg = {int(b): v for b, v in chron.get("chapters", {}).items()}

    def leg_to_org(k):
        b, c, v = k
        if leg[b][c - 1] != (bw_counts[b][c - 1] if c <= len(bw_counts[b]) else None):
            return [k]                   # rozdział, w którym modułowi BW brakuje wersetów: numeracja wzorca
        return bw_map.get(k, [k])

    if leg:                              # chronologia jeszcze w starej numeracji -> przepisujemy na wzorzec
        seen, entries = set(), []
        for entry in chron["entries"]:
            org_keys = []
            for part in entry.split(";"):
                m = re.fullmatch(r"(\S+) (\d+)(?::(\d+))?(?:-(?:(\d+):)?(\d+|end))?", part.strip())
                b, c1 = OSIS_ID[m[1]], int(m[2])
                if m[3] is None:
                    v1, c2, v2 = 1, int(m[5]) if m[5] else c1, None
                else:
                    v1 = int(m[3]); c2 = int(m[4]) if m[4] else c1
                    v2 = None if m[5] == "end" else (int(m[5]) if m[5] else v1)
                for c in range(c1, c2 + 1):
                    hi = (v2 if c == c2 and v2 else leg[b][c - 1])
                    for v in range(v1 if c == c1 else 1, hi + 1):
                        for k in leg_to_org((b, c, v)):
                            if k not in seen:
                                seen.add(k); org_keys.append(k)
            entries.append(sorted(org_keys, key=lambda k: (org_keys.index(k) if k[0] != org_keys[0][0] else 0, k)) if org_keys else [])
        all_org = [k for b in range(1, 67) for k in org_verses(b)]
        lost = [k for k in all_org if k not in seen]
        for k in lost:                   # werset wzorca bez pasażu: do pasażu poprzedniego wersetu
            prev = (k[0], k[1], k[2] - 1) if k[2] > 1 else (k[0], k[1] - 1, ORG[k[0]][k[1] - 2]) if k[1] > 1 else None
            i = next((i for i, e in enumerate(entries) if prev in e), None)
            if i is None:
                i = next(i for i, e in enumerate(entries) if any(x[0] == k[0] for x in e))
            entries[i].append(k); entries[i].sort(key=lambda x: (x[0] != entries[i][0][0], x))
            seen.add(k)
        print(f"chronologia -> wzorzec: {sum(1 for e in entries if e)} pasaży, dołączono {len(lost)} wersetów: {[fmt_ranges([k]) for k in lost]}")
        out = {
            "description": chron["description"],
            "source": chron["source"],
            "versification": "org",
            "syntax": "OSIS rozdział[:werset][-[rozdział:]werset] w numeracji wzorca (data/versification/org.json)",
            "entries": [fmt_ranges(e) for e in entries if e],
        }
        body = ",\n".join("  " + json.dumps(e, ensure_ascii=False) for e in out["entries"])
        head = json.dumps({k: v for k, v in out.items() if k != "entries"}, ensure_ascii=False, indent=1)[:-2]
        chron_path.write_text(head + ',\n "entries": [\n' + body + "\n ]\n}\n", encoding="utf-8")

    # nagłówki -> wzorzec
    hdir = ROOT / "data/headings"
    hdir.mkdir(parents=True, exist_ok=True)
    sets = {}
    legacy_bw = ROOT / "sources/headings/bw.json"
    if legacy_bw.exists() and leg:
        sets["bw"] = ("nagłówki wydania BW", [leg_to_org(keys_of(r, leg)[0])[0] for r in json.loads(legacy_bw.read_text(encoding="utf-8"))["headings"]])
    raw = ROOT / ".cache/headings/snpd.json"
    if raw.exists():
        snpd_map, snpd_counts = own_to_org("snpd")
        sets["snpd"] = ("nagłówki SNP (przekład dosłowny, EIB)", [snpd_map.get(keys_of(r, snpd_counts)[0], [keys_of(r, snpd_counts)[0]])[0]
                                                               for r in json.loads(raw.read_text(encoding="utf-8"))])
    for sid, (note, keys) in sets.items():
        refs = [f"{OSIS[b]} {c}:{v}" for b, c, v in sorted(set(keys))]
        data = {"set": sid, "standard": "org", "note": f"Początki sekcji ({note}) w numeracji wzorca; bez tytułów.", "headings": refs}
        (hdir / f"{sid}.json").write_text(json.dumps(data, ensure_ascii=False, indent=0).replace('",\n"', '", "') + "\n", encoding="utf-8")
        print(f"nagłówki {sid}: {len(refs)}")


def main(ids):
    if not TEXT.exists():
        sys.exit("Brak .cache/text – uruchom najpierw tools/convert_mybible.py z modułami w sources/mybible/.")
    report = []
    for tid in ids:
        build(tid, report)
    (ROOT / ".cache/versification_report.txt").write_text("\n".join(report) + "\n", encoding="utf-8")
    print("raport: .cache/versification_report.txt")
    universal()


if __name__ == "__main__":
    if sys.argv[1:] == ["--universal"]:
        universal()
    else:
        main(sys.argv[1:] or ["bw", "snp", "snpd", "ubg", "nbg", "tnp"])
