-- ข้อมูลตั้งต้นสำหรับรันครั้งแรก
-- ผู้ใช้สร้างด้วย scripts/create_user.js เพราะต้องแฮชรหัสผ่าน

begin;

insert into event (code, name, edition_year, venue, hall, start_date, end_date, status, revenue_goal)
values ('restech-trc-2026', 'Restech & Thailand Restaurant Conference', 2026,
        'IMPACT', 'Hall 6-7', '2026-08-27', '2026-08-29', 'selling', 13066200)
on conflict (code) do nothing;

insert into event_brand (event_id, code, name)
select e.id, x.code, x.name
  from event e, (values ('restech','Restech'), ('trc','Thailand Restaurant Conference')) as x(code,name)
 where e.code = 'restech-trc-2026'
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
 where e.code = 'restech-trc-2026'
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
 where e.code = 'restech-trc-2026'
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
 where e.code = 'restech-trc-2026'
on conflict do nothing;

commit;
