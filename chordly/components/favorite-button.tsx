'use client';
import { useEffect, useState } from 'react';
import { HeartIcon } from './icons';
import { userLibrary } from '@/services/user-library';

export function FavoriteButton({songId, compact=false}:{songId:string; compact?:boolean}) {
  const [favorite, setFavorite] = useState(false);
  useEffect(() => setFavorite(userLibrary.isFavorite(songId)), [songId]);
  return <button className={compact?'iconButton':'softButton'} aria-label={favorite?'นำออกจากรายการโปรด':'เพิ่มในรายการโปรด'} aria-pressed={favorite} onClick={(event) => {event.preventDefault(); event.stopPropagation(); setFavorite(userLibrary.toggleFavorite(songId))}}><HeartIcon filled={favorite}/>{!compact && <span>{favorite?'บันทึกแล้ว':'บันทึก'}</span>}</button>;
}
