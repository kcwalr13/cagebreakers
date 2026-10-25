# Plot Twist

An offline number puzzle for phones on airplanes: one KenKen garden, planted over a few weeks. Gardens run from 5×5 to 8×8, and every one has exactly one solution.

No number may repeat in a row or column, and an outlined plot blooms only when its numbers hit the target in its corner. Each week deals a few more numbers and brings three requests ("Row 3 adds to 12 or more", "Make a × plot bloom", "No 6 in column 2"). Anything in the garden can move, but a number in its right square never has to: the requests steer where each week's numbers go, and when one seems to need a number moved, that number is wrong. Miss the required one and a drop of water dries up; bonus requests and blooming plots pay coins. In harvest week the last numbers go in, and the garden is full.

Between gardens, a finished garden earns seeds. The map has four regions of gardens, 27 in all, each with a twist: stars open each region, seeds open the paths between gardens, and four gardens stay hidden until you find them. Some gardens twist the puzzle itself: fences (a < or > between two squares), lost labels (plots show only their target), crossed paths (the long diagonals count) and Zen gardens (no requests, no water, just the puzzle). Every finished garden leaves a seed packet for your home garden, where plants grow with every week you water. There's a Daily Garden of each size with a streak bonus, a Weekly Garden with a new twist every Monday, a journal of goals worth seeds, the Potting Shed's tools, upgrades, looks and garden ornaments, and the Herbarium keeps every garden you've grown.

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
| M9 · The Grounds | Four regions with paths bought with seeds and hidden gardens; fences, lost labels, crossed paths and Zen gardens; a daily streak with a grace day; the Weekly Garden; a journal of goals; and a home garden that grows as you play | Built |

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
npm run assets      # re-copy fonts and regenerate the icon module
node scripts/app-icons.mjs  # re-render home-screen icons
```

Every push to `main` runs the tests and deploys to GitHub Pages.

## Layout

- `src/core` — the rules: seeded randomness, page generation (with its twists) and a solver that proves one solution, legality and sealing, commissions (and the proof that all three can be met before they're posted), the run as a pure state machine, the scriptorium profile (leaf, stars, paths, the streak, the journal, the library) and the home garden. Pure TypeScript; no screen, no clock, no randomness except from the seed.
- `src/content` — game data: the shape of a run, tool prices, commission pay and difficulty, the regions and gardens, the shop, the home garden's plants and ornaments, and the journal's goals.
- `src/app` — the interface: Preact, SVG board, pointer input, storage behind one adapter.
- `lab` — headless tools that run on a developer machine and never ship.
- `e2e` — Playwright tests at iPhone and Android sizes, including an offline reload.

The build uses a relative base path and keeps storage behind `src/app/storage.ts`, so it can be wrapped as an App Store or Play Store app later without changing game code. The steps are in [docs/app-stores.md](docs/app-stores.md).

## Credits

Icons by Lorc, Delapouite and contributors at [game-icons.net](https://game-icons.net), CC BY 3.0. Typefaces Fraunces (Undercase Type), Alegreya Sans (Huerta Tipográfica), Nunito and DM Sans, all under the SIL Open Font License (licenses in `src/app/fonts`).
