import type { ChordShape, Instrument } from '@/lib/types';

const shapes: ChordShape[] = [
  { chord:'C', guitar:'X32010', ukulele:'0003', piano:[0,4,7] },
  { chord:'Cm', guitar:'X35543', ukulele:'0333', piano:[0,3,7] },
  { chord:'D', guitar:'XX0232', ukulele:'2220', piano:[2,6,9] },
  { chord:'Dm', guitar:'XX0231', ukulele:'2210', piano:[2,5,9] },
  { chord:'E', guitar:'022100', ukulele:'1402', piano:[4,8,11] },
  { chord:'Em', guitar:'022000', ukulele:'0432', piano:[4,7,11] },
  { chord:'F', guitar:'133211', ukulele:'2010', piano:[5,9,0] },
  { chord:'F#', guitar:'244322', ukulele:'3121', piano:[6,10,1] },
  { chord:'G', guitar:'320003', ukulele:'0232', piano:[7,11,2] },
  { chord:'Gm', guitar:'355333', ukulele:'0231', piano:[7,10,2] },
  { chord:'A', guitar:'X02220', ukulele:'2100', piano:[9,1,4] },
  { chord:'Am', guitar:'X02210', ukulele:'2000', piano:[9,0,4] },
  { chord:'B', guitar:'X24442', ukulele:'4322', piano:[11,3,6] },
  { chord:'Bm', guitar:'X24432', ukulele:'4222', piano:[11,2,6] }
];

export function baseChord(chord: string) {
  return chord.split('/')[0].replace(/(maj|min|m|sus|add|dim|aug|\d).*/, match => match.startsWith('m') && !match.startsWith('maj') ? 'm' : '');
}

export function getChordShape(chord: string) {
  const base = baseChord(chord);
  return shapes.find(shape => shape.chord === base) || shapes.find(shape => shape.chord === base.replace(/b/, '#')) || null;
}

export function shapeValue(shape: ChordShape, instrument: Instrument) { return shape[instrument] }
