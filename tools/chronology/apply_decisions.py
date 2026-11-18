import json,sys,re; sys.path.insert(0,'/tmp/claude-0/tyn'); from e2o import bv
S=json.load(open('/tmp/claude-0/tyn/stories.json')); D=json.load(open('/tmp/claude-0/tyn/decisions.json'))
def key(r):
    m=re.fullmatch(r'(\S+) (\d+):(\d+)',r); return (bv.OSIS_ID[m[1]],int(m[2]),int(m[3]))
def owner_map():
    return {tuple(k):i for i,st in enumerate(S) for p in st['parts'] for k in p['ks']}
errors=[]
def kparts(st): return [tuple(p['ks'][0]) for p in st['parts']]
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
for src,dst,why in D.get('move_part',[]):
    om=owner_map(); i=om[key(src)]; st=S[i]
    pi=next(n for n,p in enumerate(st['parts']) if tuple(p['ks'][0])==key(src)); part=st['parts'].pop(pi)
    bef=dst.startswith('<'); dst=dst.lstrip('<')
    if not st['parts']: S.pop(i)
    om=owner_map(); j=om[key(dst)]; t=S[j]
    pj=next(n for n,p in enumerate(t['parts']) if key(dst) in [tuple(x) for x in p['ks']])
    t['parts'].insert(pj if bef else pj+1,part); t['why'].append('ręcznie (nie Tyndale): '+why)
om=owner_map(); threads=[]
for r,name in D['threads']:
    i=om[key(r)]
    if [tuple(x) for x in [S[i]['parts'][0]['ks'][0]]][0]!=key(r): errors.append(f'wątek „{name}” nie zaczyna się na początku historii: {r} (historia zaczyna się od {S[i]["parts"][0]["ks"][0]})')
    threads.append((i,name))
threads.sort()
for a,b in zip(threads,threads[1:]):
    if a[0]==b[0]: errors.append(f'dwa wątki od tej samej historii: {a[1]} / {b[1]}')
json.dump({'stories':S,'threads':threads},open('/tmp/claude-0/tyn/structured.json','w'),ensure_ascii=False)
print('BŁĘDY:' if errors else 'bez błędów', *errors, sep='\n  ')
print('historii:',len(S),'wątków:',len(threads))
