/* ประวัติการเปลี่ยนขั้นตอนของดีล
   ระบบรู้ว่าดีลอยู่ขั้นไหน แต่ไม่รู้ว่าอยู่มานานแค่ไหน
   ดีลที่ออกใบแจ้งหนี้ไปแล้วสองวันกับสองเดือน หน้าจอเคยหน้าตาเหมือนกันทุกอย่าง

   ผูกกับ event_id + company_id ไม่ใช่ deal_id เพราะการบันทึกทั้งงานลบแถวดีลแล้วสร้างใหม่
   แถวดีลได้ id ใหม่ทุกครั้ง ประวัติที่อ้าง deal_id จะขาดตอนทันทีที่มีคนกดบันทึก
   ส่วนบริษัทกับงานเป็นของที่อยู่ยาว ใช้อ้างอิงได้จริง

   on delete set null ไม่ใช่ cascade บทเรียนจากชุดสำรองที่หายไปทั้งชุดเพราะ cascade */
create table if not exists deal_stage_log (
  id         bigserial primary key,
  event_id   bigint references event(id)   on delete set null,
  company_id bigint references company(id) on delete set null,
  code       text not null,             -- รหัสงาน เก็บซ้ำไว้ให้ตามรอยได้แม้แถว event หาย
  company    text not null,
  stage      text not null,
  at         timestamptz not null default now()
);
create index if not exists deal_stage_log_idx on deal_stage_log (event_id, company_id, at desc);
