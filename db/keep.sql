/* ตารางที่ไม่ได้ถูกเขียนใหม่ตอนบันทึกทั้งงาน ต้องไม่ถูกลบตามแถว event ไปด้วย
   การบันทึกทั้งงานคือลบแถว event แล้วสร้างใหม่ ทุกตารางที่ผูกแบบ cascade จึงถูกล้างทิ้งไปด้วย
   ชุดสำรองข้อมูลหายทั้งชุดทุกครั้งที่มีคนกดบันทึก ซึ่งทำให้ระบบสำรองไม่มีความหมายเลย
   ชุดสำรองอ้างอิงด้วย code อยู่แล้ว ตัดสายที่ทำให้ถูกลบตามออก */
alter table event_backup drop constraint if exists event_backup_event_id_fkey;
alter table event_backup add  constraint event_backup_event_id_fkey
  foreign key (event_id) references event(id) on delete set null;
-- ต่อสายกลับให้ชุดที่ยังกำพร้าอยู่
update event_backup b set event_id = e.id from event e
 where e.code = b.code and b.event_id is distinct from e.id;
