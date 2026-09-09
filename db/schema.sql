-- penguinxevent — โครงฐานข้อมูล
-- ออกแบบจากชีตที่ทีมใช้จริง ดูที่มาของทุกตารางได้ใน docs/schema.md
-- PostgreSQL 14+

begin;

-- ---------------------------------------------------------------- สิทธิ์

create table role (
  code  text primary key,
  name  text not null,
  sort  int not null default 0
);

insert into role (code, name, sort) values
  ('admin',      'ผู้ดูแลระบบ',   1),
  ('exec',       'ผู้บริหาร',      2),
  ('operations', 'ปฏิบัติการ',     3),
  ('sales',      'เซลล์',          4);

-- สิทธิ์เก็บเป็นข้อมูล ไม่ฝังในโค้ด จะได้แก้ได้โดยไม่ต้องขึ้นระบบใหม่
create table role_permission (
  role   text not null references role (code) on delete cascade,
  module text not null check (module in
           ('floorplan','deal','price','document','payment','budget','target',
            'stage','marketing','exhibitor','movein','share','user','audit','timeline')),
  level  text not null check (level in ('none','read','write','approve')),
  -- เห็นเฉพาะของตัวเอง หรือเห็นทั้งงาน ใช้กับ deal เป็นหลัก
  scope  text not null default 'all' check (scope in ('own','all')),
  primary key (role, module)
);

insert into role_permission (role, module, level, scope) values
  -- ผู้ดูแลระบบ ทำได้ทุกอย่างรวมถึงจัดการผู้ใช้และสิทธิ์
  ('admin','floorplan','write','all'),  ('admin','deal','write','all'),
  ('admin','price','approve','all'),    ('admin','document','write','all'),
  ('admin','payment','write','all'),    ('admin','budget','write','all'),
  ('admin','stage','write','all'),      ('admin','marketing','write','all'),
  ('admin','exhibitor','write','all'),  ('admin','movein','write','all'),
  ('admin','user','write','all'),       ('admin','audit','read','all'),
  ('admin','share','write','all'),
  ('admin','target','write','all'),
  ('admin','timeline','write','all'),

  -- ผู้บริหาร เห็นทุกอย่าง เป็นเจ้าของตัวเลขเงินและอนุมัติส่วนลด
  -- รับงานเดิมของบัญชีการเงินมาไว้ที่นี่ ทีมเล็กไม่ต้องแยกอีกบทบาท
  ('exec','floorplan','read','all'),    ('exec','deal','read','all'),
  ('exec','price','approve','all'),     ('exec','document','write','all'),
  ('exec','payment','write','all'),     ('exec','budget','write','all'),
  ('exec','stage','read','all'),        ('exec','marketing','read','all'),
  ('exec','exhibitor','read','all'),    ('exec','movein','read','all'),
  ('exec','user','none','all'),         ('exec','audit','read','all'),
  ('exec','share','read','all'),
  ('exec','target','write','all'),
  ('exec','timeline','read','all'),

  -- ปฏิบัติการ ดูแลผังงาน เวที ผู้ออกบูธ และงานก่อสร้าง
  -- รับงานเดิมของการตลาด (เวทีและช่องทางสื่อ) มารวมไว้ที่นี่
  ('operations','floorplan','write','all'), ('operations','deal','read','all'),
  ('operations','price','none','all'),      ('operations','document','write','all'),
  ('operations','payment','none','all'),    ('operations','budget','none','all'),
  ('operations','stage','write','all'),     ('operations','marketing','write','all'),
  ('operations','exhibitor','write','all'), ('operations','movein','write','all'),
  ('operations','user','none','all'),       ('operations','audit','none','all'),
  ('operations','share','write','all'),
  ('operations','target','none','all'),
  ('operations','timeline','write','all'),

  -- เซลล์ จองบูธและดูแลดีลของตัวเอง เห็นเป้าของตัวเอง ไม่เห็น Feasibility
  ('sales','floorplan','write','all'),  ('sales','deal','write','own'),
  ('sales','price','read','all'),       ('sales','document','write','own'),
  ('sales','payment','read','own'),     ('sales','budget','none','all'),
  ('sales','stage','read','all'),       ('sales','marketing','none','all'),
  ('sales','exhibitor','read','own'),   ('sales','movein','none','all'),
  ('sales','user','none','all'),        ('sales','audit','none','all'),
  ('sales','share','none','all'),
  ('sales','target','read','own'),
  ('sales','timeline','read','all');

