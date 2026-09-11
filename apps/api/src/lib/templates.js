/* แม่แบบอีเมลทั้งหมดอยู่ไฟล์เดียว ไม่กระจายไปตาม route
   เพราะเมลคือหน้าตาของบริษัทที่ส่งไปถึงลูกค้าที่จ่ายเงินแล้ว
   แก้ถ้อยคำทีเดียวจบ และอ่านทวนก่อนเปิดส่งจริงได้ในที่เดียว */

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
  : '—'

export const MODULE_LABEL = {
  floorplan: 'ผังบูธ',
  deal: 'ดีลและลูกค้า',
  budget: 'งบประมาณ',
  stage: 'ตารางเวที',
  exhibitor: 'ผู้ออกบูธ',
  movein: 'การเข้าพื้นที่',
}

const ROLE_LABEL = {
  admin: 'ผู้ดูแลระบบ', exec: 'ผู้บริหาร', operations: 'ปฏิบัติการ', sales: 'เซลล์',
}

// กรอบเดียวใช้ทุกฉบับ อีเมลไคลเอนต์ส่วนใหญ่ไม่รองรับ CSS แยกไฟล์ ต้อง inline
function layout (title, bodyHtml, footer = '') {
  return `<!doctype html><html lang="th"><body style="margin:0;background:#f7f7f8;
    font-family:-apple-system,'Noto Sans Thai',Helvetica,Arial,sans-serif;color:#14171a">
    <div style="max-width:560px;margin:0 auto;padding:24px 16px">
      <div style="background:#14171a;color:#fff;padding:18px 20px;border-radius:12px 12px 0 0">
        <div style="font-size:17px;font-weight:600">${esc(title)}</div>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:0;
                  border-radius:0 0 12px 12px;padding:20px;line-height:1.7">
        ${bodyHtml}
      </div>
      <div style="color:#6b7280;font-size:12px;padding:14px 4px;line-height:1.6">
        ${footer || 'อีเมลนี้ส่งจากระบบจัดงานของ Penguin X ตอบกลับมาได้ตามปกติ'}
      </div>
    </div></body></html>`
}

const button = (url, label) => `<p style="margin:22px 0">
  <a href="${esc(url)}" style="background:#14171a;color:#fff;text-decoration:none;
     padding:11px 20px;border-radius:8px;display:inline-block;font-weight:600">${esc(label)}</a></p>
  <p style="color:#6b7280;font-size:12px;word-break:break-all">
    ถ้าปุ่มกดไม่ได้ คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์<br>${esc(url)}</p>`

// ---------------------------------------------------------------- คำเชิญคนนอกดูงาน
export function shareInvite ({ event, inviter, permission, scopeModule, url, expiresAt, note }) {
  const scope = scopeModule
    ? `เห็นได้เฉพาะส่วน<b>${esc(MODULE_LABEL[scopeModule] || scopeModule)}</b>เท่านั้น ส่วนอื่นของงานจะไม่ปรากฏ`
    : 'เห็นข้อมูลของงานตามสิทธิ์ที่ได้รับ'
  const perm = permission === 'edit' ? 'แก้ไขได้' : 'ดูอย่างเดียว แก้ไขไม่ได้'
  return {
    subject: `${inviter} เชิญคุณดูข้อมูลงาน ${event.name}`,
    html: layout('คำเชิญเข้าดูข้อมูลงาน', `
      <p><b>${esc(inviter)}</b> เชิญคุณเข้าดูข้อมูลของงาน <b>${esc(event.name)}</b></p>
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#6b7280;width:110px">สถานที่</td>
            <td>${esc(event.venue || '—')} ${esc(event.hall || '')}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">วันจัดงาน</td>
            <td>${fmtDate(event.start_date)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">สิทธิ์ที่ได้</td><td>${perm}</td></tr>
      </table>
      <p style="margin-top:14px">${scope}</p>
      ${note ? `<p style="background:#f7f7f8;padding:12px;border-radius:8px">${esc(note)}</p>` : ''}
      ${button(url, 'เปิดดูข้อมูลงาน')}
      <p style="color:#6b7280;font-size:13px">ลิงก์นี้ใช้ได้ถึง ${fmtDate(expiresAt)}
      และเป็นของคุณคนเดียว กรุณาอย่าส่งต่อ</p>`),
  }
}

// ---------------------------------------------------------------- คำเชิญทีมงาน
export function userInvite ({ user, inviter, url, expiresAt }) {
  return {
    subject: `เชิญเข้าใช้ระบบจัดงาน Penguin X`,
    html: layout('ตั้งรหัสผ่านเพื่อเข้าใช้ระบบ', `
      <p><b>${esc(inviter)}</b> เปิดบัญชีในระบบจัดงานให้คุณแล้ว</p>
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#6b7280;width:110px">อีเมลที่ใช้เข้า</td>
            <td>${esc(user.email)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">บทบาท</td>
            <td>${esc(ROLE_LABEL[user.role] || user.role)}</td></tr>
      </table>
      <p style="margin-top:14px">กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านของคุณเอง
      ระบบไม่ส่งรหัสผ่านทางอีเมลและไม่มีใครในทีมเห็นรหัสของคุณ</p>
      ${button(url, 'ตั้งรหัสผ่าน')}
      <p style="color:#6b7280;font-size:13px">ลิงก์นี้ใช้ได้ถึง ${fmtDate(expiresAt)}
      ถ้าหมดอายุแล้วขอให้แจ้งผู้ดูแลระบบส่งใหม่</p>`),
  }
}

