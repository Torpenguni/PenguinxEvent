/* เดินเลขรอบการบันทึกของงาน
   ทุกทางที่เขียนข้อมูลของงานต้องเดินเลขนี้ ไม่ว่าจะบันทึกทั้งก้อนหรือแก้ทีละช่อง
   ถ้าทางไหนไม่เดิน หน้าเว็บของอีกคนจะยังถือเลขเดิมแล้วบันทึกทับของที่เพิ่งแก้ไปได้ */
import { q } from './db.js'

export async function bumpRev (code, userId) {
  const r = await q(
    `update event set rev = rev + 1, updated_at = now(), updated_by = $2
      where code = $1 returning rev`, [code, userId ?? null])
  return Number(r.rows[0]?.rev ?? 0)
}

export async function bumpRevById (eventId, userId) {
  const r = await q(
    `update event set rev = rev + 1, updated_at = now(), updated_by = $2
      where id = $1 returning rev`, [eventId, userId ?? null])
  return Number(r.rows[0]?.rev ?? 0)
}
