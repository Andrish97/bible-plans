import json,sys,re; import os; ROOT=os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..')); sys.path.insert(0,os.path.dirname(os.path.abspath(__file__))); import parse_plan as P
from e2o import E2O, bv
blocks,_,_=P.parse_lines(open(os.path.join(ROOT,'.cache','walk.raw.txt'),encoding='utf-8').read().splitlines(),P.bv.ENG,True)
blocks=sorted(blocks,key=lambda x:x[0])
cache={}
def V(k):
    b,c,v=k
    if b not in cache: cache[b]=json.load(open(f'{ROOT}/.cache/text/snpd/{b:02d}.json'))['chapters']
    d=cache[b]
    if c>len(d): return None
    x=[y for y in d[c-1]['verses'] if y['v']==v]; return x[0] if x else None
PL={b['abbr']['pl'].replace(' ',''):b['id'] for b in json.load(open(ROOT+'/data/books.json'))['books']}
def refs_in(text):
    """'(Mt 12:22-32; Łk 11:14-23)' -> zbiór wersetów (b,c,v), na które wskazuje oznaczenie równoległości"""
    m=re.match(r'^\((.*?)\)',text or ''); out=set()
    if not m: return out
    book=None
    for part in re.split(r'[;,]',m[1]):
        mm=re.match(r'\s*((?:[123] ?)?[A-ZŁŚŻŹ][a-ząćęłńóśźż]*)?\s*(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?',part)
        if not mm: continue
        if mm[1]: book=PL.get(mm[1].replace(' ',''))
        if not book or book not in bv.ORG: continue
        c1=int(mm[2])
        if mm[3]:
            v1=int(mm[3])
            if mm[5]: c2,v2=int(mm[4]),int(mm[5])
            elif mm[4]: c2,v2=c1,int(mm[4])
            else: c2,v2=c1,v1
        else:
            v1=1; c2=int(mm[4]) if mm[4] else c1; v2=bv.ORG[book][c2-1] if c2<=len(bv.ORG[book]) else 1
        for c in range(c1,c2+1):
            if c>len(bv.ORG[book]): break
            for v in range(v1 if c==c1 else 1,(v2 if c==c2 else bv.ORG[book][c-1])+1): out.add((book,c,v))
    return out
# ciąg wersetów we wzorcu (tytuły psalmów, wersety łączone, poza wzorcem -> ostatni werset rozdziału)
ORGSET={(b,c+1,v) for b in range(1,67) for c,n in enumerate(bv.ORG[b]) for v in range(1,n+1)}
def org_of_block(ks):
    out=[]
    for k in [tuple(x) for x in ks]:
        if k[0]==19 and k[2]==1 and (19,k[1],0) in E2O:
            for o in E2O[(19,k[1],0)]:
                if o not in out: out.append(o)
        for o in E2O.get(k,[k]):
            if o not in ORGSET: o=(o[0],o[1],bv.ORG[o[0]][o[1]-1])
            if o not in out: out.append(o)
    return out
OB=[(d,l,org_of_block(ks)) for d,l,ks in blocks]
# powtórzenia: werset zostaje w bloku, w którym stoi obok swoich sąsiadów w tekście;
# remis (styk bloków, połówki a/b) -> decyzje po przeczytaniu tekstu: późniejszy blok dla tych wersetów
LATER={(12,24,20),(24,52,3),(15,6,14),(13,3,19)}
occ={}
for i,(d,l,ks) in enumerate(OB):
    for o in ks: occ.setdefault(o,[]).append(i)
def nb(o,ks):
    b,c,v=o; S=set(ks); return sum(1 for x in [(b,c,v-1),(b,c,v+1)] if x in S)
keep={}
for o,idx in occ.items():
    if len(idx)==1: keep[o]=idx[0]; continue
    score=[(nb(o,OB[i][2]),i) for i in idx]
    best=max(s for s,_ in score); cands=[i for s,i in score if s==best]
    keep[o]=cands[-1] if (o in LATER and len(cands)>1) else cands[0]