// ---------------------------------------------------------------- เตือนผู้ออกบูธ
// รวมทุกงานที่ค้างของบริษัทเดียวไว้ในฉบับเดียว บริษัทหนึ่งได้เมลหนึ่งฉบับ
export function exhibitorReminder ({ company, event, tasks, portalUrl, boothCodes }) {
  const late = tasks.filter((t) => t.days_left < 0)
  const row = (t) => {
    const when = t.days_left < 0
      ? `<span style="color:#b42318;font-weight:600">เลยกำหนด ${-t.days_left} วัน</span>`
      : t.days_left === 0 ? '<span style="color:#b42318;font-weight:600">ครบกำหนดวันนี้</span>'
      : `เหลืออีก ${t.days_left} วัน`
    return `<tr>
      <td style="padding:8px 0;border-top:1px solid #e5e7eb">${esc(t.label)}
        ${t.required ? '<span style="font-size:11px;background:#fdecec;color:#b42318;'
          + 'padding:1px 7px;border-radius:99px;margin-left:4px">บังคับ</span>' : ''}</td>
      <td style="padding:8px 0;border-top:1px solid #e5e7eb;text-align:right;
                 white-space:nowrap;font-size:13px">${when}</td></tr>`
  }
  return {
    subject: late.length
      ? `มี ${tasks.length} รายการที่ต้องส่งสำหรับงาน ${event.name} (เลยกำหนดแล้ว ${late.length})`
      : `เหลือ ${tasks.length} รายการที่ต้องส่งสำหรับงาน ${event.name}`,
    html: layout(`สิ่งที่ต้องส่ง · ${event.name}`, `
      <p>เรียน ${esc(company)}</p>
      <p>บูธ <b>${esc(boothCodes || '—')}</b> ยังมีรายการที่รอจากทางคุณอยู่
      ${tasks.length} รายการ ตามนี้ครับ</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${tasks.map(row).join('')}</table>
      ${portalUrl ? button(portalUrl, 'เปิดพอร์ทัลผู้ออกบูธ') : ''}
      <p style="color:#6b7280;font-size:13px">งานเข้าพื้นที่วันที่ ${fmtDate(event.move_in_from)}
      จัดงาน ${fmtDate(event.start_date)} มีคำถามตอบกลับอีเมลนี้ได้เลย</p>`),
  }
}

// ---------------------------------------------------------------- เมลติดตามดีล
// เนื้อความมาจากเซลล์ ระบบแค่ใส่กรอบให้และเก็บสำเนาไว้ในประวัติ
export function dealMessage ({ subject, body, sender, company }) {
  const paras = String(body).split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')
  return {
    subject,
    html: layout(subject, `
      ${company ? `<p style="color:#6b7280;font-size:13px">ถึง ${esc(company)}</p>` : ''}
      ${paras}
      <p style="margin-top:18px">ขอบคุณครับ<br>${esc(sender.name)}<br>
      <span style="color:#6b7280;font-size:13px">${esc(sender.email)}</span></p>`),
  }
}

// ---------------------------------------------------- สรุปงานค้างรายสัปดาห์ของเซลล์
/* เซลล์เห็นของค้างเฉพาะตอนเปิดหน้าเว็บ ถ้าสัปดาห์นั้นยุ่งจนไม่ได้เปิด ก็ไม่มีอะไรมาสะกิด
   เมลฉบับนี้ส่งเช้าวันจันทร์ บอกเฉพาะดีลของคนนั้น เรียงตามความเร่งด่วน
   ไม่มีอะไรค้างก็ไม่ส่ง ไม่งั้นคนจะเลิกอ่านภายในสองสัปดาห์ */
export function repDigest ({ rep, event, groups, url }) {
  const total = groups.reduce((n, g) => n + g.rows.length, 0)
  const block = (g) => {
    if (!g.rows.length) return ''
    return `<p style="margin:20px 0 6px"><b>${esc(g.label)}</b>
      <span style="background:${g.urgent ? '#fdecec' : '#f3f4f6'};color:${g.urgent ? '#b42318' : '#4b5563'};
      font-size:12px;padding:1px 8px;border-radius:99px;margin-left:5px">${g.rows.length}</span></p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${g.rows.slice(0, 8).map((d) => `<tr>
        <td style="padding:7px 0;border-top:1px solid #e5e7eb">${esc(d.company)}
          ${d.note ? `<br><span style="color:#6b7280;font-size:12.5px">${esc(d.note)}</span>` : ''}</td>
        <td style="padding:7px 0;border-top:1px solid #e5e7eb;text-align:right;
            white-space:nowrap;font-variant-numeric:tabular-nums">${
              Number(d.value || 0).toLocaleString('th-TH')}</td></tr>`).join('')}
      </table>
      ${g.rows.length > 8 ? `<p style="color:#6b7280;font-size:12.5px;margin:6px 0 0">
        และอีก ${g.rows.length - 8} ราย</p>` : ''}`
  }
  return {
    subject: `งานค้างของคุณ ${total} รายการ · ${event.name}`,
    html: layout(`สรุปเช้าวันจันทร์ · ${esc(event.name)}`, `
      <p>เรียนคุณ ${esc(rep)}</p>
      <p>ดีลที่ยังเปิดอยู่ของคุณมี <b>${total} รายการ</b> ที่ควรขยับสัปดาห์นี้</p>
      ${groups.map(block).join('')}
      ${url ? button(url, 'เปิดหน้างานวันนี้') : ''}
      <p style="color:#6b7280;font-size:13px">เมลนี้ส่งอัตโนมัติทุกเช้าวันจันทร์
      เฉพาะเมื่อมีงานค้าง ถ้าไม่มีอะไรค้างจะไม่ส่ง</p>`),
  }
}
