# Plot Twist

An offline number puzzle for phones on airplanes: one KenKen garden, planted over eight weeks.

No number may repeat in a row or column, and an outlined plot blooms only when its numbers hit the target in its corner. Each week deals a few more numbers and brings three requests ("Row 3 adds to 12 or more", "Make a × plot bloom", "No 6 in column 2"). Anything in the garden can move, so each week's requests pull last week's garden apart. Miss the required one and a drop of water dries up; bonus requests and blooming plots pay coins. In harvest week the last numbers go in, and the garden is full.

Between gardens, a finished garden earns seeds, which buy tools, upgrades and looks in the Potting Shed that stay with you. A map of six gardens, each with a twist, opens as you finish them, and the Herbarium keeps every garden you've grown.

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
| M8 · Plot Twist | The whole game becomes a garden with the same rules: plots that bloom, weeks, water, coins and seeds, and four looks (Botanical, Night Garden, Cottage Garden and Greenhouse) | Built |

## Working on it

```sh
npm install
npm run dev         # local server
npm test            # core unit and property tests
npm run e2e         # phone-sized end-to-end tests against the production build (run npm run build first)
npm run lab -- 2000 # page generator statistics
npx tsx lab/runs.ts 400   # three bots play full runs: the balance report, checked against the design targets
npx tsx lab/meta.ts       # every station for the bots, and how fast a Careful player progresses
npm run assets      # re-copy fonts and regenerate the icon module
node scripts/app-icons.mjs  # re-render home-screen icons
```

Every push to `main` runs the tests and deploys to GitHub Pages.

## Layout

- `src/core` — the rules: seeded randomness, page generation, legality and sealing, commissions (and the proof that all three can be met before they're posted), the run as a pure state machine, and the scriptorium profile (leaf, stars, purchases, library). Pure TypeScript; no screen, no clock, no randomness except from the seed.
- `src/content` — game data: the shape of a run, tool prices, commission pay and difficulty, the stations, and the shop.
- `src/app` — the interface: Preact, SVG board, pointer input, storage behind one adapter.
- `lab` — headless tools that run on a developer machine and never ship.
- `e2e` — Playwright tests at iPhone and Android sizes, including an offline reload.

The build uses a relative base path and keeps storage behind `src/app/storage.ts`, so it can be wrapped as an App Store or Play Store app later without changing game code. The steps are in [docs/app-stores.md](docs/app-stores.md).

## Credits

Icons by Lorc, Delapouite and contributors at [game-icons.net](https://game-icons.net), CC BY 3.0. Typefaces Fraunces (Undercase Type), Alegreya Sans (Huerta Tipográfica), Nunito and DM Sans, all under the SIL Open Font License (licenses in `src/app/fonts`).
