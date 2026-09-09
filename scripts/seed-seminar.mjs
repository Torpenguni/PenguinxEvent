/* ใส่เนื้อหาสมมติให้งานสัมมนาที่เพิ่งสร้าง ผ่านเส้นทางเดียวกับที่หน้าเว็บใช้บันทึก
   งานวันเดียว 15 ก.ย. 2026 ที่สามย่านมิตรทาวน์ ที่นั่ง 500 บูธ 30 ช่อง สัมมนา 10:00-18:00 */
const API = process.env.PXE_API || 'https://penguinx-event.vercel.app'
const CODE = 'rgs-2026'
const login = await (await fetch(API + '/api/auth/login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@penguinx.local', password: 'pxe-setup-2027' }),
})).json()
const H = { 'content-type': 'application/json', authorization: 'Bearer ' + login.token }
const { event: ev } = await (await fetch(`${API}/api/events/${CODE}/full`, { headers: H })).json()
console.log('โหลดงานมาแล้ว:', ev.name, '| บูธ', ev.booths.length)

// ---------- เวทีและกำหนดการ 10:00-18:00 ----------
ev.stages = ['เวทีสัมมนาหลัก']
const S = (t1, t2, title, kind, people = []) => {
  const m = (s) => { const [h, mm] = s.split(':').map(Number); return h * 60 + mm }
  return { stage: 'เวทีสัมมนาหลัก', day: 1, date: '2026-09-15', time: `${t1}-${t2}`,
    a: m(t1), b: m(t2), min: String(m(t2) - m(t1)), no: null, title, kind,
    cf: kind !== 'talk' ? true : people.length > 0, lock: false, mod: null, coord: null,
    slides: null, people }
}
const sp = (n, real, pos, st = 'Confirm') => ({ n, real, pos, st, contact: null, coord: null, slides: null })
ev.sessions = [
  S('09:00', '10:00', 'ลงทะเบียนหน้างาน / เปิดโซนบูธ', 'registration'),
  S('10:00', '10:20', 'กล่าวเปิดงาน', 'ceremony', [sp('คุณต่อ Penguin X', 'ธนพงศ์ วงศ์ชินศรี', 'ผู้ก่อตั้ง Penguin X')]),
  S('10:20', '11:10', 'ทิศทางธุรกิจร้านอาหารปี 2027', 'talk',
    [sp('คุณเบส Wongnai', 'ยอด ชินสุภัคกุล', 'CEO LINE MAN Wongnai')]),
  S('11:10', '12:00', 'ตั้งราคาเมนูอย่างไรให้กำไรเหลือ', 'talk',
    [sp('อ.เก่ง Costing', 'ณัฐพล ธนวัฒน์', 'ที่ปรึกษาต้นทุนอาหาร')]),
  S('12:00', '13:00', 'พักกลางวัน / เดินชมบูธ', 'break'),
  S('13:00', '14:00', 'เสวนา ขยายสาขาอย่างไรไม่ให้เจ๊ง', 'panel',
    [sp('คุณหนึ่ง Bar B Q', 'ชูพงศ์ ธนเดชากุล', 'MD บาร์บีคิวพลาซ่า'),
     sp('คุณมุก Cafe Amazon', 'มุกดา วิทยากร', 'Head of Franchise'),
     sp('คุณเจ Sushi Hiro', 'เจษฎา อริยะกุล', 'เจ้าของร้าน')]),
  S('14:00', '14:50', 'ทำคอนเทนต์ร้านอาหารให้คนต่อคิว', 'talk',
    [sp('คุณแพร Foodie', 'แพรวา สุขสมบูรณ์', 'ครีเอเตอร์สายอาหาร', 'Maybe CF')]),
  S('14:50', '15:10', 'พักเบรก', 'break'),
  S('15:10', '16:00', 'ระบบหลังบ้านที่ร้านขนาดกลางควรมี', 'talk',
    [sp('คุณโอ๊ต POS', 'อธิป เมธาวุฒิ', 'Head of Product ระบบ POS')]),
  S('16:00', '17:00', 'เวิร์กชอป อ่านงบร้านอาหารใน 60 นาที', 'workshop',
    [sp('คุณนุ่น Finance', 'ณัฐนันท์ โภคทรัพย์', 'นักบัญชีธุรกิจอาหาร')]),
  S('17:00', '17:45', 'ถามตอบกับวิทยากรทุกท่าน', 'panel'),
  S('17:45', '18:00', 'ปิดงาน / จับรางวัล', 'ceremony'),
]

