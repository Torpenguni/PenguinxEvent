import json,base64,os,subprocess,tempfile
LOGO_DIR=os.path.expanduser("~/Documents/penguinxevent/prototypes/logos")

def load_logo(eid):
    """หาไฟล์โลโก้ของงาน ย่อให้เหลือด้านยาวสุด 320 px แล้วคืนเป็น data URI"""
    for ext in ("png","svg","jpg","jpeg","webp"):
        p=os.path.join(LOGO_DIR,eid+"."+ext)
        if not os.path.exists(p): continue
        if ext=="svg":
            b=open(p,"rb").read()
            return "data:image/svg+xml;base64,"+base64.b64encode(b).decode()
        out=os.path.join(tempfile.gettempdir(),"logo_"+eid+".png")
        subprocess.run(["sips","-Z","320","-s","format","png",p,"--out",out],
                       capture_output=True)
        src=out if os.path.exists(out) else p
        b=open(src,"rb").read()
        return "data:image/png;base64,"+base64.b64encode(b).decode()
    return None

css=open('mock_css.txt').read(); html=open('mock_html.txt').read(); js=open('mock_js.txt').read()
assert js.count('__DATA__')==1,"ต้องมี __DATA__ ตัวเดียว"
found=[]
for data,out in (('app4.json','platform.html'),('demo.json','demo.html')):
    D=json.load(open(data))
    for e in D['events']:
        u=load_logo(e['id'])
        if u:
            e['logo']=u
            if out=='platform.html': found.append(e['id'])
    d=json.dumps(D,ensure_ascii=False)
    p=css+'\n'+html+'\n'+js.replace('__DATA__',d)
    open(out,'w').write(p); print(out,round(len(p)/1024),'KB')
print("ฝังโลโก้:", ", ".join(found) if found else "ยังไม่มีไฟล์โลโก้ใน prototypes/logos/")
