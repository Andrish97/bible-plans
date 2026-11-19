"""Jednorazowo: historie zbudowane przez build_stories.py (lokalnie, z tekstem SNP dosłownego)
-> sources/chronology/stories.json (same odnośniki, bez tytułów) i .cache/chronology/titles.json
(robocze tytuły z nagłówków SNPD – tylko lokalnie, do stron przeglądu)."""
import json
from common import path, compress, ref
S = json.load(open(path('.cache', 'chronology', 'stories_full.json'), encoding='utf-8'))
base, titles = [], {}
for st in S:
    base.append({'parts': [compress(p['ks'])[0] for p in st['parts']], 'why': st['why'], 'days': st['days']})
    for p in st['parts']:
        titles[ref(p['ks'][0])] = p['title'] or ''
    titles.setdefault('#' + ref(st['parts'][0]['ks'][0]), st['title'])
    titles['#' + ref(st['parts'][0]['ks'][0])] = st['title']
with open(path('sources', 'chronology', 'stories.json'), 'w', encoding='utf-8') as f:
    f.write('{"note": "Historie z planu Tyndale (kolejność bloków, deduplikacja, łączenie relacji równoległych) – przed decyzjami z decisions.json. Każda część to jeden ciągły zakres w numeracji wzorca; days = dni planu Tyndale.",\n "stories": [\n')
    f.write(',\n'.join(json.dumps(s, ensure_ascii=False) for s in base))
    f.write('\n]}\n')
json.dump(titles, open(path('.cache', 'chronology', 'titles.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print(len(base), 'historii')
