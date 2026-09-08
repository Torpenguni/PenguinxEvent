"""ดึง 'วลีไทย' ออกจากสตริง โดยไม่แตะแท็ก HTML และไม่แตะโค้ด"""
import re,json
from scanjs import scan
TH=re.compile(r'[ก-๙]')
TAG=re.compile(r'(<[^<>]*>)')
ATTR=re.compile(r'((?:aria-label|title|placeholder|alt|value)\s*=\s*")([^"]*)(")')

def phrases_of(text):
    """คืนลิสต์ของ (ตำแหน่งเริ่ม, ตำแหน่งจบ, วลี) ภายในสตริงหนึ่งก้อน"""
    out=[]; pos=0
    for part in TAG.split(text):
        if not part: continue
        L=len(part)
        if part.startswith("<"):
            for m in ATTR.finditer(part):
                v=m.group(2)
                if TH.search(v): out.append((pos+m.start(2),pos+m.end(2),v))
        elif TH.search(part):
            a=len(part)-len(part.lstrip()); b=len(part.rstrip())
            out.append((pos+a,pos+b,part[a:b]))
        pos+=L
    return out

def collect(path):
    src=open(path,encoding='utf-8').read()
    got={}
    for a,b,k in scan(src):
        if k!="str": continue
        t=src[a:b]
        if not TH.search(t): continue
        for s,e,p in phrases_of(t):
            got.setdefault(p,0); got[p]+=1
    return got

if __name__=="__main__":
    import sys
    g={}
    for f in sys.argv[1:]:
        for k,v in collect(f).items(): g[k]=g.get(k,0)+v
    print("วลีไทยไม่ซ้ำ:",len(g),"· รวมที่ใช้",sum(g.values()))
    json.dump(sorted(g,key=lambda x:(-g[x],x)),open("phr.json","w"),ensure_ascii=False,indent=0)
    L=sorted(g,key=lambda x:-g[x])
    print("\nที่ใช้บ่อยสุด 15:"); [print(f"  {g[x]:3}  {x[:70]}") for x in L[:15]]
    import statistics
    print("\nยาวเฉลี่ย",round(statistics.mean(len(x) for x in g)),"· เกิน 80 ตัว:",sum(1 for x in g if len(x)>80))