-- ---------------------------------------------------------------- คน & องค์กร

create table app_user (
  id          bigserial primary key,
  email       text not null unique,
  name        text not null,
  role        text not null references role (code),
  active      boolean not null default true,

  -- เข้าระบบด้วยคำเชิญเท่านั้น ไม่มีหน้าสมัครเอง เพราะเป็นระบบภายใน
  password_hash text,
  invited_by  bigint references app_user,
  invited_at  timestamptz,
  activated_at timestamptz,
  last_login_at timestamptz,
  must_change_password boolean not null default true,

  created_at  timestamptz not null default now()
);

-- ล็อกอินหนึ่งครั้ง หนึ่งแถว เพิกถอนได้รายเครื่อง
create table auth_session (
  id          bigserial primary key,
  user_id     bigint not null references app_user on delete cascade,
  token_hash  text not null unique,       -- เก็บแฮช ไม่เก็บ token
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  last_seen_at timestamptz,
  ip          inet,
  user_agent  text,
  revoked_at  timestamptz
);
create index auth_session_user_idx on auth_session (user_id)
  where revoked_at is null;

-- กันเดารหัสผ่าน
create table login_attempt (
  id         bigserial primary key,
  email      text not null,
  ip         inet,
  ok         boolean not null,
  at         timestamptz not null default now()
);
create index login_attempt_idx on login_attempt (email, at desc);

create table company (
  id              bigserial primary key,
  name            text not null,
  name_th         text,
  tax_id          text,
  address         text,
  industry        text,

  -- โลโก้ใช้ทั้งบนผัง ป้ายหัวบูธ สูจิบัตร และ Directory Board
  -- fetched = เซิร์ฟเวอร์ไปอ่าน og:image หรือ favicon จาก website แล้วเก็บไฟล์ไว้เอง
  -- ไม่ hotlink รูปจากเว็บลูกค้า เพราะเว็บเขาเปลี่ยนแล้วป้ายเราพัง
  website         text,
  logo_url        text,
  logo_source     text check (logo_source in ('fetched','uploaded','from_exhibitor')),
  logo_updated_at timestamptz,

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
  card_url   text,                       -- รูปนามบัตร เก็บไฟล์ไว้ที่ object storage แล้วอ้างด้วย url
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
  -- เป้ารายได้ที่ตกลงกันไว้ ไม่ใช่ผลรวมราคาตั้ง
  -- ของ Restech x TRC 2026 คือ 13,066,200 มาจากราคาตั้ง 21,777,000 หัก 40%
  revenue_goal  numeric(14,2),
  cloned_from   bigint references event,  -- ปีหน้าโคลนจากปีนี้
  created_at    timestamptz not null default now()
);

-- งานที่จัดคู่กันในฮอลล์เดียว เช่น Restech กับ ตั้งตัว ใช้ผังเดียวแต่แยกบัญชี
-- ถ้าคนคนเดียวสิทธิ์ไม่เท่ากันในแต่ละงาน
-- ผูกบัญชีผู้ใช้เข้ากับชื่อเซลล์ในระบบ
-- ไม่มีอันนี้ บทบาทที่เห็นเฉพาะดีลของตัวเองจะเห็นศูนย์ดีลเสมอ
alter table app_user add column agent_id bigint;

create table user_event (
  user_id  bigint not null references app_user on delete cascade,
  event_id bigint not null references event on delete cascade,
  role     text references role (code),   -- ทับ role หลักเฉพาะงานนี้
  primary key (user_id, event_id)
);

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
  -- เพดานบัตรตามแพ็กเกจ ใช้บังคับตอนผู้ออกบูธกรอกชื่อคนประจำบูธเอง
  badge_exhibitor  int not null default 4,
  badge_contractor int not null default 2,
  unique (event_id, code)
);

