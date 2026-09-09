import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import SetPassword from './pages/SetPassword.jsx'
import AcceptInvite from './pages/AcceptInvite.jsx'
import './styles.css'

/* สองหน้านี้มาจากลิงก์ในอีเมล ต้องเปิดได้ก่อนล็อกอิน
   เลือกที่นี่ ไม่ใช่ใน App เพราะ App มี hook ที่ต้องถูกเรียกทุกครั้ง
   การ return ออกก่อนเรียก hook คือทางที่พังเงียบ ๆ ตอนแก้ครั้งถัดไป */
const path = location.pathname
const Root =
  path.startsWith('/set-password') ? SetPassword
    : path.startsWith('/invite') ? AcceptInvite
      : App

createRoot(document.getElementById('root')).render(<Root />)
