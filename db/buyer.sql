/* ทะเบียนผู้ซื้อสำหรับ hosted buyer program
   ฝั่งผู้เข้าชมงานยังไม่มีอะไรในระบบเลย มีแค่จำนวนบัตรที่ขายได้เป็นตัวเลขเดียว
   ตารางนี้เก็บเฉพาะคนที่จะเชิญเข้าโปรแกรม ไม่ใช่ผู้เข้าชมทั้งหมด
   ผู้เข้าชมหนึ่งหมื่นคนอยู่ที่ Odoo ตามเดิม ที่นี่เก็บหลักร้อยที่คัดมาแล้ว

   ช่องข้อมูลตั้งตามที่ Odoo เก็บอยู่จริง ตำแหน่ง จังหวัด จุดประสงค์ เปิดร้านหรือยัง
   จะได้ดึงเข้ามาตรง ๆ ทีหลังโดยไม่ต้องแปลงหรือย้ายข้อมูลอีกรอบ

   ผูกกับ event ด้วย on delete set null และเก็บ code ไว้ต่อสายกลับ
   เพราะการบันทึกทั้งงานลบแถว event แล้วสร้างใหม่ บทเรียนจากชุดสำรองและประวัติขั้นตอน */
create table if not exists buyer (
  id          bigserial primary key,
  event_id    bigint references event(id) on delete set null,
  code        text not null,                  -- รหัสงาน ใช้ต่อสายกลับหลังบันทึกทั้งงาน
  name        text not null,
  company     text,
  position    text,                           -- ตำแหน่ง ใช้ประเมินอำนาจตัดสินใจ
  province    text,
  purpose     text,                           -- จุดประสงค์ของการมา ใช้ประเมินความตั้งใจซื้อ
  has_shop    boolean,                        -- เปิดร้านแล้วหรือยัง
  branches    integer,                        -- จำนวนสาขา ใช้ประเมินขนาด
  budget_band text,                           -- ช่วงงบต่อปี
  interests   text[] default '{}',            -- หมวดสินค้าที่สนใจ ใช้จับคู่กับบูธทีหลัง
  email       text,
  phone       text,
  status      text not null default 'applied',-- applied qualified invited confirmed attended declined
  note        text,
  source      text,                           -- มาจากไหน odoo / กรอกเอง / นำเข้าไฟล์
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists buyer_event_idx on buyer (event_id, status);
create index if not exists buyer_code_idx  on buyer (code);
