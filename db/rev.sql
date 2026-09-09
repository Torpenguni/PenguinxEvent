/* ตัวนับรอบการบันทึกของแต่ละงาน
   การบันทึกจาก /app คือลบทั้งงานแล้วเขียนใหม่ทั้งก้อน ถ้าสองคนเปิดงานเดียวกันแล้วแก้พร้อมกัน
   คนที่กดทีหลังจะทับงานของคนแรกจนหมดโดยไม่มีอะไรเตือน
   ฝั่งหน้าเว็บจึงต้องส่งเลขรอบที่ตัวเองอ่านไปกลับมาด้วย ถ้าไม่ตรงกับในฐานข้อมูลแปลว่ามีคนแก้คั่น
   เซิร์ฟเวอร์ปฏิเสธและให้โหลดของใหม่ก่อน ดีกว่าเขียนทับเงียบ ๆ */
alter table event add column if not exists rev        bigint not null default 1;
alter table event add column if not exists updated_at timestamptz;
alter table event add column if not exists updated_by bigint references app_user(id);
