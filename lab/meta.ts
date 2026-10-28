/**
 * Scriptorium report: how each garden plays for the bots, and how fast a player progresses across
 * the map's regions, with paths to buy, goals to claim, the home garden, and the daily streak.
 * Run: npx tsx lab/meta.ts [runs per garden] [campaigns]
 */
import { HOME_ITEMS } from '../src/content/home';
import { GOALS } from '../src/content/journal';
import { ITEMS } from '../src/content/meta';
import { STATIONS, type Station } from '../src/content/stations';
import { dailyKey, dayOf } from '../src/core/calendar';
import {
  type Profile, buy, buyHome, cantBuy, claimGoal, goalsReady, isFound, layHome, newProfile, openPath, pathBlocker, plantHome, recordRun, setupFor,
  starCount, starsFor, stationOpen,
} from '../src/core/meta';
import { scoreOf, standardSetup } from '../src/core/run';
import { dailySeed } from '../src/core/seed';
import { type BotName, playRun } from './bots';
import { labSeeds } from './seeds';

const N = Number(process.argv[2] ?? 120);
const CAMPAIGNS = Number(process.argv[3] ?? 12);
const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
const quant = (xs: number[], q: number) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0; };

console.log('GARDENS (fresh profile, no upgrades)');
const thirdStar: [string, number][] = [];
for (const st of N ? STATIONS : []) {
  for (const bot of (st.zen ? ['careful'] : ['careful', 'tidy']) as BotName[]) {
    const scores: number[] = [];
    let filled = 0;
    const stars = [0, 0, 0, 0];
    const n = st.zen ? Math.min(N, 30) : N;
    for (const seed of labSeeds(n, 7000 + STATIONS.indexOf(st) * 1000)) {
      const { state } = playRun(seed, bot, setupFor(newProfile(), st.id));
      if (state.phase === 'done') { filled++; scores.push(scoreOf(state).total); }
      stars[starsFor(st, state)]!++;
    }
    if (bot === 'careful' && !st.zen) thirdStar.push([st.id, stars[3]! / n]);
    console.log(`  ${st.name.padEnd(22)} ${bot.padEnd(8)} filled ${pct(filled / n).padStart(4)}  score median ${quant(scores, 0.5)} p75 ${quant(scores, 0.75)}  stars 1/2/3: ${pct(stars[1]! / n)} ${pct(stars[2]! / n)} ${pct(stars[3]! / n)}${st.zen ? '  (Zen)' : `  (marks ${st.stars.join('/')})`}`);
  }
}

/**
 * A Careful player's campaign. Each day: one map garden (the open one with the fewest stars), and,
 * when `dailies`, the day's 6×6 Daily Garden. After each: claim goals, open the cheapest path it
 * can, buy from the shop in a sensible order, then keep beds for its seed packets and plant them.
 */
const wishlist = ['quill', 'purse-1', 'gilder', 'eraser', 'purse-2', 'bounty-hunter', 'newsprint', 'deeper-inkwell', 'inkwell', 'second-strap', 'neon'] as const;
function shop(p: Profile): Profile {
  for (const g of goalsReady(p)) p = claimGoal(p, g.id).profile;
  for (let again = true; again;) {
    again = false;
    const path = STATIONS.filter((st) => !stationOpen(p, st) && !pathBlocker(p, st)).sort((a, b) => a.price - b.price)[0];
    if (path) { p = openPath(p, path.id).profile; again = true; continue; }
    const item = wishlist.find((id) => !cantBuy(p, ITEMS.find((i) => i.id === id)!));
    // Keep enough for the next path before shopping.
    const next = STATIONS.filter((st) => !stationOpen(p, st) && isFound(p, st)).map((st) => st.price).sort((a, b) => a - b)[0] ?? 0;
    if (item && p.leaf - ITEMS.find((i) => i.id === item)!.price >= Math.min(next, 20)) { p = buy(p, item).profile; again = true; }
  }
  // A bed for every waiting packet, then plant them.
  const empty = () => p.home.tiles.findIndex((t) => !t);
  const freeBed = () => p.home.tiles.findIndex((t) => t?.item === 'bed' && !t.plant);
  while (p.home.tray.length && freeBed() < 0 && p.leaf >= HOME_ITEMS[0]!.price + 20 && empty() >= 0) {
    const bought = buyHome(p, 'bed');
    if (!bought.ok) break;
    p = layHome(bought.profile, empty(), 'bed').profile;
  }
  while (p.home.tray.length && freeBed() >= 0) p = plantHome(p, freeBed(), p.home.tray[0]!).profile;
  return p;
}

