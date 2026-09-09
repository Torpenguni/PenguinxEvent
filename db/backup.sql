-- สำรองข้อมูลรายวัน เก็บทั้งงานเป็นก้อน JSON ก้อนเดียวต่อหนึ่งงานต่อหนึ่งวัน
-- กันเรื่องที่เกิดขึ้นจริงมาแล้ว คือโค้ดเขียนทับข้อมูลด้วยของว่าง แล้วไม่มีอะไรให้กู้
-- Neon แผนฟรีย้อนเวลาไม่ได้ ต้องเก็บเอง
create table if not exists event_backup (
  id         bigserial primary key,
  event_id   bigint references event on delete cascade,
  code       text not null,
  taken_on   date not null default current_date,
  size_bytes int  not null,
  data       jsonb not null,
  at         timestamptz not null default now(),
  unique (code, taken_on)
);
create index if not exists event_backup_code_idx on event_backup (code, taken_on desc);