seq=[];day={}
for i,(d,l,ks) in enumerate(OB):
    for o in ks:
        if keep[o]==i and o not in day: seq.append(o); day[o]=d
# wersety wzorca, których plan nie wymienia (sklejone w numeracji ang.) -> obok sąsiada w tekście
for o in sorted(ORGSET-set(seq)):
    b,c,v=o; pos={x:i for i,x in enumerate(seq)}
    prev=next(((b,c,w) for w in range(v-1,0,-1) if (b,c,w) in pos),None)
    nxt=next(((b,c,w) for w in range(v+1,bv.ORG[b][c-1]+1) if (b,c,w) in pos),None)
    a=prev or nxt; j=pos[a]+(1 if prev else 0); seq.insert(j,o); day[o]=day[a]
assert len(seq)==len(set(seq))==len(ORGSET)
# tekst SNPD jest w numeracji SNPD: wzorzec -> SNPD przez mapę
mp=json.load(open(ROOT+'/data/versification/snpd.json'))
import re as _re
def keys_of(ref,counts):
    m=_re.fullmatch(r'(\S+) (\d+):(\d+)(?:-(?:(\d+):)?(\d+))?',ref); b=bv.OSIS_ID[m[1]]; c1,v1=int(m[2]),int(m[3])
    if not m[5]: return [(b,c1,v1)]
    c2=int(m[4] or c1); v2=int(m[5]); out=[]
    for c in range(c1,c2+1):
        for v in range(v1 if c==c1 else 1,(v2 if c==c2 else counts[b][c-1])+1): out.append((b,c,v))
    return out
SN={int(k):[len(x) for x in v] for k,v in json.load(open(ROOT+'/data/translations/snpd/structure.json'))['books'].items()}
O2S={}
for o,t in mp['links']:
    T=keys_of(t,SN)
    for k in keys_of(o,bv.ORG): O2S[k]=T[0]
_V=V
def V(k): return _V(O2S.get(k,k))
secs=[]
for k in seq:
    v=V(k); h=(v or {}).get('h')
    prev=secs[-1]['ks'][-1] if secs else None
    cont=prev and prev[0]==k[0] and ((prev[1]==k[1] and prev[2]+1==k[2]) or (prev[1]+1==k[1] and k[2]==1))
    if h or not cont:
        secs.append({'title':' / '.join(h) if h else None,'ks':[k],'par':refs_in((v or {}).get('t')),'cont':bool(cont)})
    else: secs[-1]['ks'].append(k)
stories=[]
owner={}     # werset -> indeks historii
RECENT=4
def merge_from(i):
    """połącz historie i..koniec w jedną"""
    head=stories[i]
    for st in stories[i+1:]:
        head['parts']+=st['parts']; head['why']+=st['why']
    del stories[i+1:]
    for p in head['parts']:
        for k in p['ks']: owner[k]=i
for s in secs:
    ks=s['ks']; k0=ks[0]; b,c,v=k0
    target=None; why=None
    if not s['title']:
        # ciąg dalszy: do historii poprzedniego wersetu w tekście, jeśli niedawna
        pv=(b,c,v-1) if v>1 else ((b,c-1,bv.ORG[b][c-2]) if c>1 else None)
        if pv in owner and owner[pv]>=len(stories)-RECENT: target=owner[pv]; why='ciąg dalszy'
    if target is None and s['par']:
        hit=[owner[x] for x in s['par'] if x in owner and owner[x]>=len(stories)-RECENT]
        if hit: target=min(hit); why='relacja równoległa'
    if target is not None:
        stories[-1]['parts'].append(s); stories[-1]['why'].append(why)
        for k in ks: owner[k]=len(stories)-1
        if target<len(stories)-1: merge_from(target)
    else:
        stories.append({'title':s['title'] or '(fragment)','parts':[s],'why':[]})
        for k in ks: owner[k]=len(stories)-1
