import re,sys
import os; ROOT=os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..')); sys.path.insert(0,os.path.join(ROOT,'tools')); import build_versification as bv
def expand_vrs(ref):
    m=re.fullmatch(r'(\w+) (\d+):(\d+)(?:-(\d+))?',ref)
    if not m or m[1] not in bv.PT: return None
    b=bv.PT.index(m[1])+1; c=int(m[2]); v1=int(m[3]); v2=int(m[4] or v1)
    return [(b,c,v) for v in range(v1,v2+1)]
E2O={}   # werset eng -> [wersety org]
for left,right in bv.ENG_MAPS:
    a,o=expand_vrs(left),expand_vrs(right)
    if not a or not o: continue
    if len(a)==len(o):
        for x,y in zip(a,o): E2O[x]=[y]
    elif len(a)==1:
        E2O[a[0]]=o
    elif len(o)==1:
        for x in a: E2O[x]=o
    else:
        for i,x in enumerate(a): E2O[x]=o[i*len(o)//len(a):max(i*len(o)//len(a)+1,(i+1)*len(o)//len(a))]
def to_org(k):
    return E2O.get(tuple(k),[tuple(k)])
def block_to_org(ks):
    """blok w numeracji eng -> wersety org; blok zaczynający psalm od wersetu 1 obejmuje też tytuł (werset 0)"""
    out=[]
    ks=[tuple(k) for k in ks]
    if ks and ks[0][0]==19 and ks[0][2]==1 and (19,ks[0][1],0) in E2O:
        ks=[(19,ks[0][1],0)]+ks
    for k in ks:
        for o in to_org(k):
            if o not in out: out.append(o)
    return out
