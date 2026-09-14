/* ตารางนัดเจรจาของ hosted buyer program
   ทีมคีย์ความต้องการเองทั้งหมดในเฟสแรก ยังไม่เปิดให้ผู้ซื้อหรือผู้ออกบูธกดเอง

   ทุกตารางในนี้ผูกกับงานด้วย code ไม่ใช่ event_id อย่างเดียว
   และฝั่งผู้ออกบูธอ้างด้วย "ชื่อบริษัท" ไม่ใช่ deal_id
   เพราะการบันทึกทั้งงานสั่ง delete from event แล้วสร้างใหม่ ดีลกับบูธได้ id ใหม่ทุกครั้ง
   ตารางนัดที่อ้าง deal_id จะขาดตอนทันทีที่มีคนขยับบูธแล้วกดบันทึก
   เหตุผลเดียวกับ deal_stage_log และ buyer ที่แยกออกมาก่อนหน้านี้

   on delete set null ไม่ใช่ cascade ทุกจุดที่ชี้ไป event
   ยกเว้นที่ชี้ไป buyer ซึ่ง cascade ถูกแล้ว ลบคนออกจากโปรแกรมก็ต้องไม่เหลือนัดค้าง */

/* ---------- ช่วงเวลานัด ---------- */
/* หนึ่งแถวคือหนึ่งช่วงเวลาของทั้งงาน ไม่ผูกกับที่นัด
   ช่วงเดียวกันมีหลายนัดพร้อมกันได้ตามจำนวนโต๊ะและบูธที่เปิดรับ
   เก็บ break ไว้ในตารางเดียวกันเพื่อให้ตารางที่พิมพ์ออกมามีช่องพักคั่นตามจริง */
create table if not exists meeting_slot (
  id         bigserial primary key,
  event_id   bigint references event(id) on delete set null,
  code       text not null,                  -- รหัสงาน ใช้ต่อสายกลับหลังบันทึกทั้งงาน
  on_date    date,
  day_no     int,
  starts_at  time not null,
  minutes    int not null default 30,
  kind       text not null default 'meeting' check (kind in ('meeting','break')),
  sort       int not null default 0,
  created_at timestamptz not null default now(),
  unique (code, on_date, starts_at)
);
create index if not exists meeting_slot_code_idx on meeting_slot (code, on_date, starts_at);

/* ---------- ที่นัด ---------- */
/* นัดเกิดได้สองแบบ โต๊ะเจรจากลางที่มีจำนวนจำกัด กับที่บูธของผู้ออกบูธเอง
   บูธเก็บเป็นรหัสบูธ ไม่ใช่ booth_id ด้วยเหตุผลเดียวกับที่เขียนไว้ข้างบน
   zone ใช้คิดเวลาเดินระหว่างนัด ผู้ซื้อที่นัดติดกันคนละโซนต้องเว้นหนึ่งช่วง */
create table if not exists meeting_place (
  id         bigserial primary key,
  event_id   bigint references event(id) on delete set null,
  code       text not null,
  place_code text not null,                  -- T01 หรือรหัสบูธ A11
  kind       text not null default 'table' check (kind in ('table','booth')),
  booth_code text,
  zone       text,
  company    text,                           -- บูธของใคร ใช้เฉพาะ kind = booth
  seats      int not null default 2,
  active     boolean not null default true,
  note       text,
  sort       int not null default 0,
  unique (code, place_code)
);

/* ---------- ใครอยากเจอใคร ---------- */
/* side บอกว่าใครเป็นคนขอ ผู้ซื้อขอเจอบูธ หรือบูธขอเจอผู้ซื้อ
   น้ำหนักต่างกัน และเวลาทีมอธิบายให้ลูกค้าฟังต้องบอกได้ว่าใครเป็นคนเลือกใครก่อน
   exclude เก็บในตารางเดียวกัน เพราะ "ไม่อยากเจอ" คือข้อมูลชนิดเดียวกันที่มีน้ำหนักติดลบ */
