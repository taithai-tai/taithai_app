# ACE — Clear Space, Clear Mind

อัปเดต UI บนเว็บไซต์เดิม วันที่ 10 กันยายน 2026

## สิ่งที่สร้างแล้ว

เว็บไซต์ยังมี 7 หน้าหลักและ 2 หน้าประกอบ ใช้ HTML/CSS/JavaScript และ Worker เดิม ไม่มี framework เพิ่ม ระบบสมาชิก หรือระบบชำระเงิน หลังรอบนี้ผู้ใช้ขอคน 3D หมุนกลางหน้าแรก จึงเพิ่ม WebGL เฉพาะส่วนดังกล่าว รายละเอียดใน `life-overview.md`

| หน้า | การออกแบบที่เปลี่ยน |
| --- | --- |
| / | หน้าภาพรวมคน 3D กางแขนขาหมุนรอบตัว ตัวเลือกจัดเวลา/ข้อมูล/ข้อความอยู่ด้านข้าง แผนตัวอย่าง 95/120 นาทีอยู่ด้านล่าง พร้อมเนื้อหาบริการเดิม |
| /services | รายละเอียดบริการสลับด้าน, Preview เฉพาะบริการ, สิ่งที่ได้รับและข้อจำกัดบนพื้นอ่าน พร้อม CTA ที่ส่งประเภทบริการ |
| /how-it-works | ขั้นตอน 01–04 เชื่อมด้วยเส้นบาง เปลี่ยนเป็นแนวตั้งบนมือถือ และส่วนข้อมูลที่ควร/ไม่ควรเตรียม |
| /demo | หัวข้อกระชับ, Segmented Control มีไอคอนเส้น, Input/Result 40:60 บนจอกว้าง, พื้นอ่านทึบ และสถานะครบตาม logic เดิม |
| /pricing | จัดแนวชื่อ ราคา รายละเอียด และปุ่ม; ตารางเปลี่ยนเป็นรายการเทียบแต่ละแพ็กเกจบนมือถือ; คงป้ายราคาสมมติ |
| /about | จัดข้อความแบบ editorial และหลักคิดเรียงตามลำดับ ไม่เพิ่มประสบการณ์หรือข้อมูลทีมสมมติ |
| /contact | แบบฟอร์มบนพื้นขาว เก็บคำอธิบายก่อนฟอร์มบนมือถือ คงสถานะ “ยังไม่ได้ส่ง” |
| /privacy | สารบัญและพื้นอ่าน พร้อมเปิดเผยเฉพาะ preference ลดเอฟเฟกต์ที่เพิ่มจริง |
| /thank-you | พื้นอ่านในระบบเดียวกัน คงสถานะยังไม่มีระบบรับคำขอ ไม่สร้างเลขอ้างอิง |

## ระบบภาพร่วม

- Canvas ขาวมุก #F7F8FA, Ink #171A20, Accent #2563EB และแสง ice/lilac/mint เฉพาะจุด
- Floating Navigation และ Segmented Control ใช้วัสดุกระจก; ข้อความยาว ฟอร์ม ราคา และผล AI ใช้พื้นขาว
- ปุ่ม 44–48 px ขึ้นไป, ไอคอน 24 px เส้น 2.1 px, focus สีฟ้า, จังหวะตอบสนอง 160–180 ms
- หน้าแรกปัจจุบันใช้คน 3D หมุนช้า ๆ ตามคำขอล่าสุด พร้อมหยุดหมุนและภาพสำรอง; ACE Loop จากรอบก่อนเก็บ asset ไว้แต่ไม่แสดงใน Hero
- ปุ่ม “ลดเอฟเฟกต์” ใน Footer ทุกหน้าเพิ่มความทึบและหยุด animation; เคารพ prefers-reduced-motion
- ฟอนต์ตั้งต้น Noto Sans Thai พร้อม system fallback แต่ไม่ได้ฝังไฟล์ฟอนต์ใหม่ จึงต้องตรวจบนเครื่องที่ไม่มีฟอนต์นี้ด้วย

ส่วนประกอบร่วมอยู่ใน styles.css และ site.js: Floating Navigation, Primary/Secondary Button, Glass Toolbar, Reading Panel, Segmented Control, Service Preview, Form Field, Status Badge, Toast และ Footer

## Design Review

### สรุป

