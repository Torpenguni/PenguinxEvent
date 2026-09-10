"""สร้างชุดข้อมูลสมมติสำหรับเดโมสาธารณะ

เดโมที่เปิดให้ใครก็เข้าดูได้ ต้องไม่มีชื่องานจริง ชื่อลูกค้าจริง ราคาจริง เป้าจริง
หรือชื่อคนในทีมอยู่เลย ไฟล์นี้อ่าน demo.json แล้วเขียน demo.public.json
โดยแทนที่ทุกชื่อด้วยของสมมติและปรับตัวเลขเงินด้วยตัวคูณ

หลักการ ชื่อเดียวกันต้องได้ของสมมติตัวเดิมทุกที่ ไม่งั้นบูธกับดีลจะไม่ตรงกัน
ใช้ hash ของชื่อเดิมเลือกจากคลังชื่อ ผลจึงเหมือนกันทุกครั้งที่ build
ไม่ใช่สุ่มใหม่ ไม่งั้น git diff จะเปลี่ยนทั้งไฟล์ทุกครั้ง

รัน: python3 anonymize.py
"""
import json, hashlib, re

MUL = 1.37          # ตัวคูณเงิน ทำให้ตัวเลขไม่ใช่ของจริงแต่ยังสมจริง

PRE = ["ศรีมงคล","ไทยรุ่งเรือง","บูรพา","นครหลวง","เจริญชัย","สยามพัฒน์","ภูมิใจ",
       "รวมมิตร","ทวีทรัพย์","แสงทอง","มั่นคง","ปิ่นทอง","วารีทิพย์","อุดมชัย",
       "กิตติพงศ์","เพชรรัตน์","ชัยมงคล","ธาราทิพย์","บ้านไร่","ลานนา"]
SUF = ["ฟู้ดส์","เบเกอรี่","แพ็คเกจจิ้ง","อุตสาหกรรมอาหาร","เครื่องดื่ม","คอฟฟี่",
       "แมชชีนเนอรี่","เทรดดิ้ง","ซัพพลาย","กรุ๊ป","อินเตอร์เทรด","โฮลดิ้ง"]
EN  = ["Brightline","Northgate","Evermill","Saltwood","Copperline","Fernbrook",
       "Harborview","Ironleaf","Summit Row","Pinehurst","Clearwater","Stonebridge",
       "Redpoint","Silverpine","Westbay","Oakfield","Longmere","Halcyon"]
ENS = ["Foods","Coffee","Supply","Systems","Machinery","Trading","Packaging",
       "Beverages","Kitchen","Labs","Partners","Works"]
FIRST = ["ณัฐพล","ศิริพร","ธนกร","ปวีณา","กิตติศักดิ์","อรุณี","วชิรวิทย์","พิมพ์ชนก",
         "สหรัฐ","เมธาวี","จิรายุ","ณิชากร","อดิศร","สุพรรณี","ภาคิน","กัลยา"]
LAST  = ["วงศ์สุวรรณ","ศรีสมบัติ","ใจดีงาม","พงษ์เจริญ","ธนวัฒน์","แก้วมณี",
         "อินทรสุวรรณ","บวรรัตน์","เรืองฤทธิ์","สุขสมบูรณ์"]
NICK  = ["ฟ้า","ตาล","โบว์","กัน","เจ","พีท","หนึ่ง","ขวัญ","ต้น","แนท"]

def pick(pool, key, salt=""):
    h = int(hashlib.sha256((salt + str(key)).encode()).hexdigest(), 16)
    return pool[h % len(pool)]

def company(name):
    """ชื่อบริษัทสมมติ ภาษาไทยหรืออังกฤษตามของเดิม เพื่อให้หน้าตาชุดข้อมูลไม่เปลี่ยน"""
    if not name: return name
    thai = bool(re.search(r'[฀-๿]', name))
    if thai:
        return pick(PRE, name, "p") + " " + pick(SUF, name, "s")
    return pick(EN, name, "e") + " " + pick(ENS, name, "es")

