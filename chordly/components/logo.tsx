import Link from 'next/link';
import { MusicIcon } from './icons';

export function Logo() {
  return <Link href="/" className="logo" aria-label="Chordly หน้าแรก"><span className="logoMark"><MusicIcon/></span><span>Chordly</span></Link>;
}
