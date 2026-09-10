/* ข้อมูลสำหรับออกใบเสนอราคาและใบกำกับภาษี
   ตอนนี้ออกใบให้ผู้ออกบูธด้วยการพิมพ์เข้า PEAK ทีละใบ ข้อมูลลูกค้าจึงอยู่แต่ในหัวคนขาย
   เก็บไว้ที่นี่เพื่อสองอย่าง หนึ่ง ไม่ต้องถามลูกค้าซ้ำทุกปี
   สอง ชื่อช่องตั้งให้ตรงกับที่ PEAK รับ (POST /api/v1/Contacts) จะได้ต่อ API ได้เลยไม่ต้องย้ายข้อมูลอีกรอบ

   ที่อยู่ของ PEAK แยกเป็นแขวง เขต จังหวัด รหัสไปรษณีย์ ไม่ใช่ก้อนเดียว
   คอลัมน์ address เดิมจึงเหลือเฉพาะบรรทัดที่อยู่ เลขที่ ถนน อาคาร */
alter table company add column if not exists entity_type   smallint;   -- 2 = นิติบุคคล, 5 = บุคคลธรรมดา (ตามรหัสของ PEAK)
alter table company add column if not exists branch_code   text;       -- 5 หลัก 00000 = สำนักงานใหญ่
alter table company add column if not exists sub_district  text;
alter table company add column if not exists district      text;
alter table company add column if not exists province      text;
alter table company add column if not exists post_code     text;
alter table company add column if not exists bill_email    text;       -- อีเมลรับเอกสาร ไม่ใช่อีเมลคนติดต่อ
