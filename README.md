# Taithai Apps

ชุดเว็บแอปขนาดเล็กของ Taithai รวมถึง Movie Memory, Temporary Chat,
QR Code tools, URL Shortener และ Degree Plan Explorer

## Run Locally

**Prerequisites:**  Node.js


1. เริ่ม local server (ไม่ต้องติดตั้ง dependencies):
   `npm run dev`
2. เปิด `http://localhost:3000`

โปรเจกต์ไม่ต้องใช้ `GEMINI_API_KEY` ระบบล็อกอินใช้ Firebase configuration
จาก `firebase-auth.js` และ Movie Memory ใช้ TMDB API สำหรับค้นหาหนัง

> Firebase Google Login ไม่รองรับการเปิดหน้าเว็บตรงด้วย `file://`
> ต้องเปิดผ่าน `http://localhost:3000` หรือโดเมน `https://taithai.app`
