"""Chronologia historiami: historie z planu Tyndale (sources/chronology/stories.json) + decyzje po przeczytaniu
tekstu (sources/chronology/decisions.json) -> data/chronology.json (wątki i historie w numeracji wzorca).
Lokalnie dodatkowo .cache/chronology/structured.json z roboczymi tytułami (do stron przeglądu, page.py).

    python3 tools/chronology/apply_decisions.py
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import path, key as _key, expand, compress, OSIS, OSIS_ID
B = json.load(open(path('sources', 'chronology', 'stories.json'), encoding='utf-8'))['stories']
D = json.load(open(path('sources', 'chronology', 'decisions.json'), encoding='utf-8'))
TP = path('.cache', 'chronology', 'titles.json')
TITLES = json.load(open(TP, encoding='utf-8')) if os.path.exists(TP) else {}
class bv: OSIS = OSIS; OSIS_ID = OSIS_ID
S = []
for st in B:
    parts = [{'title': TITLES.get(r.split('-')[0] if r.count(':') else r, ''), 'ks': [list(k) for k in expand(r)]} for r in st['parts']]
    first = parts[0]['ks'][0]
    S.append({'title': TITLES.get('#' + f'{OSIS[first[0]]} {first[1]}:{first[2]}', st['parts'][0]), 'parts': parts, 'why': list(st['why']), 'days': st['days']})
def key(r):
    m=re.fullmatch(r'(\S+) (\d+):(\d+)',r); return (bv.OSIS_ID[m[1]],int(m[2]),int(m[3]))
def owner_map():
    return {tuple(k):i for i,st in enumerate(S) for p in st['parts'] for k in p['ks']}
errors=[]
def kparts(st): return [tuple(p['ks'][0]) for p in st['parts']]
# 0) cięcie części: nowa część zaczyna się od podanego wersetu
for r in D.get('cut',[]):
    k=list(key(r)); done=False
    for st in S:
        for n,p in enumerate(st['parts']):
            if k in p['ks'] and p['ks'][0]!=k:
                j=p['ks'].index(k); new=dict(p); new['ks']=p['ks'][j:]; new['title']=None; p['ks']=p['ks'][:j]
                st['parts'].insert(n+1,new); done=True; break
        if done: break
    if not done: errors.append(f'cut: {r}')
# 1) rozbicia: nowa historia zaczyna się od części, której pierwszy werset podano
for r in D.get('split',[]):
    k=key(r); om=owner_map(); i=om.get(k)
    st=S[i]; firsts=kparts(st)
    if k not in firsts:
        errors.append(f'split: {r} nie jest początkiem części w historii „{st["title"]}” (części zaczynają się od {[f"{bv.OSIS[x[0]]} {x[1]}:{x[2]}" for x in firsts]})'); continue
    j=firsts.index(k)
    if j==0: continue
    new={'title':st['parts'][j]['title'] or st['title']+' (cz.)','parts':st['parts'][j:],'why':['ręcznie: rozdzielone'],'days':st['days']}
    st['parts']=st['parts'][:j]; S.insert(i+1,new)
# 2) połączenia
for grp in D['merge']:

    om=owner_map(); idx=sorted({om[key(r)] for r in grp})
    if idx!=list(range(idx[0],idx[-1]+1)): errors.append(f'merge niesąsiadujące: {grp} -> {idx}'); continue
    head=S[idx[0]]
    for i in idx[1:]: head['parts']+=S[i]['parts']; head['why']+=S[i]['why']+['ręcznie: relacja równoległa']
    for i in reversed(idx[1:]): del S[i]
# 2b) połączenie wszystkich historii od tej z pierwszym wersetem do tej z drugim
for a,b in D.get('merge_span',[]):
    om=owner_map(); i,j=om[key(a)],om[key(b)]
    if j<=i: errors.append(f'merge_span: {a}..{b} -> {i}..{j}'); continue
    for x in S[i+1:j+1]: S[i]['parts']+=x['parts']; S[i]['why']+=x['why']
    S[i]['why'].append('ręcznie: jedna historia (połączone krótkie sekcje)'); del S[i+1:j+1]
# 3) przeniesienia: historia zawierająca pierwszy werset dołącza do historii zawierającej drugi
for src,dst in D.get('move',[]):
    om=owner_map(); i=om[key(src)]; st=S.pop(i)
    om=owner_map(); j=om[key(dst)]; tgt=S[j]
    dk=key(dst); pos=next(n for n,p in enumerate(tgt['parts']) if dk in [tuple(x) for x in p['ks']])
    last=tuple(st['parts'][-1]['ks'][-1])
    before = last[0]==dk[0] and last[1]==dk[1] and last[2]+1==dk[2]
    tgt['parts'][pos if before else pos+1:pos if before else pos+1]=st['parts']; tgt['why'].append('ręcznie: przeniesione do swojej historii')
# 4) psalmy i fragmenty ustawione według treści (moja decyzja, nie Tyndale)
for src,dst,why in D.get('place',[]):
    om=owner_map(); i=om[key(src)]
    if len(S[i]['parts'])!=1: errors.append(f'place: {src} nie jest osobną historią'); continue
    st=S.pop(i); st['why']=st['why']+['ręcznie (nie Tyndale): '+why]; st['moved']=True
    om=owner_map(); j=om[key(dst)]; S.insert(j+1,st)
for a,b,dst,why in D.get('move_span',[]):
    om=owner_map(); i,j=om[key(a)],om[key(b)]; blk=S[i:j+1]; del S[i:j+1]
    for st in blk: st['why']=st['why']+['ręcznie (nie Tyndale): '+why]; st['moved']=True
    bef=dst.startswith('<'); om=owner_map(); k=om[key(dst.lstrip('<'))]
    S[k if bef else k+1:k if bef else k+1]=blk
for src,dst,why in D.get('move_part',[]):
    om=owner_map(); i=om[key(src)]; st=S[i]
    pi=next(n for n,p in enumerate(st['parts']) if tuple(p['ks'][0])==key(src)); part=st['parts'].pop(pi)
    bef=dst.startswith('<'); dst=dst.lstrip('<')
    if not st['parts']: S.pop(i)
    om=owner_map(); j=om[key(dst)]; t=S[j]
    pj=next(n for n,p in enumerate(t['parts']) if key(dst) in [tuple(x) for x in p['ks']])
    t['parts'].insert(pj if bef else pj+1,part); t['why'].append('ręcznie (nie Tyndale): '+why)
for a,b in D.get('join',[]):
    om=owner_map(); i,j=om[key(a)],om[key(b)]
    if j!=i+1: errors.append(f'join niesąsiadujące: {a} {b}'); continue
    S[i]['parts']+=S[j]['parts']; S[i]['why']+=S[j]['why']; del S[j]
om=owner_map(); threads=[]
for r,name in D['threads']:
    i=om[key(r)]
    if [tuple(x) for x in [S[i]['parts'][0]['ks'][0]]][0]!=key(r): errors.append(f'wątek „{name}” nie zaczyna się na początku historii: {r} (historia zaczyna się od {S[i]["parts"][0]["ks"][0]})')
    threads.append((i,name))
threads.sort()
for a,b in zip(threads,threads[1:]):
    if a[0]==b[0]: errors.append(f'dwa wątki od tej samej historii: {a[1]} / {b[1]}')
bounds=[i for i,_ in threads]+[len(S)]
def comp(cs):
    out=[];a=b=None
    for c in cs:
        if b is not None and c==b+1: b=c; continue
        if a is not None: out.append(f'{a}–{b}' if a!=b else f'{a}')
        a=b=c
    if a is not None: out.append(f'{a}–{b}' if a!=b else f'{a}')
    return ', '.join(out)
for n,(i,name) in enumerate(threads):
    m=re.fullmatch(r'(.*?) \(Ps [^)]*\)',name)
    if m:
        cs=sorted({p['ks'][0][1] for st in S[i:bounds[n+1]] for p in st['parts'] if p['ks'][0][0]==19})
        threads[n]=(i,f'{m[1]} (Ps {comp(cs)})')
os.makedirs(path('.cache', 'chronology'), exist_ok=True)
json.dump({'stories': S, 'threads': threads}, open(path('.cache', 'chronology', 'structured.json'), 'w', encoding='utf-8'), ensure_ascii=False)
# plik aplikacji: wątki -> historie -> zakresy; uwagi tylko przy decyzjach innych niż w planie Tyndale
PFX = 'ręcznie (nie Tyndale): '
out = []
for n, (i, name) in enumerate(threads):
    sts = []
    for st in S[i:bounds[n + 1]]:
        e = {'refs': '; '.join(compress(p['ks'])[0] for p in st['parts'])}
        notes = [w[len(PFX):] for w in st['why'] if w.startswith(PFX)]
        if notes: e['note'] = list(dict.fromkeys(notes))
        sts.append(e)
    out.append((name, sts))
check = [tuple(k) for st in S for p in st['parts'] for k in p['ks']]
if len(check) != len(set(check)): errors.append('werset w dwóch historiach')
with open(path('data', 'chronology.json'), 'w', encoding='utf-8') as f:
    f.write('{\n "description": "Chronologia całej Biblii historiami. Wątek = kilka historii czytanych razem; historia = jedno wydarzenie (z relacjami równoległymi) albo jedna jednostka tekstu. Każdy werset wzorca jest dokładnie raz. Plan tnie najchętniej między wątkami, potem między historiami, wewnątrz historii tylko w ostateczności.",\n')
    f.write(' "source": "Kolejność według planu The One Year Chronological Bible (Tyndale), z decyzjami po przeczytaniu tekstu: sources/chronology/decisions.json. note = powód zmiany względem planu Tyndale.",\n')
    f.write(' "versification": "org",\n "rules": ' + json.dumps(D.get('rules', []), ensure_ascii=False) + ',\n "syntax": "refs: zakresy OSIS rozdział:werset[-[rozdział:]werset] w numeracji wzorca, rozdzielone średnikiem",\n "threads": [\n')
    f.write(',\n'.join('  {"name": ' + json.dumps(name, ensure_ascii=False) + ', "stories": [\n' + ',\n'.join('   ' + json.dumps(e, ensure_ascii=False) for e in sts) + '\n  ]}' for name, sts in out))
    f.write('\n ]\n}\n')
print('BŁĘDY:' if errors else 'bez błędów', *errors, sep='\n  ')
print('historii:',len(S),'wątków:',len(threads))
