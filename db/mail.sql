-- ---------------------------------------------------------------- อีเมล
--
-- ทุกครั้งที่ระบบ "พยายาม" ส่งเมล ต้องมีแถวที่นี่ ไม่ว่าจะสำเร็จ ล้มเหลว
-- หรือถูกกันไว้ไม่ให้ส่ง เพราะคำถามที่ต้องตอบได้เสมอคือ
-- "ตกลงลูกค้ารายนี้ได้รับเมลหรือยัง" ไม่ใช่ "โค้ดเรียกฟังก์ชันส่งหรือยัง"
-- เขียนอย่างเดียวไม่แก้ เหมือน audit_log
create table if not exists mail_log (
  id         bigserial primary key,
  "to"       text not null,             -- ผู้รับที่ตั้งใจจะส่งถึงจริง ๆ
  cc         text,
  redirected_to text,                   -- ถ้า MAIL_REDIRECT_TO ทำงาน เมลไปโผล่ที่นี่แทน
  subject    text not null,
  template   text not null,             -- share_invite, user_invite, exhibitor_reminder, deal_message
  entity     text,                      -- event_share, app_user, deal
  entity_id  bigint,
  event_id   bigint references event on delete set null,
  status     text not null check (status in ('queued','sent','failed','skipped')),
  provider_id text,                     -- id ที่ Resend คืนมา ใช้ตามต่อในแดชบอร์ดของเขา
  error      text,                      -- เหตุผลที่ไม่สำเร็จ หรือเหตุผลที่ถูกข้าม
  at         timestamptz not null default now()
);
create index if not exists mail_log_entity_idx on mail_log (entity, entity_id, at desc);
create index if not exists mail_log_recent_idx on mail_log (template, at desc);

-- คำเชิญคนนอกเข้ามาดูงาน ตาราง event_share มีทุกอย่างแล้วยกเว้นตัวลิงก์
-- เก็บเป็นแฮชเหมือน portal_access ลิงก์ตัวจริงคืนครั้งเดียวตอนสร้าง
alter table event_share add column if not exists invite_token text;
alter table event_share add column if not exists token_expires_at timestamptz;

-- คำเชิญทีมงาน ให้ตั้งรหัสผ่านเองผ่านลิงก์ ไม่ต้องส่งรหัสผ่านทางเมล
alter table app_user add column if not exists invite_token text;
alter table app_user add column if not exists invite_expires_at timestamptz;
