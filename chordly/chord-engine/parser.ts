import type { ParsedLine, ChordToken } from '../lib/types.ts';

const sectionNames: Record<string,string> = {
  intro: 'Intro', verse: 'Verse', chorus: 'Chorus', pre_chorus: 'Pre-Chorus',
  post_chorus: 'Post-Chorus', bridge: 'Bridge', solo: 'Solo', instrumental: 'Instrumental', outro: 'Outro'
};

export function parseChordLine(line: string): ChordToken[] {
  const tokens: ChordToken[] = [];
  const matcher = /\[([^\]]+)]/g;
  let chord = '';
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(line))) {
    const lyric = line.slice(cursor, match.index);
    if (lyric || chord) tokens.push({ chord, lyric });
    chord = match[1].trim().slice(0, 24);
    cursor = matcher.lastIndex;
  }
  tokens.push({ chord, lyric: line.slice(cursor) });
  return tokens;
}

export function parseChordPro(content: string): ParsedLine[] {
  return content.replace(/\r/g, '').split('\n').flatMap<ParsedLine>((raw) => {
    const line = raw.trimEnd();
    if (!line) return [{ type: 'empty' }];
    const directive = line.match(/^\{([^}:]+)(?::\s*([^}]+))?}$/);
    if (directive) {
      const name = directive[1].replace(/^start_of_/, '').replace(/^sov$/, 'verse').replace(/^soc$/, 'chorus');
      if (directive[1].startsWith('end_of_')) return [];
      if (directive[1].startsWith('start_of_') || sectionNames[name]) {
        return [{ type: 'section', name: directive[2] || sectionNames[name] || name }];
      }
      return [];
    }
    const markdownSection = line.match(/^\[([^\]]+)]$/);
    if (markdownSection) return [{ type: 'section', name: markdownSection[1] }];
    return [{ type: 'line', tokens: parseChordLine(line) }];
  });
}
