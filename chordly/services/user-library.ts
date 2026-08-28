'use client';

const FAVORITES = 'chordly:favorites';
const HISTORY = 'chordly:history';

function read(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]') as string[] } catch { return [] }
}

function write(key: string, values: string[]) {
  localStorage.setItem(key, JSON.stringify(values.slice(0, 50)));
  window.dispatchEvent(new CustomEvent('chordly:library'));
}

export const userLibrary = {
  favorites: () => read(FAVORITES),
  isFavorite: (id: string) => read(FAVORITES).includes(id),
  toggleFavorite(id: string) {
    const current = read(FAVORITES);
    const next = current.includes(id) ? current.filter(item => item !== id) : [id, ...current];
    write(FAVORITES, next);
    return next.includes(id);
  },
  history: () => read(HISTORY),
  remember(id: string) { write(HISTORY, [id, ...read(HISTORY).filter(item => item !== id)]) }
};
