/** Prints a bot's garden before each wave: npx tsx lab/siege-show.ts [waves] [bot] [season] [map] */
import { DEFENDERS } from '../src/content/siege';
import { type SiegeState, actSiege, fieldNow, newSiege, walksNow } from '../src/core/siege/run';
import { BOTS } from './siege';

const waves = Number(process.argv[2] ?? 4);
const name = process.argv[3] ?? 'Mazer';
let s: SiegeState = newSiege(`LAB${process.argv[4] ?? 0}`, 'show', process.argv[5] ?? 'kitchen');
const MARK: Record<string, string> = { rock: '##', pond: '~~', mud: ',,', rich: '+ ', hole: 'oo', lawn: '  ' };
for (let i = 0; i < waves && s.phase === 'build'; i++) {
  s = BOTS[name]!(s);
  const f = fieldNow(s);
  const on = new Set(walksNow(s).flat());
  console.log(`before wave ${s.wave}: ${s.coins} coins, ${s.seedlings} seedlings, ways ${walksNow(s).map((w) => w.length).join('/')}, elements ${s.elements.join(' ')}, shed ${JSON.stringify(s.shed)}`);
  for (let r = 0; r < f.h; r++) {
    let line = f.shape === 'hex' && r % 2 ? ' ' : '';
    for (let k = 0; k < f.w; k++) {
      const c = f.cellAt(r, k), p = s.placed.find((x) => x.cell === c);
      line += p ? (p.kind === 'bramble' ? '# ' : DEFENDERS[p.kind].name[0]! + String(p.level)) : on.has(c) ? (f.terrain[c] === 'lawn' ? '. ' : MARK[f.terrain[c]!]!.replace(' ', '.')) : MARK[f.terrain[c]!]!;
    }
    console.log('   |' + line + '|');
  }
  const r = actSiege(s, { type: 'wave' });
  console.log('   ', JSON.stringify(r.record));
  s = r.state;
}
