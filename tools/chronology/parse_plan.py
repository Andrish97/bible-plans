import re,json,sys
import os; ROOT=os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..')); sys.path.insert(0,os.path.join(ROOT,'tools')); import build_versification as bv
NAMES={'genesis':'Gen','exodus':'Exod','leviticus':'Lev','numbers':'Num','deuteronomy':'Deut','joshua':'Josh','judges':'Judg','ruth':'Ruth','1 samuel':'1Sam','2 samuel':'2Sam','1 kings':'1Kgs','2 kings':'2Kgs','1 chronicles':'1Chr','2 chronicles':'2Chr','ezra':'Ezra','nehemiah':'Neh','esther':'Esth','job':'Job','psalm':'Ps','psalms':'Ps','proverbs':'Prov','ecclesiastes':'Eccl','song of songs':'Song','song of solomon':'Song','isaiah':'Isa','jeremiah':'Jer','lamentations':'Lam','ezekiel':'Ezek','daniel':'Dan','hosea':'Hos','joel':'Joel','amos':'Amos','obadiah':'Obad','jonah':'Jonah','micah':'Mic','nahum':'Nah','habakkuk':'Hab','zephaniah':'Zeph','haggai':'Hag','zechariah':'Zech','malachi':'Mal','matthew':'Matt','mark':'Mark','luke':'Luke','john':'John','acts':'Acts','romans':'Rom','1 corinthians':'1Cor','2 corinthians':'2Cor','galatians':'Gal','ephesians':'Eph','philippians':'Phil','colossians':'Col','1 thessalonians':'1Thess','2 thessalonians':'2Thess','1 timothy':'1Tim','2 timothy':'2Tim','titus':'Titus','philemon':'Phlm','hebrews':'Heb','james':'Jas','1 peter':'1Pet','2 peter':'2Pet','1 john':'1John','2 john':'2John','3 john':'3John','jude':'Jude','revelation':'Rev'}
HALF=[]
BOOKRE=re.compile(r'^((?:[123] )?[A-Za-z]+(?: of [A-Za-z]+)?)\s+(\d.*)$')
def norm(s):
    s=re.sub('[\ue000-\uf8ff]','',s)                                  # znaki pól wyboru z PDF
    s=s.replace('\u2013','-').replace('\u2014','-').replace('\u2011','-').strip()
    s=re.sub(r'([A-Za-z])(\d+:)',r'\1 \2',s)                         # 'Genesis1:1' -> 'Genesis 1:1'
    s=re.sub(r'^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\.?\s+',lambda m:('Sep' if m[1]=='Sept' else m[1])+' ',s)
    return s
def parse_ref(name, spec, counts):
    """spec: '25:5-6, 12-18' / '1:1-3:24' / '1-2, 15' -> list of (b,c,v) in counts numbering; plus list of block strings"""
    b=bv.OSIS_ID[NAMES[name.lower()]]; out=[]; blocks=[]
    lastc=None; verse_mode=False
    for piece in [p.strip() for p in spec.split(',') if p.strip()]:
        if re.search(r'\d[ab]\b',piece): HALF.append(f"{NAMES[name.lower()]} {piece}")
        piece=re.sub(r'(\d)[ab]\b',r'\1',piece)
        m=re.fullmatch(r'(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?',piece)
        if not m: raise ValueError(piece)
        a,av,bb,bv_=m.groups()
        if av is not None:            # c:v[-...]
            c1,v1=int(a),int(av); verse_mode=True
            if bv_ is not None: c2,v2=int(bb),int(bv_)
            elif bb is not None: c2,v2=c1,int(bb)
            else: c2,v2=c1,v1
        elif verse_mode:              # kontynuacja wersetów w ostatnim rozdziale
            c1=c2=lastc; v1=int(a); v2=int(bb) if bb else v1
        else:                         # całe rozdziały
            c1=int(a); c2=int(bb) if bb else c1; v1=1; v2=counts[b][c2-1]
        lastc=c2
        ks=[]
        for c in range(c1,c2+1):
            for v in range(v1 if c==c1 else 1,(v2 if c==c2 else counts[b][c-1])+1): ks.append((b,c,v))
        out+=ks; blocks.append((f"{bv.OSIS[b]} {c1}:{v1}-{c2}:{v2}",ks))
    return blocks
def parse_lines(lines, counts, merge=True):
    blocks=[]; day=0; bad=[]
    merged=[]
    for raw in lines:
        t=norm(raw)
        if merge and merged and (re.search(r'[-,]$',merged[-1]) or merged[-1].lower() in NAMES):
            merged[-1]=merged[-1]+('' if re.search(r'[-,]$',merged[-1]) else ' ')+t
        else:
            merged.append(t)
    for raw in merged:
        s=norm(raw)
        if not s: continue
        md=re.match(r'^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d+)\s*(.*)$',s)
        if md:
            import datetime
            mon=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].index(md[1][:3].lower())+1
            day=datetime.date(2023,mon,int(md[2])).timetuple().tm_yday     # rok nieprzestępny: 365 dni
            s=md[3].strip()
            if not s: continue
        m=BOOKRE.match(s)
        if not m or m[1].lower() not in NAMES:
            if re.search(r'\d+:\d+',s): bad.append(s)
            continue
        try:
            for label,ks in parse_ref(m[1],m[2].replace(' ',''),counts): blocks.append((day,label,ks))
        except Exception as e:
            bad.append(s)
    return blocks,day,bad