for st in stories:
    st['days']=sorted({day[k] for p in st['parts'] for k in p['ks']})
for st in stories:
    for p in st['parts']: p['par']=sorted(p['par'])
json.dump(stories,open(os.path.join(ROOT,'.cache','chronology','stories_full.json'),'w'),ensure_ascii=False)
n=sum(len(p['ks']) for st in stories for p in st['parts'])
print('historii:',len(stories),'wersetów:',n,'| historii rozciągniętych na >1 dzień Tyndale:',sum(1 for st in stories if len(st['days'])>1))

# ---- fragmenty (kawałki bez własnego nagłówka, wstawione przez plan w inne miejsce)
def heading_before(k):
    b,c,v=k
    while c>=1:
        while v>=1:
            x=V((b,c,v))
            if x and x.get('h'): return ' / '.join(x['h'])
            v-=1
        c-=1
        if c>=1: v=bv.ORG[b][c-1]
    return None
def near(st,k):
    return any(x[0]==k[0] and abs(x[1]-k[1])<=1 for p in st['parts'] for x in p['ks'])
def stems(ks):
    out=set()
    for k in ks:
        x=V(k)
        if x: out|={w[:5] for w in re.findall(r'\w+',x['t'].lower()) if len(w)>=4}
    return out
def same_content(frag,st):
    A=stems([k for p in frag['parts'] for k in p['ks']]); B=stems([k for p in st['parts'] for k in p['ks']])
    return len(A&B)/max(1,len(A))
i=0; log=[]
while i<len(stories):
    st=stories[i]
    if st['title']=='(fragment)':
        k=st['parts'][0]['ks'][0]
        prev=stories[i-1] if i>0 else None; nxt=stories[i+1] if i+1<len(stories) else None
        # 1) fragment sekcji, która jest już w jednej z ostatnich historii -> wraca do niej (z tym, co pomiędzy)
        h=heading_before(k); hit=None
        for j in range(i-1,max(-1,i-9),-1):
            if any((V(p['ks'][0]) or {}).get('h') and ' / '.join(V(p['ks'][0])['h'])==h for p in stories[j]['parts']) or stories[j]['title']==h:
                hit=j; break
        if hit is not None:
            for st2 in stories[hit+1:i+1]:
                stories[hit]['parts']+=st2['parts']; stories[hit]['why']+=st2['why']+['fragment tej samej sekcji']
            del stories[hit+1:i+1]; i=hit+1; log.append(('ta sama sekcja',k)); continue
        cp=same_content(st,prev) if prev else 0; cn=same_content(st,nxt) if nxt else 0
        if max(cp,cn)>=0.45:
            tgt=prev if cp>=cn else nxt
            if tgt is prev: prev['parts']+=st['parts']
            else: nxt['parts']=st['parts']+nxt['parts']
            tgt['why'].append(f'fragment o tej samej treści ({max(cp,cn):.2f})'); del stories[i]; log.append(('ta sama treść',k)); continue
        if prev and near(prev,k):
            prev['parts']+=st['parts']; prev['why'].append('fragment z tej samej księgi'); del stories[i]; log.append(('do poprzedniej',k)); continue
        if nxt and near(nxt,k):
            nxt['parts']=st['parts']+nxt['parts']; nxt['why'].append('fragment z tej samej księgi'); del stories[i]; log.append(('do następnej',k)); continue
        st['title']=(heading_before(k) or '?')+' (cd.)'; log.append(('samodzielna',k))
    i+=1
for st in stories:
    st['days']=sorted({day[k] for p in st['parts'] for k in p['ks']})
    for p in st['parts']: p['par']=sorted(p['par']) if isinstance(p['par'],set) else p['par']
json.dump(stories,open(os.path.join(ROOT,'.cache','chronology','stories_full.json'),'w'),ensure_ascii=False)
from collections import Counter
print('fragmenty:',Counter(a for a,_ in log),'| historii:',len(stories),'| wersetów:',sum(len(p['ks']) for st in stories for p in st['parts']))