-- เงื่อนไขของแต่ละแพ็กเกจ แยกเป็นแถวแทนที่จะเป็นข้อความก้อนเดียว
-- เพราะบางข้อต้องส่งมอบจริงและตามได้ ผูกกับ sponsor_benefit ตอนปิดดีล
create table package_benefit (
  id            bigserial primary key,
  booth_type_id bigint not null references booth_type on delete cascade,
  label         text not null,
  kind          text not null default 'included' check (kind in
                  ('included','limit','restriction','optional')),
  sort          int not null default 0
);
create index package_benefit_type_idx on package_benefit (booth_type_id, sort);

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
-- เพราะคิดค่าคอมคนละแบบ และงบตั้ง Sales Agent Commission ไว้ 10-15%
create table sales_agent (
  id        bigserial primary key,
  name      text not null unique,        -- Talk Event, Anster, พี่แคท
  kind      text not null default 'agent'
              check (kind in ('agent','inhouse','house')),
  commission_rate numeric(5,2) not null default 0,
  contact   text,
  active    boolean not null default true
);


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
  owner_id      bigint references app_user,        -- เซลล์ในบริษัท
  agent_id      bigint references sales_agent,     -- เซลล์นอก ถ้าขายผ่านเอเจนต์
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

  -- เซลล์เลือกเวลาให้ลูกค้าจ่ายมัดจำได้ 30 45 หรือ 60 วัน
  -- เหลือ 7 วันระบบขึ้นแดงเตือนให้ตาม เลยกำหนดแล้วปล่อยให้คิวถัดไปขึ้นมา
  hold_days         int check (hold_days in (30,45,60)),
  hold_started_at   date,
  hold_expires_at   timestamptz,
  contract_sent_at  timestamptz,
  contract_signed_at timestamptz,
  won_at            timestamptz,

  -- ของที่ต้องเก็บจากผู้ออกบูธ ชีตลิสต์ลูกค้าติดตามสามอย่างนี้อยู่แล้ว
  key_product        text,
  next_step          text,              -- สิ่งที่ต้องทำต่อกับดีลนี้
  next_date          date,
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
create index deal_hold_idx on deal (hold_expires_at)
  where status = 'booking' and hold_expires_at is not null;

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

-- แชร์งานให้คนอื่นเข้ามาดูหรือแก้ ใช้ได้ทั้งคนในและคนนอกบริษัท
-- ต่างจาก user_event ตรงที่ผูกกับอีเมล ไม่ต้องมีบัญชีมาก่อน และจำกัดได้ว่าเห็นโมดูลไหน
create table event_share (
  id         bigserial primary key,
  event_id   bigint not null references event on delete cascade,
  email      text not null,
  user_id    bigint references app_user on delete set null,  -- เติมตอนกดรับคำเชิญ
  permission text not null default 'view' check (permission in ('view','edit')),
  -- null คือเห็นทั้งงานตามสิทธิ์ ถ้าระบุคือเห็นเฉพาะโมดูลนั้นโมดูลเดียว
  scope_module text check (scope_module in
                 ('floorplan','deal','budget','stage','exhibitor','movein')),
  external   boolean not null default false,   -- อีเมลนอกโดเมนบริษัท
  invited_by bigint references app_user,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at  timestamptz,
  last_seen_at timestamptz,
  note       text,
  unique (event_id, email)
);
create index event_share_live_idx on event_share (event_id)
  where revoked_at is null;

-- คอมเมนต์ตามจุดต่าง ๆ ในงาน จะได้ไม่ต้องย้ายไปคุยกันในไลน์
create table comment (
  id         bigserial primary key,
  event_id   bigint not null references event on delete cascade,
  entity     text not null,          -- booth, deal, session, budget_line
  entity_id  bigint not null,
  author_id  bigint references app_user,
  author_email text,                 -- คนนอกที่ยังไม่มีบัญชี
  body       text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index comment_entity_idx on comment (entity, entity_id, created_at);

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
  -- ลิงก์ Google Doc ที่ใช้เขียนสคริปต์ MC และคิวเวที
  -- ชีตเดิมมีแท็บ Phone Agenda ที่พิมพ์มือ อันนี้แทนที่ตรงนั้น
  script_url text,
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

  -- บรรทัดรายได้ประกาศว่าตัวเองกินยอดมาจากไหน
  -- ตั้งเป็น auto แล้ว ac_total จะถูกคำนวณจากดีลจริง ไม่ต้องกรอกมือ
  source_kind text not null default 'manual' check (source_kind in
                ('manual','booth_type','addon','package','ticket')),
  source_ref  text,                     -- รหัส booth_type / addon / ชื่อแพ็กเกจ

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
  fascia_name    text,                  -- ชื่อที่พิมพ์บนป้ายหัวบูธ
  wall_note      text,                  -- เปิดผนังเชื่อมบูธข้างกันหรือไม่
  design_doc_url text,
  design_approved_at timestamptz,
  insurance_amount numeric(12,2),       -- ค่าประกันการตกแต่งตามขนาดพื้นที่
  insurance_paid_at date,
  power_amp      numeric(8,2),
  checked_in_at  timestamptz,
  checked_out_at timestamptz,
  note           text
);

