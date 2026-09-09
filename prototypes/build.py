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

css=open('mock_css.txt',encoding='utf-8').read()
# เคยพลาดสองรอบ เพิ่มกฎต่อท้ายไฟล์แล้วมันไปอยู่นอก </style> กฎใหม่เลยไม่ทำงานสักข้อ
assert css.count('</style>')==1, 'mock_css.txt ต้องมี </style> ตัวเดียว'
assert not css.split('</style>')[1].strip(), 'มี CSS หลุดอยู่นอก </style>'
html=open('mock_html.txt',encoding='utf-8').read()
js=open('mock_js.txt',encoding='utf-8').read()
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
    open(out,'w',encoding='utf-8').write(p); print(out,round(len(p)/1024),'KB')
    # ฉบับเอาไปวางบนโฮสต์เอง ต้องเป็นเอกสารเต็มและประกาศ charset ให้ชัด
    # ไม่งั้นเซิร์ฟเวอร์ที่ไม่ส่ง charset มาด้วย เบราว์เซอร์จะเดาผิดแล้วภาษาไทยพัง
    doc=('<!doctype html>\n<html lang="th">\n<head>\n'
         '<meta charset="utf-8">\n'
         '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
         '<meta name="robots" content="noindex,nofollow">\n'
         '</head>\n<body>\n'+p+'\n</body>\n</html>\n')
    os.makedirs('dist',exist_ok=True)
    name='index.html' if out=='platform.html' else 'demo.html'
    open(os.path.join('dist',name),'w',encoding='utf-8').write(doc)
    # ฉบับต่อเซิร์ฟเวอร์จริง ไม่ฝังข้อมูล ล็อกอินแล้วดึงจาก API
    # ข้อมูลไม่อยู่ในไฟล์ จึงเอาชุดจริงขึ้นเว็บได้โดยไม่หลุดให้คนที่ยังไม่ล็อกอิน
    if out=='platform.html':
        api=os.environ.get('PXE_API','http://localhost:4000')
        thin=json.dumps({'events':[],'reps':[],'template':D.get('template',[]),
                         'timelineTemplate':D.get('timelineTemplate',[])},ensure_ascii=False)
        live=css+'\n'+html+'\n'+js.replace('__DATA__',thin)
        open(os.path.join('dist','live.html'),'w',encoding='utf-8').write(
          '<!doctype html>\n<html lang="th">\n<head>\n<meta charset="utf-8">\n'
          '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
          '<meta name="robots" content="noindex,nofollow">\n'
          '<script>window.PXE_API=%s</script>\n'
          '</head>\n<body>\n'%json.dumps(api)+live+'\n</body>\n</html>\n')
print("ฝังโลโก้:", ", ".join(found) if found else "ยังไม่มีไฟล์โลโก้ใน prototypes/logos/")
