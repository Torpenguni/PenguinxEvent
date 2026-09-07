-- penguinxevent — โครงฐานข้อมูล
-- ออกแบบจากชีตที่ทีมใช้จริง ดูที่มาของทุกตารางได้ใน docs/schema.md
-- PostgreSQL 14+

begin;

-- ---------------------------------------------------------------- คน & องค์กร

create table app_user (
  id          bigserial primary key,
  email       text not null unique,
  name        text not null,
  role        text not null check (role in
                ('admin','sales','sales_lead','marketing','operations','finance','viewer')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table company (
  id              bigserial primary key,
  name            text not null,
  name_th         text,
  tax_id          text,
  address         text,
  industry        text,
  peak_contact_id text,                  -- id ฝั่ง PEAK เก็บไว้กันสร้างซ้ำ
  note            text,
  created_at      timestamptz not null default now()
);
create unique index company_tax_id_key on company (tax_id) where tax_id is not null;

create table contact_person (
  id         bigserial primary key,
  company_id bigint not null references company on delete cascade,
  name       text not null,
  position   text,
  phone      text,
  email      text,
  line_id    text,
  is_primary boolean not null default false
);

create table supplier (
  id         bigserial primary key,
  name       text not null,
  category   text,                       -- สถานที่ / โครงสร้าง / เวที / สื่อ / อาหาร
  contact    text,
  phone      text,
  note       text
);

-- ---------------------------------------------------------------- งาน

create table event (
  id            bigserial primary key,
  code          text not null unique,    -- restech-2026
  name          text not null,
  edition_year  int  not null,
  venue         text,
  hall          text,
  start_date    date,
  end_date      date,
  move_in_from  date,
  move_out_to   date,
  status        text not null default 'planning'
                  check (status in ('planning','selling','onsite','closed','archived')),
  revenue_goal  numeric(14,2),
  cloned_from   bigint references event,  -- ปีหน้าโคลนจากปีนี้
  created_at    timestamptz not null default now()
);

-- งานที่จัดคู่กันในฮอลล์เดียว เช่น Restech กับ ตั้งตัว ใช้ผังเดียวแต่แยกบัญชี
create table event_brand (
  id       bigserial primary key,
  event_id bigint not null references event on delete cascade,
  code     text not null,
  name     text not null,
  unique (event_id, code)
);

create table zone (
  id       bigserial primary key,
  event_id bigint not null references event on delete cascade,
  brand_id bigint references event_brand on delete set null,
  code     text not null,               -- A, B, D, F, N, S, G, P, T
  name     text not null,               -- Food Zone, Restaurant Service, Silver Sponsor
  colour   text,                        -- สีบนผัง
  sort     int not null default 0,
  unique (event_id, code)
);

-- ---------------------------------------------------------------- บูธ

create table booth_type (
  id           bigserial primary key,
  event_id     bigint not null references event on delete cascade,
  code         text not null,           -- title, platinum, gold, silver, std3x3, std3x3c, food2x2
  name         text not null,
  tier         text not null check (tier in ('sponsor','standard','food','internal')),
  build        text not null check (build in ('raw_space','shell_scheme')),
  width_m      numeric(6,2) not null,
  depth_m      numeric(6,2) not null,
  sqm          numeric(8,2) generated always as (width_m * depth_m) stored,
  list_price   numeric(12,2) not null,  -- ราคาตั้ง ไม่ใช่ราคาที่ขายได้จริง
  build_cost   numeric(12,2) not null default 0,  -- ต้นทุนสร้าง เช่น shell scheme 2,500
  unique (event_id, code)
);

create table booth (
  id            bigserial primary key,
  event_id      bigint not null references event on delete cascade,
  zone_id       bigint references zone on delete set null,
  booth_type_id bigint references booth_type on delete set null,
  code          text not null,          -- A11, S13, G4, N27
  label         text,                   -- ชื่อที่พิมพ์บนผัง ถ้าต่างจาก code
  -- พิกัดบนผัง เก็บเป็นกริดเหมือนที่วาดในชีตทุกวันนี้ 1 ช่อง = 1 หน่วย
  grid_x        int, grid_y int, grid_w int default 1, grid_h int default 1,
  is_corner     boolean not null default false,
  status        text not null default 'available' check (status in
                  ('available','held','contracted','deposit_paid','paid','blocked')),
  blocked_as    text,                   -- ทางเดิน เวที ห้องน้ำ จุดล้างจาน กองอำนวยการ
  note          text,
  unique (event_id, code)
);
create index booth_status_idx on booth (event_id, status);

-- ---------------------------------------------------------------- การขาย

create table addon (
  id         bigserial primary key,
  event_id   bigint not null references event on delete cascade,
  code       text not null,             -- mc_onground, photo, video, speaker_session
  name       text not null,
  list_price numeric(12,2) not null,
  unique (event_id, code)
);

create table deal (
  id            bigserial primary key,
  event_id      bigint not null references event on delete cascade,
  brand_id      bigint references event_brand on delete set null,
  company_id    bigint not null references company,
  owner_id      bigint references app_user,        -- เซลล์เจ้าของดีล
  kind          text not null check (kind in ('booth','sponsor','ticket','other')),
  -- ชื่อสถานะตามผังกระบวนการขายที่ทีมเขียนไว้
  -- lead -> booking -> quoted -> confirmed -> billed -> paid
  status        text not null default 'lead' check (status in
                  ('lead','booking','quoted','confirmed','billed','paid',
                   'lost','cancelled')),
  lost_reason   text,

  -- แกนของเรื่อง ราคาตั้งกับราคาที่ขายได้จริง แยกกันเสมอ
  list_total    numeric(14,2) not null default 0,
  deal_total    numeric(14,2) not null default 0,
  settlement    text not null default 'cash' check (settlement in
                  ('cash','barter','free','partial_barter')),
  barter_note   text,                   -- แลกอะไร ตีมูลค่าเท่าไหร่
  conditions    text,                   -- เงื่อนไขพิเศษที่ตกลงไว้
  commission_rate numeric(5,2) not null default 0,   -- 10 หรือ 15

  hold_expires_at   timestamptz,        -- จองไว้ถึงเมื่อไหร่ ไม่จ่ายมัดจำแล้วปล่อยคืน
  contract_sent_at  timestamptz,
  contract_signed_at timestamptz,
  won_at            timestamptz,

  -- ของที่ต้องเก็บจากผู้ออกบูธ ชีตลิสต์ลูกค้าติดตามสามอย่างนี้อยู่แล้ว
  key_product        text,
  form_received      boolean not null default false,   -- ส่งฟอร์มแล้วหรือยัง
  logo_url           text,
  on_directory_board boolean not null default false,

  peak_contact_id   text,
  peak_quotation_id text,
  peak_invoice_id   text,

  created_by  bigint references app_user,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index deal_event_status_idx on deal (event_id, status);
create index deal_owner_idx on deal (owner_id);

-- ดีลหนึ่งใบมีได้หลายบรรทัด บูธสามช่องติดกัน บวกวิดีโอ บวกสิทธิ์พูดบนเวที
create table deal_item (
  id          bigserial primary key,
  deal_id     bigint not null references deal on delete cascade,
  item_type   text not null check (item_type in ('booth','sponsor_package','addon','ticket','other')),
  booth_id    bigint references booth on delete restrict,
  addon_id    bigint references addon on delete restrict,
  description text,
  qty         numeric(10,2) not null default 1,
  list_unit_price numeric(12,2) not null default 0,
  unit_price      numeric(12,2) not null default 0,
  amount      numeric(14,2) generated always as (qty * unit_price) stored
);
-- บูธหนึ่งช่องขายซ้ำสองดีลไม่ได้ ถ้าดีลยังไม่ถูกยกเลิก
create unique index deal_item_booth_once on deal_item (booth_id) where booth_id is not null;

create table payment (
  id          bigserial primary key,
  deal_id     bigint not null references deal on delete cascade,
  kind        text not null check (kind in ('deposit','balance','instalment','refund')),
  due_date    date,
  amount      numeric(14,2) not null,
  paid_at     date,
  method      text,
  reference   text,                     -- เลขสลิป
  peak_payment_id text,
  peak_receipt_id text,
  note        text
);
create index payment_due_idx on payment (due_date) where paid_at is null;

-- สิทธิประโยชน์ที่สัญญากับสปอนเซอร์ ต้องเช็กได้ว่าส่งมอบครบมั้ย
create table sponsor_benefit (
  id           bigserial primary key,
  deal_id      bigint not null references deal on delete cascade,
  benefit      text not null,           -- โลโก้บนแบ็คดรอป โพสต์เฟซบุ๊ก 1 โพสต์หลังงาน
  channel      text,
  due_date     date,
  delivered_at date,
  owner_id     bigint references app_user,
  evidence_url text
);

-- คิวรอบูธเดียวกัน ผังกระบวนการเขียนไว้เป็น Que 1 -> Que 2 -> Que 3,4,5
-- บูธดีๆ มีคนอยากได้พร้อมกันหลายเจ้า วันนี้คิวอยู่ในหัวเซลล์
-- พอคนแรกไม่จ่ายมัดจำตามกำหนด ต้องรู้ทันทีว่าโทรหาใครต่อ
create table booth_queue (
  id         bigserial primary key,
  booth_id   bigint not null references booth on delete cascade,
  deal_id    bigint not null references deal on delete cascade,
  position   int not null,                -- 1 คือคนที่ถือสิทธิ์อยู่
  status     text not null default 'waiting' check (status in
               ('waiting','promoted','dropped','expired')),
  created_at timestamptz not null default now(),
  note       text,
  unique (booth_id, deal_id)
);
create index booth_queue_idx on booth_queue (booth_id, position)
  where status = 'waiting';

-- เอกสารตามลำดับที่ทีมออกจริง
-- ใบเสนอราคา -> ใบวางบิล -> ใบกำกับภาษี
-- แยกจากตาราง payment เพราะหนึ่งใบวางบิลครอบได้หลายงวด
create table document (
  id         bigserial primary key,
  deal_id    bigint not null references deal on delete cascade,
  kind       text not null check (kind in
               ('quotation','booking_form','billing_note','tax_invoice','receipt')),
  number     text,                        -- เลขที่เอกสาร
  issued_on  date,
  due_on     date,
  amount     numeric(14,2),
  status     text not null default 'draft' check (status in
               ('draft','issued','sent','paid','void')),
  peak_id    text,                        -- เลขอ้างอิงฝั่ง PEAK
  file_url   text,
  created_by bigint references app_user,
  created_at timestamptz not null default now()
);
create index document_deal_idx on document (deal_id, kind);

-- ---------------------------------------------------------------- เวทีสัมมนา

create table stage (
  id       bigserial primary key,
  event_id bigint not null references event on delete cascade,
  code     text not null,               -- main, super, workshop, pitching
  name     text not null,               -- TRC Main Stage, SUPER Stage
  kind     text not null default 'talk'
             check (kind in ('talk','workshop','pitching','demo')),
  location text,                        -- ตำแหน่งในฮอลล์ ผูกกับผังได้ทีหลัง
  capacity int,
  sort     int not null default 0,
  unique (event_id, code)
);

-- คนที่ขึ้นเวที สปีกเกอร์ ผู้ดำเนินรายการ พิธีกร ใช้ตารางเดียวกัน
-- เพราะคนคนเดียวเป็นได้หลายบทบาทข้ามงาน
create table person (
  id         bigserial primary key,
  nickname   text not null,             -- ชื่อที่ทีมใช้เรียก "พี่ต่อเพนกวิน"
  name_th    text,                      -- ชื่อจริงสำหรับสไลด์และสูจิบัตร
  name_en    text,
  title      text,                      -- ตำแหน่ง
  company    text,
  phone      text,
  email      text,
  line_id    text,
  photo_url  text,
  logo_url   text,                      -- โลโก้แบรนด์ของสปีกเกอร์
  company_id bigint references company on delete set null,
  default_fee numeric(12,2),
  note       text,
  created_at timestamptz not null default now()
);
create index person_nickname_idx on person (nickname);

create table session (
  id         bigserial primary key,
  event_id   bigint not null references event on delete cascade,
  stage_id   bigint not null references stage on delete cascade,
  day_no     int,
  on_date    date,
  starts_at  time,
  ends_at    time,
  minutes    int,
  seq        int,                        -- เลข Session ของเวทีนั้นในวันนั้น
  kind       text not null default 'talk' check (kind in
               ('talk','keynote','panel','roundtable','workshop','demo','pitch',
                'ceremony','open','close','break','networking','registration')),
  title      text,
  title_confirmed boolean not null default false,   -- คอลัมน์ CF ชื่อหัวข้อ
  -- เวลาถูกล็อกแล้วหรือยัง แยกจากสถานะของสปีกเกอร์
  -- ชีตแยกสองคอลัมน์นี้ไว้ เพราะตอบรับแล้วแต่ยังไม่ล็อกเวลาเป็นเรื่องปกติ
  time_locked boolean not null default false,
  -- session ที่ขายเป็นส่วนหนึ่งของแพ็กเกจสปอนเซอร์ ผูกกลับไปที่ดีล
  deal_id    bigint references deal on delete set null,
  slides_url text,
  slides_received boolean not null default false,
  remark     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index session_stage_idx on session (stage_id, day_no, starts_at);
create index session_deal_idx on session (deal_id) where deal_id is not null;

-- หนึ่ง session มีได้หลายคน ชีตปี 2026 มี 32 จาก 137 session ที่เกินหนึ่งคน
create table session_person (
  id          bigserial primary key,
  session_id  bigint not null references session on delete cascade,
  person_id   bigint not null references person on delete restrict,
  role        text not null check (role in ('speaker','moderator','mc','panelist')),
  status      text not null default 'invited' check (status in
                ('invited','maybe','confirmed','declined','cancelled','rejected')),
  time_locked boolean not null default false,   -- ล็อคเวลาแยกรายคน
  invited_at    date,
  confirmed_at  date,
  appointment_sent boolean not null default false,   -- คอลัมน์ แจ้งนัดหมาย
  coordinator_id bigint references app_user,         -- คอลัมน์ คนประสานงาน
  fee         numeric(12,2),
  sort        int not null default 0,
  note        text,
  unique (session_id, person_id, role)
);
create index session_person_person_idx on session_person (person_id);

-- ---------------------------------------------------------------- งบประมาณ

create table budget_category (
  id       bigserial primary key,
  event_id bigint not null references event on delete cascade,
  side     text not null check (side in ('income','expense')),
  code     text not null,
  name     text not null,               -- Site Operations, Exhibitor & Visitor Promotions
  sort     int not null default 0,
  unique (event_id, code)
);

create table budget_line (
  id          bigserial primary key,
  event_id    bigint not null references event on delete cascade,
  category_id bigint not null references budget_category on delete cascade,
  brand_id    bigint references event_brand on delete set null,
  name        text not null,
  sort        int not null default 0,

  -- ชีตใช้สองคูณ เช่น 40 ห้อง x 3 วัน x 900 บาท เก็บโครงเดิมไว้
  fc_qty      numeric(12,2), fc_unit text,
  fc_qty2     numeric(12,2), fc_unit2 text,
  fc_unit_cost numeric(14,2),
  fc_total    numeric(14,2) not null default 0,

  ac_qty      numeric(12,2), ac_unit text,
  ac_qty2     numeric(12,2), ac_unit2 text,
  ac_unit_cost numeric(14,2),
  ac_total    numeric(14,2) not null default 0,

  status      text not null default 'planned' check (status in
                ('planned','committed','invoiced','paid','cancelled')),
  supplier_id bigint references supplier on delete set null,
  work_by     text,                     -- ทีมไหนรับผิดชอบ
  paid_by     text,                     -- คนทำจ่าย
  carried_fwd boolean not null default false,   -- คอลัมน์ CF ในชีต
  note        text,
  updated_at  timestamptz not null default now()
);
create index budget_line_cat_idx on budget_line (category_id);

-- ---------------------------------------------------------------- การตลาด

create table marketing_channel (
  id       bigserial primary key,
  event_id bigint not null references event on delete cascade,
  name     text not null,               -- Facebook, TikTok, EDM, On-tour 5 จังหวัด
  media    text not null check (media in ('owned','paid','earned')),
  unique (event_id, name)
);

create table marketing_item (
  id         bigserial primary key,
  channel_id bigint not null references marketing_channel on delete cascade,
  title      text not null,
  owner_id   bigint references app_user,
  plan_date  date,
  live_date  date,
  status     text not null default 'planned' check (status in
               ('planned','in_progress','review','scheduled','live','cancelled')),
  budget     numeric(12,2) not null default 0,
  spend      numeric(12,2) not null default 0,
  reach      bigint, clicks bigint, leads bigint,
  asset_url  text,
  note       text
);

-- ---------------------------------------------------------------- เข้างาน ก่อสร้าง

create table contractor (
  id       bigserial primary key,
  name     text not null,
  phone    text,
  note     text
);

create table move_in (
  id             bigserial primary key,
  booth_id       bigint not null references booth on delete cascade,
  contractor_id  bigint references contractor on delete set null,
  build_type     text check (build_type in ('shell_scheme','special_design','raw_space')),
  slot_start     timestamptz,
  slot_end       timestamptz,
  design_doc_url text,
  design_approved_at timestamptz,
  insurance_amount numeric(12,2),       -- ค่าประกันการตกแต่งตามขนาดพื้นที่
  insurance_paid_at date,
  power_amp      numeric(8,2),
  checked_in_at  timestamptz,
  checked_out_at timestamptz,
  note           text
);

-- ---------------------------------------------------------------- ร่องรอย

create table audit_log (
  id         bigserial primary key,
  actor_id   bigint references app_user,
  entity     text not null,             -- booth, deal, budget_line
  entity_id  bigint not null,
  action     text not null,             -- create, update, status_change, delete
  field      text,
  old_value  text,
  new_value  text,
  at         timestamptz not null default now()
);
create index audit_entity_idx on audit_log (entity, entity_id, at desc);

commit;
