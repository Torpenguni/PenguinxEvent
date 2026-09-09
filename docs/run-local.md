# รันระบบบนเครื่องตัวเอง

## ครั้งแรก

```bash
# 1. ฐานข้อมูล (ต้องเปิด Docker Desktop ก่อน)
docker run -d --name pxe-db -e POSTGRES_PASSWORD=pxe -e POSTGRES_USER=pxe \
  -e POSTGRES_DB=pxe -p 55432:5432 postgres:16-alpine

# 2. ลงโครงสร้างตาราง
docker cp db/schema.sql pxe-db:/tmp/schema.sql
docker exec pxe-db psql -U pxe -d pxe -f /tmp/schema.sql

# 3. นำเข้าข้อมูลจากไฟล์ต้นแบบ
node scripts/import_json.mjs prototypes/app4.json

# 4. รัน API
node apps/api/src/index.js
```

`.env` มีอยู่แล้วในโปรเจกต์ ชี้ไปที่ฐานข้อมูลบนเครื่อง **ห้าม commit ไฟล์นี้**

## ครั้งต่อไป

```bash
docker start pxe-db
node apps/api/src/index.js
```

## บัญชีตั้งต้น

รหัสผ่านชั่วคราวเหมือนกันหมดคือ `pxe-setup-2027` และระบบตั้งค่า
`must_change_password` ไว้ทุกบัญชี ต้องเปลี่ยนตอนเข้าครั้งแรกเมื่อทำหน้าล็อกอินจริง

| อีเมล | บทบาท |
|---|---|
| `admin@penguinx.local` | ผู้ดูแลระบบ |
| `exec@penguinx.local` | ผู้บริหาร รวมงานบัญชีการเงินเดิม |
| `operations@penguinx.local` | ปฏิบัติการ รวมงานการตลาดเดิม |
| ชื่อเซลล์แต่ละคน เช่น `snoox@penguinx.local` | เซลล์ ผูกกับดีลของตัวเอง |

## ตรวจว่าใช้ได้

```bash
curl localhost:4000/api/health
curl -X POST localhost:4000/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"admin@penguinx.local","password":"pxe-setup-2027"}'
```

## นำเข้าข้อมูลใหม่

`import_json.mjs` ลบข้อมูลของงานที่มี `code` เดียวกันทิ้งก่อนแล้วใส่ใหม่
ไม่แตะงานอื่น รันซ้ำได้ปลอดภัย

## โหมดต่อเซิร์ฟเวอร์จริง

`python3 build.py` ในโฟลเดอร์ prototypes สร้างสามไฟล์

| ไฟล์ | ข้อมูล | ใช้ตอนไหน |
|---|---|---|
| `dist/index.html` | ฝังชุดจริงในไฟล์ | ดูออฟไลน์ ไม่ต้องมีเซิร์ฟเวอร์ |
| `dist/demo.html` | ฝังชุดสมมติ | ส่งให้คนนอกทีมดู |
| `dist/live.html` | **ไม่ฝังเลย** | ต่อ API ล็อกอินจริง ทุกคนใช้ข้อมูลชุดเดียวกัน |

`live.html` ตั้ง `window.PXE_API` ไว้ที่ `http://localhost:4000` เปลี่ยนได้ด้วย

```bash
PXE_API=https://api.example.com python3 build.py
```

โดเมนที่หน้าเว็บอยู่ ต้องใส่ใน `WEB_ORIGIN` ของ `.env` ด้วย ไม่งั้นเบราว์เซอร์บล็อก

ในโหมดนี้ **บทบาทมาจากบัญชี ไม่ได้เลือกเอง** ตัวเลือกบทบาทกับตัวสลับบทบาทถูกซ่อน
และทุกการแก้จะถูกส่งขึ้นเซิร์ฟเวอร์อัตโนมัติ ถ้าส่งไม่สำเร็จจะเก็บไว้ในเบราว์เซอร์ก่อน
