"""Wspólne funkcje narzędzi chronologii: odnośniki OSIS w numeracji wzorca (data/versification/org.json)."""
import json, os, re
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
BOOKS = json.load(open(os.path.join(ROOT, 'data', 'books.json'), encoding='utf-8'))['books']
OSIS = {b['id']: b['osis'] for b in BOOKS}
OSIS_ID = {b['osis']: b['id'] for b in BOOKS}
PL = {b['id']: b['abbr']['pl'] for b in BOOKS}
ORG = {int(k): v for k, v in json.load(open(os.path.join(ROOT, 'data', 'versification', 'org.json'), encoding='utf-8'))['books'].items()}

def path(*p): return os.path.join(ROOT, *p)

def last(b, c): return ORG[b][c - 1]

def key(ref):
    """'Gen 1:1' -> (1, 1, 1)"""
    m = re.fullmatch(r'(\S+) (\d+):(\d+)', ref)
    return (OSIS_ID[m[1]], int(m[2]), int(m[3]))

def ref(k): return f'{OSIS[k[0]]} {k[1]}:{k[2]}'

def nxt(k):
    b, c, v = k
    if v < last(b, c): return (b, c, v + 1)
    if c < len(ORG[b]): return (b, c + 1, 1)
    return None

def compress(ks):
    """lista wersetów (po kolei) -> zakresy 'Gen 1:1-2:3' (ciągłe wersety jednej księgi)"""
    out = []; start = prev = None
    for k in map(tuple, ks):
        if prev is not None and nxt(prev) == k: prev = k; continue
        if start: out.append((start, prev))
        start = prev = k
    if start: out.append((start, prev))
    def fmt(a, z):
        if a == z: return ref(a)
        if a[1] == z[1]: return f'{ref(a)}-{z[2]}'
        return f'{ref(a)}-{z[1]}:{z[2]}'
    return [fmt(a, z) for a, z in out]

def expand(r):
    """'Gen 1:1-2:3' / 'Gen 1:5' / 'Gen 1:5-9' -> [(b,c,v), ...]"""
    m = re.fullmatch(r'(\S+) (\d+):(\d+)(?:-(?:(\d+):)?(\d+))?', r.strip())
    b, c1, v1 = OSIS_ID[m[1]], int(m[2]), int(m[3])
    c2 = int(m[4]) if m[4] else c1; v2 = int(m[5]) if m[5] else v1
    out = []
    for c in range(c1, c2 + 1):
        for v in range(v1 if c == c1 else 1, (v2 if c == c2 else last(b, c)) + 1): out.append((b, c, v))
    return out
