-- ทางเข้าพอร์ทัลของผู้ออกบูธ
-- แยกจาก app_user เพราะผู้ออกบูธไม่ใช่พนักงาน ไม่มีบทบาทในตาราง role
-- และแยกจาก event_share เพราะสิทธิ์ที่นี่ผูกกับ "ดีลใบเดียว" ไม่ใช่ทั้งงาน
create table if not exists portal_access (
  id          bigserial primary key,
  deal_id     bigint not null references deal on delete cascade,
  email       text not null,
  -- เก็บแค่แฮช ลิงก์ตัวจริงโชว์ครั้งเดียวตอนสร้าง หลุดฐานข้อมูลก็เข้าไม่ได้
  token_hash  text not null unique,
  created_by  bigint references app_user,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  last_seen_at timestamptz,
  revoked_at  timestamptz,
  note        text
);
create index if not exists portal_access_deal_idx on portal_access (deal_id)
  where revoked_at is null;