-- ---------------------------------------------------------------- ดูแลผู้ออกบูธ

-- เซลล์นอกที่รับงานขายให้ ชีตแยกไว้ชัดว่าใครเป็นเอเจนต์ ใครเป็นคนใน

-- เช็กลิสต์ที่ต้องเก็บจากผู้ออกบูธทุกราย
-- ชีต Exhibitor Manual ติดตาม 37 ช่องต่อหนึ่งบูธ ทำเป็นรายการแทนคอลัมน์
-- เพราะแต่ละงานใช้ฟอร์มไม่เหมือนกัน และ IMPACT กับ BITEC คนละชุด
create table task_template (
  id       bigserial primary key,
  event_id bigint not null references event on delete cascade,
  -- ใครเป็นคนทำงานนี้ ทีมเราหรือผู้ออกบูธเอง
  -- งานที่ผู้ออกบูธทำเองคือของที่จะโผล่ในพอร์ทัลของเขา
  assigned_to text not null default 'exhibitor'
                check (assigned_to in ('exhibitor','organiser')),
  required boolean not null default true,
  instructions text,
  code     text not null,                -- contact, line_group, manual, logo,
                                         -- fascia_name, badge_ex, badge_con,
                                         -- f6, f2, f3, design, insurance
  label    text not null,
  phase    text not null check (phase in ('onboard','asset','form','build')),
  applies_to text check (applies_to in ('all','shell_scheme','raw_space')),
  due_offset_days int,                   -- กี่วันก่อนวันเข้างาน
  sort     int not null default 0,
  unique (event_id, code)
);

create table exhibitor_task (
  id          bigserial primary key,
  deal_id     bigint not null references deal on delete cascade,
  template_id bigint not null references task_template on delete cascade,
  done        boolean not null default false,
  done_at     timestamptz,
  done_by     bigint references app_user,
  due_date    date,
  file_url    text,
  note        text,
  unique (deal_id, template_id)
);
create index exhibitor_task_open_idx on exhibitor_task (due_date)
  where done = false;

-- คนประจำบูธ ชีตเดิมนับเป็นจำนวนบัตร Exhibitor กับบัตร Contractor
-- จำนวนบัตรผูกกับแพ็กเกจ ระบบบังคับเพดานให้เอง จะได้ไม่ต้องมานั่งเถียงหน้างาน
create table booth_staff (
  id         bigserial primary key,
  deal_id    bigint not null references deal on delete cascade,
  name       text not null,
  role       text,
  phone      text,
  email      text,
  badge_type text not null default 'exhibitor'
               check (badge_type in ('exhibitor','contractor')),
  badge_no   text,
  checked_in_at timestamptz,
  created_at timestamptz not null default now()
);
create index booth_staff_deal_idx on booth_staff (deal_id);

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

-- ---------------------------------------------------------------- มุมมองที่คำนวณเอง
--
-- Feasibility ไม่ควรเป็นไฟล์ที่ต้องไปกรอกตาม แต่ควรเป็นผลลัพธ์ของการขาย
-- สามมุมมองนี้แทนคอลัมน์ Actual ที่ทุกวันนี้กรอกมือ

-- มูลค่าต่อดีล แยกสามตัวที่ชีตยุบเป็นช่องเดียว
create view v_deal_value as
select d.id as deal_id, d.event_id, d.brand_id, d.company_id,
       d.owner_id, d.agent_id, d.status, d.settlement,
       d.list_total,
       d.deal_total                                   as contracted,
       coalesce(p.received, 0)                        as received,
       d.deal_total - coalesce(p.received, 0)         as outstanding,
       case when d.list_total > 0
            then round((1 - d.deal_total / d.list_total) * 100, 1)
       end                                            as discount_pct
from deal d
left join lateral (
  select sum(amount) filter (where paid_at is not null and kind <> 'refund')
       - coalesce(sum(amount) filter (where paid_at is not null and kind = 'refund'), 0)
         as received
  from payment where deal_id = d.id
) p on true;

