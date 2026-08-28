const sharpNotes = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const flatNotes = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const noteIndex: Record<string, number> = Object.fromEntries([...sharpNotes, ...flatNotes].map((note, index) => [note, index % 12]));

export function normalizeSteps(steps: number) { return ((steps % 12) + 12) % 12 }

function transposeNote(note: string, steps: number, preferFlats: boolean) {
  const index = noteIndex[note];
  if (index === undefined) return note;
  return (preferFlats ? flatNotes : sharpNotes)[normalizeSteps(index + steps)];
}

export function transposeChord(chord: string, steps: number, preferFlats = /b/.test(chord)) {
  const match = chord.trim().match(/^([A-G](?:#|b)?)([^/]*)(?:\/([A-G](?:#|b)?))?$/);
  if (!match) return chord;
  const [, root, suffix, bass] = match;
  const nextRoot = transposeNote(root, steps, preferFlats);
  const nextBass = bass ? `/${transposeNote(bass, steps, preferFlats)}` : '';
  return `${nextRoot}${suffix}${nextBass}`;
}

export function transposeKey(key: string, steps: number) { return transposeChord(key, steps) }

export function capoRecommendations(key: string) {
  const easyKeys = ['C','D','E','G','A'];
  const original = noteIndex[key];
  if (original === undefined) return [];
  return easyKeys.map(playingKey => ({
    capo: normalizeSteps(original - noteIndex[playingKey]), playingKey
  })).filter(item => item.capo > 0 && item.capo <= 7).sort((a,b) => a.capo - b.capo).slice(0, 3);
}

export function playingKeyForCapo(originalKey: string, capo: number) {
  return transposeKey(originalKey, -capo);
}
