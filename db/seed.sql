-- ข้อมูลตั้งต้นสำหรับรันครั้งแรก
-- ผู้ใช้สร้างด้วย scripts/create_user.js เพราะต้องแฮชรหัสผ่าน

begin;

insert into event (code, name, edition_year, venue, hall, start_date, end_date, status, revenue_goal)
values ('restech-trc-2027', 'Restech & Thailand Restaurant Conference', 2027,
        'IMPACT', 'Hall 6-7', '2027-08-21', '2027-08-24', 'selling', 13066200)
on conflict (code) do nothing;

insert into event_brand (event_id, code, name)
select e.id, x.code, x.name
  from event e, (values ('restech','Restech'), ('trc','Thailand Restaurant Conference')) as x(code,name)
 where e.code = 'restech-trc-2027'
on conflict do nothing;

-- ราคาตามชีต Feasibility ของ Restech x TRC 2026
insert into booth_type (event_id, code, name, tier, build, width_m, depth_m, list_price, build_cost)
select e.id, t.code, t.name, t.tier, t.build, t.w, t.d, t.price, t.cost
  from event e, (values
    ('title',    'Title Sponsor 6x12',    'sponsor',  'raw_space',   12, 6, 1500000, 0),
    ('platinum', 'Platinum Sponsor 6x6',  'sponsor',  'raw_space',    6, 6,  700000, 0),
    ('gold',     'Gold Sponsor 3x6',      'sponsor',  'raw_space',    6, 3,  400000, 0),
    ('silver',   'Silver Sponsor 3x6',    'sponsor',  'raw_space',    6, 3,  200000, 0),
    ('std3x3',   'Standard 3x3',          'standard', 'shell_scheme', 3, 3,   50000, 3250),
    ('food2x2',  'Food 2x2',              'food',     'shell_scheme', 2, 2,   23000, 2550)
  ) as t(code,name,tier,build,w,d,price,cost)
 where e.code = 'restech-trc-2027'
on conflict do nothing;

-- หมวดงบตามชีต
insert into budget_category (event_id, side, code, name, sort)
select e.id, c.side, c.code, c.name, c.sort
  from event e, (values
    ('income','booth_income','รายได้จากบูธ',1),
    ('expense','site','ดำเนินงานสถานที่',2),
    ('expense','promo','โปรโมทผู้ออกบูธและผู้ชม',3),
    ('expense','conference','เวทีและวิทยากร',4),
    ('expense','admin','บริหารงาน',5)
  ) as c(side,code,name,sort)
 where e.code = 'restech-trc-2027'
on conflict do nothing;

-- เช็กลิสต์ผู้ออกบูธตามชีต Exhibitor Manual
insert into task_template (event_id, code, label, phase, applies_to, due_offset_days, sort)
select e.id, t.code, t.label, t.phase, t.applies, t.days, t.sort
  from event e, (values
    ('contact',    'ติดต่อแล้ว',            'onboard','all',        60, 1),
    ('line_group', 'เข้ากลุ่ม Exhibitor',   'onboard','all',        45, 2),
    ('manual',     'ส่ง Exhibitor Manual',  'onboard','all',        45, 3),
    ('logo',       'ได้ไฟล์โลโก้',           'asset','all',          30, 4),
    ('fascia',     'ชื่อหน้าคูหา',           'asset','shell_scheme', 30, 5),
    ('badge_ex',   'บัตร Exhibitor',        'asset','all',          14, 6),
    ('badge_con',  'บัตร Contractor',       'asset','raw_space',    14, 7),
    ('f6',         'ฟอร์ม F6 คูหามาตรฐาน',  'form','shell_scheme',  21, 8),
    ('f2',         'ฟอร์ม F2 พื้นที่เปล่า',  'form','raw_space',     21, 9),
    ('f3',         'ฟอร์ม F3 แคชเชียร์เช็ค','form','raw_space',     21,10),
    ('design',     'แบบก่อสร้าง',            'build','raw_space',   21,11),
    ('insurance',  'ค่าประกันการตกแต่ง',     'build','raw_space',   14,12)
  ) as t(code,label,phase,applies,days,sort)
 where e.code = 'restech-trc-2027'
on conflict do nothing;

-- เงื่อนไขแพ็กเกจ ตามที่ปรากฏในชีต Feasibility ของ Restech x TRC
insert into package_benefit (booth_type_id, label, kind, sort)
select bt.id, b.label, b.kind, b.sort
  from booth_type bt
  join event e on e.id = bt.event_id
  join (values
    ('title',    'พื้นที่ 6x12 m แบบพื้นที่เปล่า',        'included',   1),
    ('title',    'สิทธิ์สื่อในแพ็กเกจสปอนเซอร์',           'included',   2),
    ('title',    'ช่วงพูดบนเวทีหลัก',                      'included',   3),
    ('title',    'บัตร Exhibitor 12 ใบ',                   'limit',      4),
    ('platinum', 'พื้นที่ 6x6 m แบบพื้นที่เปล่า',          'included',   1),
    ('platinum', 'รวม Workshop (ถ้าไม่รวมราคาลดลง)',       'optional',   2),
    ('platinum', 'สิทธิ์สื่อในแพ็กเกจสปอนเซอร์',           'included',   3),
    ('platinum', 'บัตร Exhibitor 8 ใบ',                    'limit',      4),
    ('gold',     'พื้นที่ 3x6 m แบบพื้นที่เปล่า',          'included',   1),
    ('gold',     'ตำแหน่ง Side Area ราคาต่ำกว่า',          'optional',   2),
    ('gold',     'บัตร Exhibitor 6 ใบ',                    'limit',      3),
    ('silver',   'พื้นที่ 3x6 m แบบพื้นที่เปล่า',          'included',   1),
    ('silver',   'บัตร Exhibitor 6 ใบ',                    'limit',      2),
    ('std3x3',   'คูหามาตรฐาน 3x3 m พร้อมโครง',            'included',   1),
    ('std3x3',   'บูธมุมราคาเพิ่ม 5,000',                  'optional',   2),
    ('std3x3',   'กระแสไฟบูธรวมแล้ว',                      'included',   3),
    ('std3x3',   'บัตร Exhibitor 4 ใบ',                    'limit',      4),
    ('food2x2',  'คูหา 2x2 m พร้อมโครง',                   'included',   1),
    ('food2x2',  'ห้ามใช้เสียง',                            'restriction',2),
    ('food2x2',  'บูธมุมราคาเพิ่ม 2,000',                  'optional',   3),
    ('food2x2',  'บัตร Exhibitor 2 ใบ',                    'limit',      4)
  ) as b(code, label, kind, sort) on b.code = bt.code
 where e.code = 'restech-trc-2027'
on conflict do nothing;

-- ของขายเสริม ราคาตามชีต
insert into addon (event_id, code, name, list_price)
select e.id, a.code, a.name, a.price
  from event e, (values
    ('speaker_session', 'Additional Speaker Session (ไม่เกิน 3 Session)', 120000),
    ('mc_onground',     'MC On Ground ประกาศหน้าบูธ',                     2000),
    ('photo',           'ภาพนิ่งบูธ',                                       500),
    ('video',           'ภาพวิดีโอบูธ',                                    5000),
    ('workshop',        'Workshop Package',                              100000)
  ) as a(code, name, price)
 where e.code = 'restech-trc-2027'
on conflict do nothing;

commit;
