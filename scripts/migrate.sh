#!/usr/bin/env bash
# ย้ายฐานข้อมูลขึ้นคลาวด์ ใช้ครั้งเดียวตอนตั้งระบบ
# ใช้: DATABASE_URL='postgresql://...' bash scripts/migrate.sh [ไฟล์ข้อมูล]
set -euo pipefail
: "${DATABASE_URL:?ต้องตั้ง DATABASE_URL ก่อน}"
DATA="${1:-prototypes/app4.json}"
cd "$(dirname "$0")/.."

echo "▸ สร้างตารางทั้งหมด"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f db/schema.sql

echo "▸ นำเข้าข้อมูลจาก $DATA"
node scripts/import_json.mjs "$DATA"

echo "▸ ตรวจผล"
psql "$DATABASE_URL" -t -A -c "
select 'บทบาท ' || count(*) from role
union all select 'ผู้ใช้ ' || count(*) from app_user
union all select 'งาน ' || count(*) from event
union all select 'บูธ ' || count(*) from booth
union all select 'ดีล ' || count(*) from deal
union all select 'บรรทัดงบ ' || count(*) from budget_line
union all select 'ช่วงบนเวที ' || count(*) from session
union all select 'งานไทม์ไลน์ ' || count(*) from timeline_task;"
echo "▸ เสร็จ"
