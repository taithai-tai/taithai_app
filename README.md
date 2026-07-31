# Taithai Apps

ชุดเว็บแอปขนาดเล็กของ Taithai รวมถึง Movie Memory, Temporary Chat,
QR Code tools, URL Shortener และ Degree Plan Explorer

## Run Locally

**Prerequisites:**  Node.js


1. สร้าง `.env.local` และกำหนด `GEMINI_API_KEY` สำหรับระบบอ่านตั๋วหนัง
2. เริ่ม local server (ไม่ต้องติดตั้ง dependencies):
   `npm run dev`
3. เปิด `http://localhost:3000`

ระบบล็อกอินใช้ Firebase configuration จาก `firebase-auth.js` และ Movie Memory
ใช้ TMDB API สำหรับค้นหาหนัง ส่วน `GEMINI_API_KEY` จะใช้เฉพาะฝั่งเซิร์ฟเวอร์
เพื่ออ่านข้อมูลจากรูปตั๋วและจะไม่ถูกส่งไปอยู่ใน JavaScript ฝั่งหน้าเว็บ

> Firebase Google Login ไม่รองรับการเปิดหน้าเว็บตรงด้วย `file://`
> และตัวอ่านตั๋วอัตโนมัติต้องเปิดผ่าน `http://localhost:3000`
> หรือโดเมน `https://taithai.app`
