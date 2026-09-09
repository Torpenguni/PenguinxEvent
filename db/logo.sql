-- โลโก้ของงาน เดิมมีแต่ในไฟล์เดโมที่ฝังรูปตอน build ระบบจริงจึงแสดงได้แค่ตัวย่อ
-- เก็บเป็น path ของไฟล์ ไม่ใช่รูปในฐานข้อมูล เพราะหน้าเว็บกับ API อยู่โดเมนเดียวกัน
alter table event add column if not exists logo_url text;

-- ผูกไฟล์ที่มีอยู่แล้วกับสองงานที่นำเข้ามา อ้างด้วย code ไม่ใช่ id
-- เพราะ id ออกใหม่ทุกครั้งที่นำเข้าข้อมูลรอบใหม่
update event set logo_url = '/logos/' || code || '.png'
 where code in ('restech','cafcon') and logo_url is null;
