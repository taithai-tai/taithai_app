# Taithai Apps

## ACE — ผู้ช่วย AI สำหรับชีวิตประจำวัน

ACE เพิ่มเป็นแอปที่ 10 ในหน้ารวมแอป เปิดที่ `/ACE/` และมีครบ 9 หน้า
โค้ดแอปแยกอยู่ใน `ace/` ดูคู่มือ build และตั้งค่า backend ที่ `ace/README.md`
คำสั่ง `npm run dev` เตรียมหน้า ACE ให้โดยอัตโนมัติ
ก่อนใช้ AI บน Vercel ต้องกำหนด `NINEARM_API_KEY` เป็น server environment variable
บนโปรเจกต์ taithai-app แล้ว deploy ใหม่ ไม่ต้องเปลี่ยน provider หรือคีย์เดิม
การตั้งค่าคีย์บนโฮสต์อื่นไม่ย้ายมาตามโค้ด Git

ชุดเว็บแอปขนาดเล็กของ Taithai รวมถึง Movie Memory, Temporary Chat,
QR Code tools, URL Shortener และ Degree Plan Explorer

## Run Locally

**Prerequisites:**  Node.js


1. สร้าง `.env.local` และกำหนด `OPENROUTER_API_KEY` สำหรับระบบอ่านตั๋วหนัง
2. เริ่ม local server (ไม่ต้องติดตั้ง dependencies):
   `npm run dev`
3. เปิด `http://localhost:3000`

ระบบล็อกอินใช้ Firebase configuration จาก `firebase-auth.js` และ Movie Memory
ใช้ TMDB API สำหรับค้นหาหนัง ส่วน `OPENROUTER_API_KEY` จะใช้เฉพาะฝั่งเซิร์ฟเวอร์
เพื่ออ่านข้อมูลจากรูปตั๋วผ่าน OpenRouter และจะไม่ถูกส่งไปอยู่ใน JavaScript
ฝั่งหน้าเว็บ ตัวอ่านตั๋วใช้ `google/gemma-4-26b-a4b-it:free` เป็นโมเดลหลัก
และเปลี่ยนไปใช้ `openrouter/free` อัตโนมัติเมื่อโมเดลหลักไม่พร้อม

> Firebase Google Login ไม่รองรับการเปิดหน้าเว็บตรงด้วย `file://`
> และตัวอ่านตั๋วอัตโนมัติต้องเปิดผ่าน `http://localhost:3000`
> หรือโดเมน `https://taithai.app`

## Deploy on Vercel

กำหนด Environment Variables ต่อไปนี้ให้ครบทั้ง Production, Preview และ
Development แล้ว Redeploy โปรเจกต์:

- `OPENROUTER_API_KEY` — คีย์ลับของ OpenRouter
- `OPENROUTER_MODEL` — `google/gemma-4-26b-a4b-it:free`

อย่าใส่คีย์ลงใน Git หรือ JavaScript ฝั่งหน้าเว็บ ไฟล์ `.env.local` ใช้เฉพาะ
localhost และถูกตัดออกจาก Git อยู่แล้ว
