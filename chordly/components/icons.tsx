import type { SVGProps } from 'react';

type Props = SVGProps<SVGSVGElement>;
const base = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
export const SearchIcon = (p: Props) => <svg {...base} {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>;
export const HeartIcon = ({filled,...p}: Props & {filled?:boolean}) => <svg {...base} {...p} fill={filled?'currentColor':'none'}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5a5.5 5.5 0 0 0 1-8.9Z"/></svg>;
export const PlayIcon = (p: Props) => <svg {...base} {...p}><path d="m8 5 11 7-11 7Z" fill="currentColor"/></svg>;
export const PauseIcon = (p: Props) => <svg {...base} {...p}><path d="M8 5v14M16 5v14"/></svg>;
export const ShareIcon = (p: Props) => <svg {...base} {...p}><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"/></svg>;
export const ChevronIcon = (p: Props) => <svg {...base} {...p}><path d="m9 18 6-6-6-6"/></svg>;
export const MusicIcon = (p: Props) => <svg {...base} {...p}><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>;
export const CloseIcon = (p: Props) => <svg {...base} {...p}><path d="M6 6l12 12M18 6 6 18"/></svg>;
export const ResetIcon = (p: Props) => <svg {...base} {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>;
