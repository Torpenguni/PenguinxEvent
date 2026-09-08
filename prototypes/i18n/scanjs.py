"""แยกข้อความไทยที่อยู่ในสตริงจริง ๆ ออกจากที่อยู่ในคอมเมนต์ ด้วยการเดินทีละตัวอักษร"""
import re,json,sys
TH=re.compile(r'[ก-๙]')

def scan(src):
    i=0; n=len(src); mode=None; q=None
    spans=[]           # (start,end,kind) kind = str | com
    start=None
    while i<n:
        c=src[i]
        if mode is None:
            if c in "'\"`": mode="str"; q=c; start=i+1
            elif c=="/" and i+1<n and src[i+1]=="/": mode="line"; start=i+2; i+=1
            elif c=="/" and i+1<n and src[i+1]=="*": mode="block"; start=i+2; i+=1
        elif mode=="str":
            if c=="\\": i+=1
            elif c==q: spans.append((start,i,"str")); mode=None
            elif c=="\n" and q!="`": mode=None      # สตริงไม่ปิด ข้ามไป
        elif mode=="line":
            if c=="\n": spans.append((start,i,"com")); mode=None
        elif mode=="block":
            if c=="*" and i+1<n and src[i+1]=="/": spans.append((start,i,"com")); mode=None; i+=1
        i+=1
    return spans

if __name__=="__main__":
    src=open(sys.argv[1],encoding='utf-8').read()
    sp=scan(src)
    strs=[src[a:b] for a,b,k in sp if k=="str" and TH.search(src[a:b])]
    coms=[src[a:b] for a,b,k in sp if k=="com" and TH.search(src[a:b])]
    print("สตริงที่มีภาษาไทย:",len(strs),"· ไม่ซ้ำ",len(set(strs)))
    print("คอมเมนต์ที่มีภาษาไทย:",len(coms))
    json.dump(sorted(set(strs)),open("th_strings.json","w"),ensure_ascii=False,indent=0)
