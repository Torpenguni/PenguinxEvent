import pg from 'pg'

// Heroku และผู้ให้บริการส่วนใหญ่บังคับ SSL แต่ใช้ใบรับรองของตัวเอง
const ssl = process.env.DATABASE_URL?.includes('localhost')
  ? false
  : { rejectUnauthorized: false }

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl,
  max: 10,
})

export const q = (text, params) => pool.query(text, params)