function campaign(c: number, dailies: boolean) {
  let p = newProfile();
  const seeds = labSeeds(200, 50_000 + c * 300);
  let firstBuy = -1, allPaths = -1, allItems = -1;
  const leaf: number[] = [];
  const quiet: number[] = [];
  let lastSpend = 0;
  for (let run = 1; run <= seeds.length; run++) {
    const day = dayOf(20_000 + run);
    const open = STATIONS.filter((st) => stationOpen(p, st));
    const st = open.slice().sort((a, b) => (p.stars[a.id] ?? 0) - (p.stars[b.id] ?? 0))[0] as Station;
    const earnedBefore = p.earned, spentBefore = p.earned - p.leaf;
    const { state } = playRun(seeds[run - 1]!, 'careful', setupFor(p, st.id));
    p = recordRun(p, { ...state, id: `c${c}r${run}` }, day);
    if (dailies) {
      const key = dailyKey(day, 6);
      const { state: d } = playRun(dailySeed(key), 'careful', standardSetup(6));
      p = recordRun(p, { ...d, id: `c${c}d${run}`, daily: key }, day);
    }
    p = shop(p);
    leaf.push(p.earned - earnedBefore);
    if (p.earned - p.leaf > spentBefore) { quiet.push(run - lastSpend); lastSpend = run; }
    if (firstBuy < 0 && p.earned - p.leaf > 0) firstBuy = run;
    // Every path the player could have found: a map-only player never keeps a daily streak for the Orangery,
    // and these players never play the Weekly Garden that finds the Physic Garden.
    if (allPaths < 0 && STATIONS.every((s2) => stationOpen(p, s2) || (!dailies && s2.reveal?.kind === 'streak') || s2.reveal?.kind === 'weeklies')) allPaths = run;
    if (allItems < 0 && ITEMS.every((i) => p.owned.includes(i.id))) allItems = run;
    if (allPaths > 0 && allItems > 0) break;
  }
  return { firstBuy, allPaths, allItems, leaf, quiet, stars: starCount(p).have, goals: p.journal.length, found: p.found.length, streak: p.daily.best };
}

const results: Record<string, ReturnType<typeof campaign>[]> = { map: [], daily: [] };
for (const mode of ['map', 'daily'] as const) {
  for (let c = 0; c < CAMPAIGNS; c++) results[mode]!.push(campaign(c, mode === 'daily'));
  const rs = results[mode]!;
  console.log(`\nCAMPAIGNS (${CAMPAIGNS} Careful players, ${mode === 'map' ? 'map gardens only' : 'a map garden and the 6×6 Daily Garden each day'})`);
  const all = rs.flatMap((r) => r.leaf);
  console.log(`  seeds per day: median ${quant(all, 0.5)}, mean ${(all.reduce((a, b) => a + b, 0) / all.length).toFixed(1)}, p90 ${quant(all, 0.9)}`);
  console.log(`  first purchase after day ${quant(rs.map((r) => r.firstBuy), 0.5)}; days between purchases: median ${quant(rs.flatMap((r) => r.quiet), 0.5)}, p90 ${quant(rs.flatMap((r) => r.quiet), 0.9)}`);
  console.log(`  every path ${mode === 'map' ? '(but the Orangery and the Physic Garden, found by a daily streak and Weekly Gardens) ' : '(but the Physic Garden, found by Weekly Gardens) '}open after ${quant(rs.map((r) => r.allPaths), 0.5)} days (median; -1 = not within 200), every shop item after ${quant(rs.map((r) => r.allItems), 0.5)}`);
  console.log(`  at the end: ${quant(rs.map((r) => r.stars), 0.5)} stars, ${quant(rs.map((r) => r.goals), 0.5)} of ${GOALS.length} goals, ${quant(rs.map((r) => r.found), 0.5)} hidden gardens found, best streak ${quant(rs.map((r) => r.streak), 0.5)}`);
}

const lo = Math.min(...thirdStar.map(([, x]) => x)), hi = Math.max(...thirdStar.map(([, x]) => x));
console.log(`\nTARGET Careful earns the third star in 15–40% of runs at every garden: ${pct(lo)}–${pct(hi)} ${lo >= 0.15 && hi <= 0.4 ? 'pass' : `FAIL (${thirdStar.filter(([, x]) => x < 0.15 || x > 0.4).map(([id]) => id).join(', ')})`}`);
const paths = quant(results.map!.map((r) => r.allPaths), 0.5);
console.log(`TARGET a Careful player (map only) opens every path after 40–90 days: ${paths} ${paths >= 40 && paths <= 90 ? 'pass' : 'FAIL'}`);
const gap = quant(results.map!.flatMap((r) => r.quiet), 0.9);
console.log(`TARGET something to buy or open at least every 3 days (p90): ${gap} ${gap <= 3 ? 'pass' : 'FAIL'}`);
const first = quant(results.map!.map((r) => r.firstBuy), 0.5);
console.log(`TARGET the first purchase comes after the first day: ${first} ${first === 1 ? 'pass' : 'FAIL'}`);