// ---------- แพ็กเกจบูธ ----------
ev.packages = {
  'Gold Partner': { size: '3x3 m', build: 'Shell scheme', price: 90000, badge: 6,
    b: [['included', 'บูธ 3x3 ม. พร้อมโครงสร้าง'], ['included', 'โลโก้บนสื่อทุกชิ้น'],
        ['included', 'ช่วงพูดบนเวที 10 นาที'], ['limit', 'บัตรทีมงาน 6 ใบ']] },
  'Standard booth': { size: '3x3 m', build: 'Shell scheme', price: 35000, badge: 4,
    b: [['included', 'บูธ 3x3 ม. พร้อมโครงสร้าง'], ['included', 'โลโก้ในสูจิบัตร'],
        ['limit', 'บัตรทีมงาน 4 ใบ']] },
  'Startup corner': { size: '2x2 m', build: 'Shell scheme', price: 18000, badge: 2,
    b: [['included', 'โต๊ะ 2x2 ม.'], ['limit', 'บัตรทีมงาน 2 ใบ']] },
}
const P = ['Gold Partner', 'Standard booth', 'Standard booth', 'Startup corner']
ev.booths = ev.booths.map((b, i) => ({ ...b, pkg: P[i % 4],
  list: ev.packages[P[i % 4]].price }))

// ---------- ลูกค้าที่ขายได้แล้ว ----------
const buyers = [
  ['บริษัท ครัวคุณต๋อย จำกัด', 'paid'], ['Sushi Hiro', 'paid'], ['ร้านกาแฟ Brew Lab', 'billed'],
  ['Thai Beverage Solution', 'confirmed'], ['POS Wisdom', 'confirmed'], ['Cloud Kitchen Co.', 'quoted'],
  ['อุปกรณ์ครัว ChefMart', 'quoted'], ['Packaging Plus', 'booking'], ['Delivery Hero TH', 'booking'],
  ['ชาไทยหอมหวาน', 'lead'],
]
ev.deals = buyers.map(([co, stage], i) => {
  const code = ev.booths[i].code
  ev.booths[i] = { ...ev.booths[i], st: ['paid', 'billed'].includes(stage) ? 'paid'
    : stage === 'confirmed' ? 'deposit' : 'booked', co }
  return { id: i + 1, co, booths: [code], list: ev.booths[i].list, stage, st: null,
    sales: 'Snoox', product: null, form: false, board: false,
    holdDays: 30, holdStart: '2026-08-20', holdExp: null,
    next: 'ยืนยันแบบบูธ', nextDate: '2026-09-10', acts: [], tasks: {} }
})

// ---------- งบและเป้า ----------
ev.target = 1200000
ev.target_note = 'เป้ารายได้จากบูธและสปอนเซอร์ งานวันเดียว'
const money = { 'ค่าสถานที่': 180000, 'ค่าอาหารและเครื่องดื่ม': 150000, 'ค่าวิทยากร': 120000,
  'ผลิตงานสร้างสรรค์': 90000, 'โฆษณาออนไลน์': 60000 }
let hit = 0
ev.budget = ev.budget.map((l) => {
  for (const [k, v] of Object.entries(money)) {
    if (!l.fc && (l.name || '').includes(k.slice(0, 6))) { hit++; return { ...l, fc: v } }
  }
  return l
})
if (hit < 3) { ev.budget = ev.budget.map((l, i) => i < 5 ? { ...l, fc: Object.values(money)[i] } : l) }

const res = await fetch(`${API}/api/events/${CODE}/full`, {
  method: 'PUT', headers: H, body: JSON.stringify({ event: ev }),
})
console.log('บันทึก:', res.status, JSON.stringify(await res.json()).slice(0, 200))
