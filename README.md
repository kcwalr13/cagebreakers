# Plot Twist

Offline puzzle games for phones on airplanes, in one garden. The **Number Garden** is a KenKen garden, planted over a few weeks; gardens run from 5×5 to 8×8, and every one has exactly one solution. **Dewfall** is a logic puzzle: a slug crossed the garden in the night, and you find its one trail from the clues the morning leaves. **Garden Siege** is tower defense with mazing: plant hedges so the pests walk the long way round, and defenders to stop them.

No number may repeat in a row or column, and an outlined plot blooms only when its numbers hit the target in its corner. Each week deals a few more numbers and brings three requests ("Row 3 adds to 12 or more", "Make a × plot bloom", "Plant a 5 in row 2"). Anything in the garden can move, but a number in its right square never has to: requests only ever ask for more, never for a square left empty, and planting your numbers where they truly go meets the required one. When a request seems to need a number moved, that number is wrong. Miss the required one and a drop of water dries up; bonus requests and blooming plots pay coins. In harvest week the last numbers go in, and the garden is full.

Between gardens, a finished garden earns seeds. The map has five regions of gardens, 34 in all, each with a twist: stars open each region, seeds open the paths between gardens, and five gardens stay hidden until you find them. Some gardens twist the puzzle itself: fences (a < or > between two squares), lost labels (plots show only their target), crossed paths (the long diagonals count), and in the Botanic Garden shade (even numbers only), runners (two numbers one apart), bean poles (numbers climb from root to tip), elbow room (no number touches itself, even at a corner) and tidy plots (no repeats in a plot); Zen gardens have no requests and no water, just the puzzle. Every finished garden leaves a seed packet for your home garden, where plants grow with every week you water. There's a Daily Garden of each size with a streak bonus, a Weekly Garden with a new twist every Monday, a journal of goals worth seeds, the Potting Shed's tools, upgrades, looks and garden ornaments, and the Herbarium keeps every garden you've grown, with a diary of each week's requests.

In Dewfall, the trail runs from the gap in the hedge to the bed, square to square, never beside itself. Counts above and beside the garden say how many trail squares each column and row holds (mist hides some), and clues sit on squares: dew counts the trail among the eight squares around it, a leaf among the four beside it, a scarecrow along the line it faces; the trail runs straight over a pebble and turns on an acorn. Mark trail and not-trail by tapping or dragging. Every puzzle has one trail that fits, found by reasoning, never guessing. The book has seven chapters, each bringing in a clue, and there are three new daily puzzles every day. The lantern lights one square when you're stuck, for one star of the two.

