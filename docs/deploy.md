# ขึ้นเซิร์ฟเวอร์

ระบบนี้มีข้อมูลลูกค้าและตัวเลขการเงินจริง **ต้องอยู่หลังล็อกอินเสมอ**
ห้ามทำเวอร์ชันเปิดสาธารณะที่ดึงจากฐานข้อมูลจริง

## ถ้าจะให้คนนอกดูหน้าตาระบบ

ใช้ `prototypes/platform-demo.html` แทน เป็นไฟล์เดียว เปิดที่ไหนก็ได้
ชื่อบริษัท ชื่อผู้ติดต่อ เบอร์โทร และตัวเลขเงินถูกแทนด้วยข้อมูลสมมติทั้งหมด
และมีแถบสีแดงบอกไว้บนหัวทุกหน้าว่าเป็นข้อมูลสมมติ

ตรวจแล้วว่าไม่มีชื่อจริง เบอร์จริง หรือชื่อสปีกเกอร์จริงหลงเหลือแม้แต่รายการเดียว

## ขึ้นจริงบน Heroku

```bash
heroku create penguinxevent
heroku addons:create heroku-postgresql:essential-0
heroku config:set JWT_SECRET="$(openssl rand -base64 32)"
heroku config:set NODE_ENV=production
git push heroku main
```

`Procfile` มี `release` phase ที่รัน `db/schema.sql` กับ `db/seed.sql` ให้อัตโนมัติทุกครั้งที่ deploy
สคีมาเขียนแบบรันซ้ำได้ (`on conflict do nothing`) จึงไม่พังถ้ารันหลายรอบ

สร้างผู้ใช้คนแรก

```bash
heroku run node scripts/create_user.js you@penguinx.co "ชื่อคุณ" admin
```

ตอน `NODE_ENV=production` ตัว API จะเสิร์ฟหน้าเว็บที่ build แล้วจากโดเมนเดียวกัน
ไม่ต้องตั้ง CORS และไม่มีปัญหาคุกกี้ข้ามโดเมน

## ก่อนเปิดให้ทีมใช้จริง ต้องทำ

- [ ] `JWT_SECRET` เป็นค่าสุ่ม ไม่ใช่ค่าใน `.env.example`
- [ ] บังคับ HTTPS (Heroku ให้มาแล้ว แต่ต้องปิดทาง http)
- [ ] ตั้ง backup ฐานข้อมูลรายวัน `heroku pg:backups:schedule`
- [ ] เปลี่ยนรหัสผ่านครั้งแรกของทุกคน (`must_change_password` มีอยู่แล้ว แต่หน้าเว็บยังไม่บังคับ)
- [ ] จำกัดจำนวน request ต่อ IP ที่ `/api/auth/login` เพิ่มจากที่นับใน `login_attempt`
- [ ] ตรวจว่า `role_permission` ตรงกับที่ทีมตกลง ก่อนเชิญคนเข้า

## ที่ยังไม่ได้ทดสอบ

เครื่องที่พัฒนาไม่มี PostgreSQL จึงยังไม่ได้รัน `schema.sql` กับ `seed.sql` จริง
รอบแรกที่รันอาจเจอ error ที่มองไม่เห็นตอนเขียน