def person(name):
    if not name: return name
    return "คุณ" + pick(NICK, name, "n") + " " + pick(FIRST, name, "f")

def money(v):
    if not isinstance(v, (int, float)) or isinstance(v, bool) or not v: return v
    return round(v * MUL / 100) * 100 if abs(v) >= 1000 else round(v * MUL)

EVENT = {
  "restech": {"name": "Northbridge Food & Restaurant Expo", "short": "Northbridge Expo 2027",
              "brands": ["Northbridge Food", "Restaurant Forum"],
              "venue": "ศูนย์แสดงสินค้าเมืองใหม่ ฮอลล์ 6–7"},
  "cafcon":  {"name": "Coffee Circle & Maker Fair", "short": "Coffee Circle 2026",
              "brands": ["Coffee Circle", "Maker Fair"],
              "venue": "ศูนย์การค้าริมน้ำ ฮอลล์ใหญ่"},
}
# ชื่อแพ็กเกจกับเวทีมีชื่อแบรนด์จริงปนอยู่ เปลี่ยนตามตารางนี้
PKG = {"Restech": "Foodtech", "Martech": "Retailtech"}
STG = {"Food Solution Workshop": "Kitchen Workshop Stage",
       "Fairhaven Stage": "Riverside Stage",
       "TRC Main Stage": "Main Forum Stage"}

def clean_text(t):
    """กวาดชื่อจริงที่ฝังอยู่ในข้อความอิสระ เช่นชื่อรายการงบที่มีชื่อสถานที่"""
    if not isinstance(t, str) or not t: return t
    for a, b in (("Restech", "Northbridge"), ("RESTECH", "NORTHBRIDGE"),
                 ("Thailand Restaurant Conference", "Restaurant Forum"),
                 ("TRC", "NBF"), ("CafCon", "Coffee Circle"), ("Damn Expo", "Maker Fair"),
                 ("ศูนย์แสดงสินค้า", "ศูนย์แสดงสินค้าเมืองใหม่"),
                 ("MCC Hall", "ฮอลล์ใหญ่"), ("Martech", "Retailtech")):
        t = t.replace(a, b)
    return t

D = json.load(open('demo.json', encoding='utf-8'))

# ชื่อคนในทีมขาย เป็นชื่อเล่นของคนจริง เปลี่ยนทั้งชุดและจำการจับคู่ไว้ใช้ต่อ
repmap = {}
pool = list(NICK)
for r in D.get('reps', []):
    if r['name'] in ('Free',):            # ไม่ใช่ชื่อคน เป็นป้ายบอกว่าบูธแจกฟรี
        repmap[r['name']] = r['name']; continue
    # แจกจากคลังแบบไม่ซ้ำ เรียงตามลำดับที่ปรากฏ ผลคงที่ทุกครั้งที่ build
    repmap[r['name']] = pool.pop(0) if pool else 'คนที่ ' + str(len(repmap))
    r['name'] = repmap[r['name']]
    if r.get('th'): r['th'] = pick(FIRST, r['th'], "repth")
rep = lambda v: repmap.get(v, v) if v else v

