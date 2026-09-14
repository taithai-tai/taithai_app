# ACE — เอซ

บริการออกแบบผู้ช่วย AI สำหรับชีวิตประจำวัน (โครงงาน IT 428)
เวอร์ชันนี้คงดีไซน์กระจก สีพาสเทล และโมเดลคนสีขาวหมุนจาก ACE ล่าสุด

## โครงสร้าง

- `site/`: ทั้ง 9 หน้า, ดีไซน์ และ JavaScript ฝั่งผู้ใช้
- `site/assets/site-data.js`: แบรนด์ บริการ ราคา FAQ และสถานะระบบ
- `worker/index.template.js`: ตรรกะ AI เดิม, validation, rate limit และ streaming
- `api/ace.js`: ตัวรับคำขอสำหรับ Vercel / Node.js ไม่มีคีย์อยู่ในโค้ด
- `scripts/build.mjs`: สร้าง static site และปรับ base path ตอน build
- `tests/`: การทดสอบตรรกะเดิมและการติดตั้งใต้ subpath

## รันและเผยแพร่

Node.js 22 ขึ้นไป ไม่ต้องติดตั้งแพ็กเกจเพิ่มเติมสำหรับ ACE

```sh
npm run build
npm test
```

Vercel: ใช้ Build Command `npm run build`, Output Directory `public` และใช้
`vercel.json` ในโฟลเดอร์นี้ สำหรับ standalone deploy ให้ root เป็นโฟลเดอร์นี้
นำทั้งโฟลเดอร์ไปเป็น Git repository แยกได้ทันที

กำหนด **server environment variables** ใน Vercel ของโฮสต์ปลายทาง:

- `NINEARM_API_KEY`: คีย์เดิมของ ACE (ค่าลับ ห้าม commit)
- `NINEARM_BASE_URL` และ `NINEARM_MODEL`: ค่าเริ่มต้นอยู่ใน `.env.example`

หลังเพิ่มค่าลับต้อง deploy ใหม่ ค่า `configured: true` ของ GET `/api/ace/`
บอกเพียงว่ามีค่าลับ ต้องทดสอบ POST จริงก่อนยืนยันว่า AI ใช้งานได้
การตั้งค่าบนโฮสต์ ACE เดิมไม่ถูกส่งตาม Git repository มาด้วย
ไม่มีการเปลี่ยนเป็นผลจำลองเมื่อ AI ล้มเหลว

## การติดตั้งใน taithai.app

สคริปต์ build หลักเรียก `buildACE` โดยใช้ base path `/ACE` และเพิ่มผลลัพธ์ลง
`public/ACE/` ส่วน `/api/ace.js` ที่ราก repository เชื่อมกับ backend นี้
ลิงก์บนหน้ารวมแอปมีทั้งภาษาไทยและอังกฤษ และเปิดในแท็บเดิม
`ace/` ถูกยกเว้นจากการคัดลอกแบบสาธารณะ จึงไม่มี server source, tests หรือ
environment files หลุดไปใน static output

หน้า: `/`, `/services`, `/how-it-works`, `/demo`, `/pricing`, `/about`,
`/contact`, `/privacy`, `/thank-you` ทั้งหมดอยู่ใต้ `/ACE/` เมื่อ build ใน hub
พารามิเตอร์บริการและแพ็กเกจยังตามไปถึงแบบฟอร์ม

## สถานะที่ต้องรักษา

AI ใช้ backend จริงเมื่อกำหนดค่าการเชื่อมต่อแล้ว ไม่ส่งคีย์ไปเบราว์เซอร์
rate limit อยู่ในหน่วยความจำของแต่ละ server instance ไม่ใช่โควตารวมถาวร
แบบฟอร์มติดต่อสร้างสรุปบนอุปกรณ์เท่านั้น ยังไม่ได้ส่งคำขอหรือยืนยันนัด
ไม่มีชำระเงิน ระบบสมาชิก หรือระบบวิเคราะห์พฤติกรรมของ ACE

ยังต้องเติมจำนวนสมาชิก ข้อมูลทีม ช่องทางติดต่อ และระบบรับคำขอจริง
ยังไม่สรุปว่าผ่านเกณฑ์จำนวนหน้าจนทราบจำนวนสมาชิก
ต้องตรวจความไม่ซ้ำของแนวคิดและรูปแบบเครื่องมือกับอาจารย์

This website is created for educational purposes only.
เว็บไซต์นี้จัดทำขึ้นเพื่อวัตถุประสงค์ทางการศึกษาเท่านั้น
