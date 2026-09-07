const KEY = 'pxe.token'

export const token = {
  get: () => localStorage.getItem(KEY),
  set: (t) => localStorage.setItem(KEY, t),
  clear: () => localStorage.removeItem(KEY),
}

export async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token.get() ? { authorization: `Bearer ${token.get()}` } : {}),
      ...options.headers,
    },
  })
  if (res.status === 401) {
    token.clear()
    throw new Error('หมดเวลาเข้าระบบ กรุณาเข้าใหม่')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'เรียกข้อมูลไม่สำเร็จ')
  return body
}

// สิทธิ์ที่ส่งมาจากเซิร์ฟเวอร์ ใช้ซ่อนเมนูเท่านั้น การกันจริงอยู่ฝั่ง API
export const can = (perms, module, level = 'read') => {
  const rank = { none: 0, read: 1, write: 2, approve: 3 }
  return (rank[perms?.[module]?.level] ?? 0) >= rank[level]
}