for e in D['events']:
    m = EVENT.get(e['id'], {})
    e['name']   = m.get('name', clean_text(e['name']))
    e['short']  = m.get('short', clean_text(e.get('short')))
    e['brands'] = m.get('brands', [clean_text(b) for b in (e.get('brands') or [])])
    e['venue']  = m.get('venue', clean_text(e.get('venue')))
    e['target'] = money(e.get('target'))
    e['target_note'] = clean_text(e.get('target_note'))
    if isinstance(e.get('manual'), dict):
        e['manual']['name'] = clean_text(e['manual'].get('name'))

    # รายชื่อคนขายที่ผูกกับงานนี้ เก็บเป็นลิสต์ของชื่อ ต้องแปลงด้วย ไม่ใช่แค่ในบูธกับดีล
    if isinstance(e.get('sales'), list):
        e['sales'] = [rep(x) for x in e['sales']]

    e['zoneNames'] = {k: clean_text(v) for k, v in (e.get('zoneNames') or {}).items()}
    e['stages'] = [STG.get(s, clean_text(s)) for s in (e.get('stages') or [])]
    e['packages'] = {PKG.get(k, k): v for k, v in (e.get('packages') or {}).items()}
    for k, p in (e['packages'] or {}).items():
        if isinstance(p, dict) and 'price' in p: p['price'] = money(p['price'])
    e['addons'] = [[clean_text(a[0]), money(a[1])] if isinstance(a, list) and len(a) > 1 else a
                   for a in (e.get('addons') or [])]
    e['catTotals'] = {clean_text(k): money(v) for k, v in (e.get('catTotals') or {}).items()}

    # ชื่อบล็อกบนผัง บางอันเป็นชื่อบริษัทที่เช่าพื้นที่ บางอันเป็นป้ายโซน
    for a in (e.get('areas') or []):
        t = clean_text(a.get('name'))
        a['name'] = t if (t or '').isupper() or 'ผู้จัด' in (t or '') or 'STAGE' in (t or '') \
                    else company(t)

    for b in e['booths']:
        b['name'] = company(b.get('name'))
        b['co']   = company(b.get('co'))
        b['sales'] = rep(b.get('sales'))
        b['pkg']  = PKG.get(b.get('pkg'), b.get('pkg'))
        b['list'] = money(b.get('list'))
        b['contact'] = person(b.get('contact'))
        if b.get('phone'): b['phone'] = "08" + str(pick(list("1234567890"), b['phone'])) + "-xxx-xxxx"
        if b.get('email'): b['email'] = "contact@example.co.th"

    for d in e['deals']:
        d['co'] = company(d.get('co'))
        d['sales'] = rep(d.get('sales'))
        d['pkg'] = PKG.get(d.get('pkg'), d.get('pkg'))
        d['list'] = money(d.get('list'))
        d['contact'] = person(d.get('contact'))
        d['next'] = clean_text(d.get('next'))
        if d.get('phone'): d['phone'] = "08x-xxx-xxxx"
        if d.get('email'): d['email'] = "contact@example.co.th"
        for p in (d.get('people') or []):
            p['n'] = person(p.get('n'))
            if p.get('tel'):  p['tel'] = "08x-xxx-xxxx"
            if p.get('mail'): p['mail'] = "contact@example.co.th"
            if p.get('line'): p['line'] = "example-line"
            p['card'] = None                      # รูปนามบัตรของจริง ตัดออกทั้งหมด
        for a in (d.get('acts') or []):
            a['note'] = clean_text(a.get('note'))
        d['bill'] = {}                            # ข้อมูลนิติบุคคล ไม่เอาไปไว้ในเดโมเลย

    for l in e['budget']:
        l['cat'] = clean_text(l.get('cat')); l['sub'] = clean_text(l.get('sub'))
        l['name'] = clean_text(l.get('name'))
        for k in ('price', 'fc', 'ac'): l[k] = money(l.get(k))
        if l.get('sup'): l['sup'] = company(l['sup'])
        if l.get('phone'): l['phone'] = "08x-xxx-xxxx"

    for s in e['sessions']:
        s['stage'] = STG.get(s.get('stage'), clean_text(s.get('stage')))
        s['title'] = clean_text(s.get('title'))
        s['mod'] = person(s.get('mod'))
        for p in (s.get('people') or []):
            p['n'] = person(p.get('n'))
            if p.get('org'): p['org'] = company(p['org'])
            if p.get('contact'): p['contact'] = "08x-xxx-xxxx"
            p['coord'] = person(p.get('coord'))

    for t in (e.get('timeline') or []):
        t['name'] = clean_text(t.get('name'))
        if t.get('note'): t['note'] = clean_text(t['note'])
        if t.get('by'): t['by'] = rep(t['by'])

json.dump(D, open('demo.public.json', 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
print('เขียน demo.public.json แล้ว')
