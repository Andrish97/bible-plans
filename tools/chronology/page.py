import json,html,sys,os
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__))); from common import path
D=json.load(open(path('.cache','chronology','structured.json'),encoding='utf-8')); S=D['stories']; T=D['threads']
PL={b['id']:b['abbr']['pl'] for b in json.load(open(path('data','books.json'),encoding='utf-8'))['books']}
def rng(ks):
    a,b=ks[0],ks[-1]
    if a==b: return f"{PL[a[0]]} {a[1]},{a[2]}"
    if a[1]==b[1]: return f"{PL[a[0]]} {a[1]},{a[2]}–{b[2]}"
    return f"{PL[a[0]]} {a[1]},{a[2]}–{b[1]},{b[2]}"
size=lambda st: sum(len(p['ks']) for p in st['parts'])
def build(t_from,t_to,part,subtitle,out):
    bounds=[i for i,_ in T]+[len(S)]
    th=[];hist=0;tot=0
    for n in range(t_from,t_to):
        i,name=T[n]; j=bounds[n+1]; sts=S[i:j]; v=sum(size(s) for s in sts); hist+=len(sts); tot+=v
        items=[]
        for s in sts:
            refs='; '.join(rng(p['ks']) for p in s['parts'])
            badge=''.join(f'<span class="tag{" man" if w.startswith("ręcznie") else ""}">{html.escape(w)}</span>' for w in sorted(set(s['why'])))
            items.append(f'<li><div class="st"><span class="t">{html.escape(s["title"])}</span><span class="n">{size(s)}</span></div><div class="r">{html.escape(refs)}</div>{("<div class=tags>"+badge+"</div>") if badge else ""}</li>')
        th.append(f'<details><summary><span class="num">{n+1}</span><span class="name">{html.escape(name)}</span><span class="meta">{len(sts)} hist. · {v} w.</span></summary><ol>{"".join(items)}</ol></details>')
    css=open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'page.css'),encoding='utf-8').read()
    page=f'''<title>Chronologia historiami</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,600&family=Inter:wght@400;500;600&display=swap">
<style>{css}</style>
<main>
<h1>Chronologia historiami – część {part}</h1>
<p class="lead">{subtitle}. Wątki {t_from+1}–{t_to}: {t_to-t_from} wątków, {hist} historii, {tot} wersetów – każdy werset dokładnie raz.</p>
<div class="rules">
<p><b>Historia</b> – jedno wydarzenie lub jedna sekcja tekstu, razem z relacjami równoległymi.</p>
<p><b>Wątek</b> – kilka historii, które sensownie czytać razem. Plan najchętniej kończy dzień między wątkami, w razie potrzeby między historiami, wewnątrz historii tylko w ostateczności.</p>
<p>Kolejność według planu Tyndale. Nazwy historii robocze (z nagłówków SNP dosłownego). Liczba = wersety. <span class="tag man">ręcznie</span> = moja decyzja po przeczytaniu tekstu.</p>
</div>
<div class="tools"><button type="button" id="all">Rozwiń wszystko</button><button type="button" id="none">Zwiń</button></div>
{"".join(th)}
</main>
<script>
document.getElementById('all').onclick=()=>document.querySelectorAll('details').forEach(d=>d.open=true);
document.getElementById('none').onclick=()=>document.querySelectorAll('details').forEach(d=>d.open=false);
</script>'''
    open(out,'w').write(page); return tot
if __name__=='__main__':
    a,b,part,sub,out=int(sys.argv[1]),int(sys.argv[2]),sys.argv[3],sys.argv[4],sys.argv[5]
    print(build(a,b,part,sub,out))
