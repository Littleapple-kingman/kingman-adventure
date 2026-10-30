# KINGMAN Adventure v2
เกม Side-scrolling Endless Runner ที่เขียนใหม่ด้วย React + Vite + Canvas

## เริ่มเล่นในเครื่อง
1. ติดตั้ง Node.js รุ่น LTS
2. แตก ZIP แล้วเปิดโฟลเดอร์นี้ใน Terminal
3. รัน `npm install`
4. รัน `npm run dev` แล้วเปิด URL ที่แสดงใน Terminal
5. ทดสอบ production build ด้วย `npm run build`

## การควบคุม
- คอมพิวเตอร์: `Space` / `↑` / `W` เพื่อกระโดด, `↓` / `S` เพื่อสไลด์
- โทรศัพท์: ปัดขึ้นเพื่อกระโดด, ปัดลงเพื่อสไลด์ หรือใช้ปุ่มบนหน้าจอ
- ตัวละครวิ่งไปข้างหน้าอัตโนมัติ ไม่มีการเปลี่ยนเลน

## รูป KINGMAN
เพิ่มภาพ KINGMAN จากผู้ใช้ไว้ให้แล้วที่ `public/kingman.png` โดยตัดพื้นหลังสีน้ำเงินออกและทำเป็น PNG โปร่งใส เกมจะโหลดภาพนี้ให้อัตโนมัติ หากต้องการเปลี่ยนภาพภายหลัง ให้ใช้ชื่อไฟล์ `kingman.png` และวางทับไฟล์เดิมใน `public/` หากโหลดภาพไม่ได้ เกมจะใช้ตัวละครวาดด้วย Canvas เป็นตัวสำรอง

## Supabase เดิม
โปรเจกต์นี้คงชื่อตาราง `public.kingman_scores` และคอลัมน์เดิมไว้ ไม่ต้องสร้าง Supabase ใหม่
ตั้งค่า Environment Variables เดิมใน Vercel:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (ใช้ Publishable/anon key เท่านั้น ห้ามใส่ service_role key)

ไม่ต้องคัดลอก `.env` จากเครื่องเดิมขึ้น GitHub และห้ามส่ง Secret Key มาในแชต

## Deploy Vercel
- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`
- คง Environment Variables เดิมไว้ใน Project Settings > Environment Variables

## หมายเหตุ
Leaderboard จะทำงานเมื่อ Supabase URL และ anon/publishable key ถูกตั้งค่า และตาราง/Policy รองรับตาม `supabase.sql` แล้ว หากโปรเจกต์เดิมมี policy ที่เข้มงวดกว่า อย่ารัน SQL ซ้ำโดยไม่ตรวจสอบก่อน