In Garden Siege, pests come through the gaps in the hedge in 20 waves and make for the seedling bed. Pick one of eight gardens: an open lawn, a rockery whose ridges make half a maze, a water garden of ponds, mud and rich soil, a warren of rabbit holes that drop pests out of their partners (so a way over a low hole sends them back up the garden), two gaps that take turns, the 16×22 Great Lawn, and two fields of hexagons. Pinch or tap the zoom button to look closer. Between waves you tap or drag to plant brambles: they make the pests walk the long way round (pests always take the shortest way left, and a bramble can't close it), and they scratch whatever passes. Everything else grows from a bramble. Unlock elements in Seeds (the first is free, each one after costs more) and grow brambles into their defenders: frogs (water), hedgehogs (earth, through armour), thrushes (air, double on flyers) and marigolds (sun, everything in reach). Upgrade a defender twice, then grow it into the hybrid of its element and another you've unlocked: toad, dragonfly, salamander, mantis, owl or bumblebee. Pests come in layers: a snail's shell cracks to leave a slug, aphid swarms split in three, beetles wear armour, moths fly over everything, and a Great Snail comes at waves 10 and 20. Coins come from pests stopped and each wave, and coins you keep earn interest (shown beside your coins). A bramble can grow into a beehive that makes honey after every wave, and the Shed sells improvements in ranks: compost (more interest), sharp thorns, a cold frame (cheaper growing) and a watering can (harder strikes). Watch each wave at 1×, 2× or 4×.

**Play:** https://kcwalr13.github.io/cagebreakers/ — open it once with a connection, add it to your home screen, and it works in airplane mode from then on.

The design lives in the [Plot Twist design doc](https://claude.ai/artifact/NJVkJZeMok9X2xViKNu7mY).

The game was called Cagebreakers until M8. The code, the web address, save codes and storage keys keep that name and the original words (cage, seal, page, ink, gold, leaf, station, scriptorium), so saves carry over; only what players see speaks garden. The design doc's Garden words table maps one to the other.

## Status

| Milestone | What it adds | State |
| --- | --- | --- |
| M1 · The Page | Generated pages, numbers placed by drag or tap, the Latin rule, cages that seal in gold | Built |
| M2 · First Blood | 12 units, the combat simulator, clash playback and a result that explains the fight | Built |
| M3 · The Run | Shop, gold, claims, merges, 15 clashes, opponents, three Keepers, save and resume | Built |
| M4 · The Roster | 30 species, Kins, Callings, the Misprints (Blank, Smudge, Domino), tools and relics, bot balancing | Built |
| M5 · Flight-Ready | Settings and quiet sound, the Daily Page, the Codex, save codes, a first chapter that teaches by playing, an art pass | Built |
| M6 · Commissions | The battle is retired: numbers are the only pieces, each round deals more of them under three commissions, and the final round fills the page | Built |
| M7 · The Scriptorium | Gold leaf, a map of six stations with stars, a shop of tools, upgrades and styles, the satchel and the library | Built |
| M8 · Plot Twist | The whole game becomes a garden with the same rules: plots that bloom, weeks, water, coins and seeds, and four looks (Botanical, Night Garden, Cottage Garden and Greenhouse); right numbers never have to move, a season is six weeks, gardens of 5×5, 7×7 and 8×8 with a Daily Garden of each size, and every page has one solution | Built |
| M9 · The Grounds | Four regions with paths bought with seeds and hidden gardens; fences, lost labels, crossed paths and Zen gardens; a daily streak with a grace day; the Weekly Garden; a journal of goals; and a home garden that grows as you play. A second build: requests that never fight right play, a garden diary, and the Botanic Garden with five more twists | Built |
| M10 · Night Watch | A second game on the title: tower defense where you can't see the path. Played and retired: it splits into Dewfall and Garden Siege | Retired |
| M11 · Dewfall | The trail puzzle on its own: counts, mist, dew, leaves, pebbles, acorns and scarecrows; a book of seven chapters and three daily puzzles | Built |
| M12 · Garden Siege | Tower defense with mazing: hedges to shape the pests' path, layered pests, defenders with upgrades and hybrid picks, over 20 waves. A second build answers Kyle's notes: a bigger garden, brambles that scratch, and a tech tree of elements, defenders and hybrids grown from brambles. A third adds eight gardens (rock, ponds, mud, rich soil, rabbit holes, two gaps, a great lawn, hexagons) with pinch zoom, and an economy of interest, beehives and the Shed | Built |

## Working on it

```sh
npm install
npm run dev         # local server
npm test            # core unit and property tests
npm run e2e         # phone-sized end-to-end tests against the production build (run npm run build first)
npm run lab -- 2000 six # page generator statistics for a kind of page (five, six, seven, eight, …)
npx tsx lab/runs.ts 400   # three bots play full runs: the balance report, checked against the design targets
npx tsx lab/runs.ts 200 all 8  # the same on another size of garden (5, 7 or 8)
npx tsx lab/meta.ts       # every garden for the bots, and how fast a Careful player progresses across the map
npx tsx lab/calibrate.ts 120 espalier  # star marks for a map garden
npx tsx lab/friction.ts 40     # how often requests fight a player who plants numbers where they truly go
npx tsx lab/dewfall.ts 20      # Dewfall: how each chapter's and daily puzzles are made, and how hard they are
npx tsx lab/siege.ts 4 -v      # Garden Siege: bots that maze, don't, only plant brambles, or do nothing play whole seasons in every garden (--maps, --bots, --economy)
npm run assets      # re-copy fonts and regenerate the icon module
node scripts/app-icons.mjs  # re-render home-screen icons
```

Every push to `main` runs the tests and deploys to GitHub Pages.

## Layout

- `src/core` — the rules: seeded randomness, page generation (with its twists) and a solver that proves one solution, legality and sealing, commissions (and the proof that all three can be met before they're posted), the run as a pure state machine, the scriptorium profile (leaf, stars, paths, the streak, the journal, the library) and the home garden. `src/core/dewfall` is Dewfall: the hidden trail, its clues, a logic solver that proves each puzzle has one trail and can be reasoned out, the generator, and attempts and the profile as pure functions. `src/core/siege` is Garden Siege: a field of squares or hexagons built from a garden's map, the pests' shortest ways (through rabbit holes too), a wave simulated in fixed ticks, and the season as a pure state machine. Pure TypeScript; no screen, no clock, no randomness except from the seed.
- `src/content` — game data: the shape of a run, tool prices, commission pay and difficulty, the regions and gardens, the shop, the home garden's plants and ornaments, and the journal's goals; `src/content/dewfall.ts` holds Dewfall's chapters and daily puzzle shapes, `src/content/siege.ts` Garden Siege's pests, defenders, waves, the Shed and the economy, and `src/content/siege-maps.ts` its gardens.
- `src/app` — the interface: Preact, SVG board, pointer input, storage behind one adapter.
- `lab` — headless tools that run on a developer machine and never ship.
- `e2e` — Playwright tests at iPhone and Android sizes, including an offline reload.

The build uses a relative base path and keeps storage behind `src/app/storage.ts`, so it can be wrapped as an App Store or Play Store app later without changing game code. The steps are in [docs/app-stores.md](docs/app-stores.md).

## Credits

Icons by Lorc, Delapouite and contributors at [game-icons.net](https://game-icons.net), CC BY 3.0. Typefaces Fraunces (Undercase Type), Alegreya Sans (Huerta Tipográfica), Nunito and DM Sans, all under the SIL Open Font License (licenses in `src/app/fonts`).