โครงสร้างและลำดับเนื้อหาถูกปรับตาม brief แล้ว แต่คุณภาพภาพจริงยังต้องตรวจใน Browser ไม่อ้างว่าผ่าน UX/accessibility audit

### ประเด็นสำคัญที่แก้

- แยกวัสดุนำทางออกจากเนื้อหา เพื่อไม่ให้ข้อความยาวหรือสถานะ AI อ่านยาก — Design Guideline: Materials > hierarchy และ Liquid Glass > functional/content layers
- ยกเลิกความซีดของแผงผลลัพธ์ขณะประมวลผล ใช้ข้อความสถานะและสีพื้นเฉพาะส่วนแทน — Design Guideline: Accessibility > perceivable
- เมนูเปิดแล้วกันการโฟกัสไปยังพื้นหลัง มี Escape และคืน focus ไปปุ่มเปิดเมนู — Design Guideline: Accessibility > keyboard access
- ลดปัญหาตารางเล็กบนมือถือด้วยการคงตัวหนังสือและจัดข้อมูลเป็นรายการ — Design Guideline: Layout > adaptability และ Typography > supporting scalable text
- ปิดปุ่มคัดลอก/ส่งออกสรุปเก่าขณะขอคำตอบใหม่ เพื่อไม่ให้ feedback ไม่ตรงกับข้อมูลที่แสดง

แนวทาง Apple Design ใช้เป็นหลักการสากลเท่านั้น ไม่คัดลอกหน้าจอหรืออ้างว่า CSS นี้เท่ากับวัสดุ native ของ Apple ไม่มี Dark Mode หรือ Bottom Dock เพราะอยู่นอก brief

### ยังต้องตรวจ

ภาพทุก breakpoint, Zoom 200%, ความชัดหลังผสมกระจก, keyboard จริง, screen reader, clipboard/download และสถานะ Demo กับคำตอบ AI จริง รายละเอียดและข้อจำกัดอยู่ใน TEST_REPORT.md

## สิ่งที่คงไว้

Backend ของ 9arm, endpoint/model, API key, prompts, rate limit, validation ฝั่งรับ AI, ชื่อ/ราคาแพ็กเกจ, query prefill, contact demo, ข้อจำกัด และข้อความเพื่อการศึกษาทั้งสองภาษา ไม่อ้างว่าส่งคำขอหรือนัดสำเร็จ

รอบนี้ไม่เปลี่ยน secret หรือเรียก AI จริงเพื่อทดสอบ UI และไม่เปลี่ยนระบบจริงกลับเป็น mockup

## Asset จากรอบ ACE Loop ก่อนหน้า

- ไฟล์: /workspace/sites/ace-everyday/site/assets/ace-loop.webp
- 1,024 × 1,024 px, 28,452 bytes; สร้างหนึ่งครั้งด้วย built-in imagegen แล้วลดขนาด/แปลงเป็น WebP เพื่อส่งผ่านเว็บ
- Prompt: “Premium photorealistic studio render of one gently twisted thick clear-glass oval ring, upright and floating, precise refractive edges, subtle ice-blue/lilac highlights, upper-left soft light, airy #F7F8FA background. No text, logos, UI or extra objects.”
- ข้อความใน Preview เป็น HTML ไม่อยู่ในภาพ และระบุข้อมูลตัวอย่างชัดเจน

## สถานะส่งมอบและการเผยแพร่

รอบ Clear Space, Clear Mind ก่อนเพิ่มคน 3D ได้เผยแพร่แบบส่วนตัวสำหรับเจ้าของแล้ว การเพิ่มคน 3D ตรวจและส่งต่อบน Site เดิม สถานะเผยแพร่ล่าสุดให้ยึดผลจาก Sites ที่รายงานในบทสนทนา ไม่มีภาพจำลองที่นำมาอ้างเป็น Browser QA

เมื่อได้รับคำสั่งให้เผยแพร่ ให้ใช้ Site เดิมและสิทธิ์เดิม: Build → test → บันทึก source/version → deploy saved version → ตรวจสถานะจริง ไม่ซื้อโดเมนหรือเปลี่ยนสิทธิ์ให้บุคคลอื่นเอง

ยังต้องเติมจำนวนสมาชิก ข้อมูลทีม ช่องทางติดต่อ หลักฐานผู้ใช้ไทย/Keywords และระบบรับคำขอจริงตามรายการเดิม