-- ยอดตามแพ็กเกจ ใช้เติมฝั่งรายได้ของ Feasibility
-- นับเฉพาะดีลที่ยังไม่ตายและไม่ใช่บูธแลกของ ส่วน barter แยกไปดูต่างหาก
create view v_income_by_type as
select b.event_id,
       bt.code                                as booth_type,
       count(*)                               as booths_held,
       sum(di.list_unit_price * di.qty)       as list_value,
       sum(di.amount)                         as contracted,
       sum(di.amount * coalesce(r.paid_ratio, 0)) as received
from deal_item di
join booth b   on b.id = di.booth_id
join booth_type bt on bt.id = b.booth_type_id
join deal d    on d.id = di.deal_id
left join lateral (
  select case when d.deal_total > 0
         then least(1, coalesce(sum(amount) filter (where paid_at is not null), 0)
                       / d.deal_total)
         end as paid_ratio
  from payment where deal_id = d.id
) r on true
where d.status in ('booking','quoted','confirmed','billed','paid')
group by b.event_id, bt.code;

-- ความคืบหน้าของงาน เทียบแผนกับของจริง
create view v_event_pace as
select e.id as event_id, e.code, e.name,
       (select count(*) from booth where event_id = e.id
          and status = 'available')                    as booths_available,
       (select count(*) from booth where event_id = e.id
          and status in ('held','contracted','deposit_paid','paid')) as booths_held,
       (select coalesce(sum(fc_total), 0) from budget_line bl
          join budget_category bc on bc.id = bl.category_id
         where bl.event_id = e.id and bc.side = 'income')  as income_forecast,
       (select coalesce(sum(contracted), 0) from v_deal_value
         where event_id = e.id
           and status in ('booking','quoted','confirmed','billed','paid'))
                                                          as income_contracted,
       (select coalesce(sum(received), 0) from v_deal_value
         where event_id = e.id)                           as cash_received,
       (select coalesce(sum(ac_total), 0) from budget_line bl
          join budget_category bc on bc.id = bl.category_id
         where bl.event_id = e.id and bc.side = 'expense') as expense_actual
from event e;

commit;

-- ---------------------------------------------------------------- ไทม์ไลน์โครงการ
-- ถอดจากชีต Project Timeline แบ่งสามช่วง ก่อนงาน ระหว่างงาน หลังงาน
-- ก่อนงานและหลังงานเก็บเป็นสัปดาห์ห่างจากวันงาน ค่าลบคือก่อนงาน
-- ระหว่างงานเก็บเป็นลำดับวันกับเวลา เพราะหน้างานทุกอย่างชนกันในวันเดียว
-- เก็บเป็นระยะห่างไม่ใช่วันที่ตายตัว เลื่อนวันงานแล้วทั้งแผนขยับตามเอง
create table timeline_task (
  id        bigserial primary key,
  event_id  bigint not null references event on delete cascade,
  phase     text not null default 'pre' check (phase in ('pre','on','post')),
  grp       text not null,
  name      text not null,
  work_by   text,
  status    text not null default 'plan' check (status in ('plan','doing','done','risk')),

  -- แผน กับ ที่ทำจริง เก็บแยกกันเพื่อเทียบกันได้
  plan_a    int,      -- สัปดาห์เริ่มตามแผน ใช้เมื่อ phase อยู่ pre หรือ post
  plan_b    int,
  act_a     int,
  act_b     int,
  day_no    int,      -- ลำดับวัน ใช้เมื่อ phase = on
  plan_t1   time,
  plan_t2   time,
  act_t1    time,
  act_t2    time,

  note      text,
  extra     jsonb not null default '{}',   -- คอลัมน์ที่ผู้ใช้เพิ่มเอง
  sort      int,
  updated_at timestamptz not null default now()
);
create index timeline_task_event_idx on timeline_task (event_id, phase, sort);

-- ค่าตั้งของหน้าจอที่ยังไม่คุ้มจะแตกเป็นตาราง เช่นช่วงเดือนที่แสดง
-- คอลัมน์ที่ผู้ใช้เพิ่มเอง โลโก้งาน และไฟล์ผังพื้นที่
create table event_setting (
  event_id bigint primary key references event on delete cascade,
  settings jsonb not null default '{}'
);

alter table app_user
  add constraint app_user_agent_fk foreign key (agent_id) references sales_agent;