create table if not exists match_pref (
  id         bigserial primary key,
  event_id   bigint references event(id) on delete set null,
  code       text not null,
  side       text not null check (side in ('buyer','exhibitor')),
  buyer_id   bigint references buyer(id) on delete cascade,
  company_id bigint references company(id) on delete set null,
  company    text not null,                  -- ชื่อบริษัทผู้ออกบูธ คีย์ที่อยู่ยาวกว่า deal_id
  weight     text not null check (weight in ('must','nice','exclude')),
  note       text,
  created_by bigint references app_user(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (code, side, buyer_id, company)
);
create index if not exists match_pref_code_idx on match_pref (code, buyer_id);

/* ---------- นัดหนึ่งครั้ง ---------- */
/* reason เก็บไว้ว่าเข้าคู่เพราะอะไร ทุกนัดต้องอธิบายได้โดยไม่ต้องเปิดโค้ด
   หลักเดียวกับคะแนนคัดกรองผู้ซื้อที่ไม่เก็บเลขลอย ๆ ไว้เฉย ๆ

   pinned คือนัดที่ทีมปรับมือแล้ว ตัวจับคู่รอบถัดไปห้ามแตะ
   ถ้ากดปุ่มจัดตารางใหม่แล้วของที่จัดมือไว้หาย จะไม่มีใครกล้ากดปุ่มนั้นอีก */
create table if not exists meeting (
  id            bigserial primary key,
  event_id      bigint references event(id) on delete set null,
  code          text not null,
  buyer_id      bigint references buyer(id) on delete cascade,
  company_id    bigint references company(id) on delete set null,
  company       text not null,
  slot_id       bigint references meeting_slot(id) on delete set null,
  place_id      bigint references meeting_place(id) on delete set null,
  status        text not null default 'draft' check (status in
                  ('draft','published','confirmed','declined','attended','no_show','cancelled')),
  pinned        boolean not null default false,
  score         int,
  reason        text,
  outcome       text,                        -- สรุปหลังคุย ใช้ทำรายงานให้ผู้ออกบูธ
  checked_in_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists meeting_code_idx on meeting (code, buyer_id);
/* ที่นัดหนึ่งที่ รับได้หนึ่งนัดต่อหนึ่งช่วงเวลา และคนหนึ่งคนอยู่สองที่พร้อมกันไม่ได้
   บังคับที่ฐานข้อมูล ไม่ใช่แค่ที่หน้าจอ เพราะตัวจับคู่กับการลากปรับมือเขียนคนละทาง
   ถ้ากันแค่ฝั่งหน้าจอ วันหนึ่งจะมีผู้ซื้อถือตารางที่ชนกันเดินอยู่ในงานจริง */
create unique index if not exists meeting_place_busy on meeting (slot_id, place_id)
  where slot_id is not null and place_id is not null and status <> 'cancelled';
create unique index if not exists meeting_buyer_busy on meeting (slot_id, buyer_id)
  where slot_id is not null and status <> 'cancelled';

/* ---------- สิทธิประโยชน์ ---------- */
/* เกณฑ์เป็นข้อมูล ไม่ฝังในโค้ด ทีมแก้เองได้ในหน้าจอ
   เหตุผลเดียวกับตารางสิทธิ์ผู้ใช้ใน access.md งานแต่ละงานให้ไม่เหมือนกัน
   และเงื่อนไขมักถูกแก้กลางฤดูขายตอนงบเปลี่ยน

   min_meetings นับจากนัดที่ยืนยันแล้ว ใช้ตอนออกสิทธิ์ก่อนงาน
   min_attended นับจากนัดที่เช็กอินจริง ใช้ตอนตัดสิทธิ์หลังงาน ว่างไว้คือไม่ตัด */
create table if not exists perk_rule (
  id            bigserial primary key,
  event_id      bigint references event(id) on delete set null,
  code          text not null,
  name          text not null,                -- บัตรอาหาร 2 ใบ · ที่พัก 1 คืน
  kind          text not null default 'other' check (kind in
                  ('meal','hotel','transport','ticket','other')),
  min_meetings  int not null default 0,
  min_attended  int,
  province_mode text not null default 'any' check (province_mode in ('any','in','not_in')),
  provinces     text[] not null default '{}', -- ใช้คู่กับ province_mode เท่านั้น
  qty           int not null default 1,
  unit          text,                         -- ใบ คืน เที่ยว
  unit_cost     numeric(12,2) not null default 0,
  quota         int,                          -- เพดานรวมทั้งงาน ว่างคือไม่จำกัด
  budget_cat    text,                         -- หมวดงบที่ต้นทุนไปลง
  active        boolean not null default true,
  sort          int not null default 0,
  note          text,
  created_at    timestamptz not null default now(),
  unique (code, name)
);

/* สิทธิ์ที่ออกให้รายคน แยกจากกฎ เพราะกฎเปลี่ยนได้แต่ของที่ออกไปแล้วต้องไม่เปลี่ยนตาม
   ผู้ซื้อที่ได้บัตรไปแล้วเมื่อวาน ต้องไม่ถูกถอนเพราะวันนี้ทีมขยับเกณฑ์จาก 6 เป็น 8
   qty กับ unit_cost จึงถูกคัดลอกมาเก็บไว้ที่นี่ตอนออกสิทธิ์ ไม่ได้อ่านสดจากกฎ */
create table if not exists buyer_perk (
  id          bigserial primary key,
  event_id    bigint references event(id) on delete set null,
  code        text not null,
  buyer_id    bigint references buyer(id) on delete cascade,
  rule_id     bigint references perk_rule(id) on delete set null,
  rule_name   text not null,
  qty         int not null default 1,
  unit_cost   numeric(12,2) not null default 0,
  voucher     text not null,                  -- รหัสสั้นให้ร้านหรือโรงแรมกาตอนใช้
  state       text not null default 'entitled' check (state in
                ('entitled','issued','redeemed','revoked')),
  reason      text,                           -- เหตุผลตอนตัดสิทธิ์ ไว้ใช้คัดคนปีหน้า
  issued_at   timestamptz,
  redeemed_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (code, voucher)
);
create index if not exists buyer_perk_idx on buyer_perk (code, buyer_id);

/* ---------- สิทธิ์การเข้าถึง ---------- */
/* โมดูลใหม่ ไม่ยืมสิทธิ์ deal ที่ทะเบียนผู้ซื้อใช้อยู่
   คนคุมตารางนัดกับคนขายบูธเป็นคนละหน้าที่ และเซลล์ไม่ควรขยับนัดของคนอื่นได้
   ข้อจำกัดเดิมเขียนรายชื่อโมดูลไว้ในโค้ด ต้องถอดแล้วใส่ใหม่ ไม่งั้นเพิ่มแถวไม่ได้ */
alter table role_permission drop constraint if exists role_permission_module_check;
alter table role_permission add constraint role_permission_module_check
  check (module in ('floorplan','deal','price','document','payment','budget','target',
                    'stage','marketing','exhibitor','movein','share','user','audit',
                    'timeline','match'));

insert into role_permission (role, module, level, scope) values
  ('admin','match','write','all'),
  ('operations','match','write','all'),
  ('exec','match','read','all'),
  ('sales','match','read','all')
on conflict (role, module) do nothing;
