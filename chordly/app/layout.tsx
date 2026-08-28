import type { Metadata, Viewport } from 'next';
import './globals.css';
import './soft-shapes.css';
import { Logo } from '@/components/logo';
import { SearchBox } from '@/components/search-box';
import { ServiceWorker } from '@/components/service-worker';

export const metadata: Metadata = {
  metadataBase: new URL('https://taithai.app/Chordly'),
  title: { default: 'Chordly — ค้นหาและดูคอร์ดเพลง', template: '%s | Chordly' },
  description: 'ค้นหาคอร์ดเพลง เนื้อเพลง Transpose, Capo และ Chord Diagram สำหรับกีตาร์ เปียโน และอูคูเลเล่',
  applicationName: 'Chordly',
  manifest: '/Chordly/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Chordly', statusBarStyle: 'default' },
  icons: { icon: '/Chordly/icons/icon.svg', apple: '/Chordly/icons/icon.svg' }
};

export const viewport: Viewport = { width:'device-width', initialScale:1, viewportFit:'cover', themeColor:'#09090b' };

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="th"><body><ServiceWorker/><header className="siteHeader"><div className="headerInner"><Logo/><nav className="streamNav" aria-label="เมนูหลัก"><a href="/Chordly/">หน้าแรก</a><a href="/Chordly/#trending">เพลงฮิต</a><a href="/Chordly/#ready">คอร์ดพร้อมเล่น</a></nav><div className="headerSearch"><SearchBox compact/></div><a className="backToTai" href="/">TaiThai Apps</a></div></header>{children}<footer><Logo/><p>คอร์ดที่อ่านง่าย สำหรับช่วงเวลาที่อยากเล่นเพลง</p><span>คอร์ดอัตโนมัติอาจต้องตรวจสอบกับเสียงต้นฉบับ</span></footer></body></html>;
}
