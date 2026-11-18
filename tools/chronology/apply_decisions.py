import json,sys,re; sys.path.insert(0,'/tmp/claude-0/tyn'); from e2o import bv
S=json.load(open('/tmp/claude-0/tyn/stories.json')); D=json.load(open('/tmp/claude-0/tyn/decisions.json'))
def key(r):
    m=re.fullmatch(r'(\S+) (\d+):(\d+)',r); return (bv.OSIS_ID[m[1]],int(m[2]),int(m[3]))
def owner_map():
    return {tuple(k):i for i,st in enumerate(S) for p in st['parts'] for k in p['ks']}
errors=[]
for grp in D['merge']:
    om=owner_map(); idx=sorted({om[key(r)] for r in grp})
    if idx!=list(range(idx[0],idx[-1]+1)): errors.append(f'merge niesąsiadujące: {grp} -> {idx}'); continue
    head=S[idx[0]]
    for i in idx[1:]: head['parts']+=S[i]['parts']; head['why']+=S[i]['why']+['ręcznie: relacja równoległa']
    for i in reversed(idx[1:]): del S[i]
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
