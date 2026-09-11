/* ผูกเซลล์ในระบบขายกับบัญชีผู้ใช้
   เซลล์เก็บอยู่ที่ sales_agent ส่วนบัญชีที่ล็อกอินได้อยู่ที่ app_user คนละตารางกัน
   ไม่มีอะไรเชื่อมกันเลย ระบบจึงไม่รู้ว่าจะส่งเมลสรุปงานค้างไปที่ไหน
   เซลล์ประเภท house เช่นบูธแจกฟรีหรือบูธส่วนกลาง ไม่ใช่คน จึงไม่ต้องผูก */
alter table sales_agent add column if not exists user_id bigint references app_user(id) on delete set null;
