/* ชุดตรวจก่อนส่งขึ้นจริง ขับเบราว์เซอร์จริงเหมือนคนใช้
   มีไว้เพราะวันนี้ปล่อยของพังขึ้นไปสามรอบ ทั้งที่ตรวจไวยากรณ์ผ่านหมด
   ใช้: node scripts/smoke/run.mjs [url]   ค่าเริ่มต้นคือของจริง */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const URL = process.argv[2] || 'https://penguinx-event.vercel.app'
const EMAIL = process.env.SMOKE_EMAIL || 'admin@penguinx.local'
const PASS = process.env.SMOKE_PASSWORD || 'pxe-setup-2027'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9444
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-'))
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--window-size=1400,1000', '--no-first-run', 'about:blank'],
  { stdio: 'ignore' })

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let ws, id = 0
const errors = []
const send = (m, p = {}) => new Promise((res, rej) => {
  const i = ++id
  const on = (e) => { const x = JSON.parse(e.data); if (x.id !== i) return
    ws.removeEventListener('message', on); x.error ? rej(new Error(x.error.message)) : res(x.result) }
  ws.addEventListener('message', on); ws.send(JSON.stringify({ id: i, method: m, params: p }))
})
const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error('สคริปต์ตรวจเอง: ' + r.exceptionDetails.text)
  return r.result.value
}
const mouse = (type, x, y) => send('Input.dispatchMouseEvent',
  { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mouseReleased' ? 0 : 1 })
const type_ = async (sel, text) => {
  const p = await ev(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});
    if(!el)return null; const r=el.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}})()`)
  if (!p) throw new Error('ไม่เจอช่อง ' + sel)
  await mouse('mousePressed', p.x, p.y); await mouse('mouseReleased', p.x, p.y); await wait(150)
  await send('Input.insertText', { text }); await wait(150)
}

const results = []
const check = async (name, fn) => {
  try {
    const detail = await fn()
    results.push({ ok: true, name, detail })
    console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`)
  } catch (e) {
    results.push({ ok: false, name, detail: e.message })
    console.log(`  ✗ ${name} — ${e.message}`)
  }
}
const must = (cond, msg) => { if (!cond) throw new Error(msg) }

for (let i = 0; i < 30; i++) {
  try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break } catch { await wait(500) }
}
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0] ?? 'error')
  }
})
await send('Runtime.enable'); await send('Page.enable')

console.log(`\nตรวจ ${URL}\n`)
await send('Page.navigate', { url: URL + '/?smoke=' + Date.now() }); await wait(3500)

await check('หน้าแรกโหลดได้และไม่มี error ตอนเปิด', async () => {
  must(await ev(`!!document.getElementById("lform")`), 'ไม่เจอฟอร์มเข้าสู่ระบบ')
  must(errors.length === 0, 'มี error ตอนโหลด: ' + errors[0])
  return 'ฟอร์มขึ้นครบ'
})

await check('เข้าสู่ระบบได้', async () => {
  await type_('#em', EMAIL); await type_('#pw', PASS)
  await ev(`document.getElementById("lform").requestSubmit()`)
  for (let i = 0; i < 25; i++) {
    if (await ev(`document.querySelectorAll("#evgrid .evcard").length`)) break
    await wait(1000)
  }
  const n = await ev(`document.querySelectorAll("#evgrid .evcard").length`)
  must(n > 0, 'ไม่เห็นการ์ดงานหลังเข้าสู่ระบบ')
  return `เห็น ${n} การ์ด`
})

await check('เปิดงานแล้วข้อมูลมาครบ', async () => {
  /* เลือกงานที่มีข้อมูลจริงมาตรวจ ไม่ใช่งานเปล่าที่ผ่านทุกด่านโดยไม่ได้ตรวจอะไรเลย */
  await ev(`(()=>{const cards=[...document.querySelectorAll("#evgrid .evcard")]
    .filter(c=>!/Create new/i.test(c.textContent));
    (cards.find(c=>/Restech/i.test(c.textContent))||cards[0]).click()})()`)
  for (let i = 0; i < 25; i++) {
    if (await ev(`document.querySelectorAll("nav.side a").length`)) break
    await wait(1000)
  }
  const info = await ev(`(()=>{const n=(x)=>Array.isArray(x)?x.length:0;
    return {menu:document.querySelectorAll("nav.side a").length, booths:n(EV.booths), tl:n(EV.timeline)}})()`)
  must(info.menu >= 6, 'เมนูไม่ครบ')
  must(info.booths > 0, 'ไม่มีบูธ')
  return `เมนู ${info.menu} หน้า · บูธ ${info.booths} · ไทม์ไลน์ ${info.tl}`
})

const pages = await ev(`[...document.querySelectorAll("nav.side a")].map(a=>a.dataset.p)`)
for (const p of pages) {
  await check(`หน้า ${p} เปิดได้และไม่มีค่าเพี้ยน`, async () => {
    await ev(`document.querySelector('nav.side a[data-p="${p}"]').click()`); await wait(2000)
    const r = await ev(`(()=>{const t=document.getElementById("page").innerText;
      return {len:t.trim().length, bad:["NaN","undefined","Invalid Date","[object"].filter(w=>t.includes(w))}})()`)
    must(r.len > 100, 'หน้าแทบว่างเปล่า')
    must(r.bad.length === 0, 'พบ ' + r.bad.join(', '))
    return `${r.len} ตัวอักษร`
  })
}

await check('ไม่มี error จากหน้าเว็บตลอดการตรวจ', async () => {
  must(errors.length === 0, errors.slice(0, 2).join(' | '))
  return 'สะอาด'
})

const bad = results.filter((r) => !r.ok)
console.log(`\nสรุป ${results.length - bad.length}/${results.length} ผ่าน`)
chrome.kill()
// เบราว์เซอร์ยังเขียนไฟล์อยู่ตอนปิด ลบไม่ได้ก็ไม่เป็นไร เป็นแค่โฟลเดอร์ชั่วคราว
try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }) } catch {}
process.exit(bad.length ? 1 : 0)
