-- ที่นั่งและบัตรของงานสัมมนา งานแบบนี้รายได้หลักมาจากบัตร ไม่ใช่บูธ
-- ของเดิมระบบคิดจากบูธอย่างเดียว งานสัมมนา 500 ที่นั่งจึงบันทึกไม่ได้เลย
alter table event add column if not exists seats int;              -- ความจุที่นั่ง
alter table event add column if not exists ticket_price numeric(12,2); -- ราคาบัตรตั้ง
alter table event add column if not exists tickets_sold int;       -- ขายได้แล้วกี่ใบ
