/** Prints a bot's field before each wave: npx tsx lab/siege-show.ts [waves] */
import { DEFENDERS } from '../src/content/siege';
import { H, W } from '../src/core/siege/field';
import { actSiege, newSiege, walkNow, type SiegeState } from '../src/core/siege/run';
import { BOTS } from './siege';

const waves = Number(process.argv[2] ?? 4);
const name = process.argv[3] ?? 'Mazer';
let s: SiegeState = newSiege('LAB0');
for (let i = 0; i < waves && (s.phase === 'build' || s.phase === 'pick'); i++) {
  s = BOTS[name]!(s);
  const walk = new Set(walkNow(s));
  console.log(`before wave ${s.wave}: ${s.coins} coins, ${s.seedlings} seedlings, route ${walk.size}`);
  for (let r = 0; r < H; r++) {
    let line = '';
    for (let k = 0; k < W; k++) {
      const c = r * W + k, p = s.placed.find((x) => x.cell === c);
      line += p ? (p.kind === 'hedge' ? '#' : DEFENDERS[p.kind].name[0]! + String(p.level)) .padEnd(2) : walk.has(c) ? '. ' : '  ';
    }
    console.log('   |' + line + '|');
  }
  const r = actSiege(s, { type: 'wave' });
  console.log('   ', JSON.stringify(r.record));
  s = r.state;
}
