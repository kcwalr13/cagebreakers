/**
 * Garden Siege's gardens: each a field of squares or hexagons drawn as rows of letters.
 *
 *   .  lawn             #  rock: blocks the way, nothing grows on it
 *   ~  pond: blocks the way; water defenders on its bank strike harder
 *   ,  mud: pests wade through it slowly; nothing grows on it
 *   +  rich soil: whatever grows here reaches further
 *   1 2  rabbit holes: a walking pest that steps on one comes up out of its partner (same digit), once a pair
 *   v  a gap in the hedge (top row): pests come in here, taking turns when there are two
 *   ^  a gate to the bed (bottom row): pests make for the nearest
 *
 * `strength` multiplies every pest's strength in that garden, from the bot lab (`lab/siege.ts`).
 */

export type MapShape = 'square' | 'hex';

export interface MapDef {
  id: string;
  name: string;
  blurb: string;
  shape: MapShape;
  rows: readonly string[];
  strength: number;
  startCoins: number;
}

const open = (w: number, h: number, entry: number, exit: number) =>
  Array.from({ length: h }, (_, r) => (r === 0 ? '.'.repeat(entry) + 'v' + '.'.repeat(w - entry - 1)
    : r === h - 1 ? '.'.repeat(exit) + '^' + '.'.repeat(w - exit - 1) : '.'.repeat(w)));

export const MAPS: readonly MapDef[] = [
  {
    id: 'kitchen', name: 'The Kitchen Garden', shape: 'square', strength: 1, startCoins: 40,
    blurb: 'An open lawn: the maze is all yours.',
    rows: open(11, 14, 5, 5),
  },
  {
    id: 'rockery', name: 'The Rockery', shape: 'square', strength: 1, startCoins: 40,
    blurb: 'Ridges of rock make a maze already half built. Finish it, and mind the two gates.',
    rows: [
      '......v.....',
      '............',
      '............',
      '...........+',
      '.######.....',
      '............',
      '....+.......',
      '............',
      '.....######.',
      '............',
      '..+.........',
      '............',
      '.######.....',
      '............',
      '........+...',
      '..^......^..',
    ],
  },
  {
    id: 'meadow', name: 'Bee Meadow', shape: 'hex', strength: 1, startCoins: 40,
    blurb: 'Hexagons: six ways out of every tile, so walls take more thought.',
    rows: [
      '.....v.....',
      '...........',
      '...........',
      '..+.....+..',
      '...........',
      '....#......',
      '...........',
      '.+.......+.',
      '...........',
      '......#....',
      '...........',
      '..+.....+..',
      '...........',
      '...........',
      '...........',
      '.....^.....',
    ],
  },
  {
    id: 'twogates', name: 'Two Gates', shape: 'square', strength: 0.65, startCoins: 45,
    blurb: 'Two gaps in the hedge. Pests take turns, so the maze must catch both.',
    rows: [
      '..v.......v..',
      '.............',
      '......#......',
      '......#......',
      '.....+#+.....',
      '.............',
      '.............',
      '..#.......#..',
      '.............',
      '.............',
      '.....+.+.....',
      '.............',
      '.............',
      '.............',
      '......^......',
    ],
  },
  {
    id: 'water', name: 'The Water Garden', shape: 'square', strength: 0.85, startCoins: 40,
    blurb: 'Two ponds and their muddy edges. Frogs and their kin strike harder on the banks.',
    rows: [
      '.....v......',
      '............',
      '............',
      '....,,,,....',
      '...~~~~~~...',
      '..+~~~~~~+..',
      '...~~~~~~...',
      '...,,..,,...',
      '............',
      '...,,..,,...',
      '...~~~~~~...',
      '..+~~~~~~+..',
      '...~~~~~~...',
      '....,,,,....',
      '............',
      '............',
      '......^.....',
    ],
  },
  {
    id: 'warren', name: 'The Warren', shape: 'square', strength: 0.6, startCoins: 40,
    blurb: 'Pests that step on a rabbit hole come up out of its partner. Steer them over the low ones to send them back up.',
    rows: [
      '......v.....',
      '............',
      '..1......2..',
      '............',
      '...#....#...',
      '...#....#...',
      '............',
      '............',
      '............',
      '...#....#...',
      '...#....#...',
      '............',
      '............',
      '..2......1..',
      '............',
      '.....^......',
    ],
  },
  {
    id: 'greatlawn', name: 'The Great Lawn', shape: 'square', strength: 1, startCoins: 50,
    blurb: 'Sixteen squares by twenty-two. Pinch to look closer.',
    rows: open(16, 22, 7, 8).map((row, r) => (r === 6 || r === 15 ? row.slice(0, 4) + '+' + row.slice(5, 11) + '+' + row.slice(12) : row)),
  },
  {
    id: 'honeycomb', name: 'The Honeycomb', shape: 'hex', strength: 0.9, startCoins: 50,
    blurb: 'A great field of hexagons, with rocks, a pond and a muddy patch.',
    rows: [
      '.......v.......',
      '...............',
      '...............',
      '...##......+...',
      '...............',
      '..+.......##...',
      '...............',
      '......~~~......',
      '.....~~~~......',
      '......~~~..+...',
      '...............',
      '..##...........',
      '...........##..',
      '.+.............',
      '......,,,......',
      '...............',
      '...#.......+...',
      '...#...........',
      '...............',
      '.......#.......',
      '...............',
      '.......^.......',
    ],
  },
];

export const mapById = (id: string): MapDef => MAPS.find((m) => m.id === id) ?? MAPS[0]!;
