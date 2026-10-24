# Cagebreakers

An offline auto-battler played on a KenKen page, for phones on airplanes.

Every unit carries a number from 1 to 6. No number may repeat in a row or column, and an outlined cage pays off only when its numbers hit the printed target. Fill a cage correctly and it seals in gold, empowering every unit inside; then the armies fight on their own, and a cage holds only until one of its members falls.

**Play:** https://kcwalr13.github.io/cagebreakers/ — open it once with a connection, add it to your home screen, and it works in airplane mode from then on.

The design lives in the [Cagebreakers design doc](https://claude.ai/artifact/NJVkJZeMok9X2xViKNu7mY).

## Status

| Milestone | What it adds | State |
| --- | --- | --- |
| M1 · The Page | Generated pages, numbers placed by drag or tap, the Latin rule, cages that seal in gold | Built |
| M2 · First Blood | 12 units, the combat simulator, clash playback and a result that explains the fight | Built |
| M3 · The Run | Shop, gold, claims, merges, 15 clashes, opponents, three Keepers, save and resume | Built |
| M4 · The Roster | 30 species, Kins, Callings, the Misprints (Blank, Smudge, Domino), tools and relics, bot balancing | Built |
| M5 · Flight-Ready | Settings and quiet sound, the Daily Page, the Codex, save codes, a first chapter that teaches by playing, an art pass | Built |

## Working on it

```sh
npm install
npm run dev         # local server
npm test            # core unit and property tests
npm run e2e         # phone-sized end-to-end tests against the production build (run npm run build first)
npm run lab -- 2000 # page generator statistics
npx tsx lab/encounter.ts  # how a fixed fight plays for random and thoughtful layouts
npx tsx lab/runs.ts 400   # bots play full runs: the balance report, checked against the design targets
npx tsx lab/ablate.ts 200 2  # each species removed from the Oracle's shop in turn: how far its win rate shifts
npm run assets      # re-copy fonts and regenerate the icon module
node scripts/app-icons.mjs  # re-render home-screen icons
```

Every push to `main` runs the tests and deploys to GitHub Pages.

## Layout

- `src/core` — the rules: seeded randomness, page generation, legality and sealing, the combat simulator, opponents, and the run as a pure state machine. Pure TypeScript; no screen, no clock, no randomness except from the seed.
- `src/content` — game data as typed data: species, Kins, Callings, items, seal rewards, balance constants, encounters.
- `src/app` — the interface: Preact, SVG board, pointer input, storage behind one adapter.
- `lab` — headless tools that run on a developer machine and never ship.
- `e2e` — Playwright tests at iPhone and Android sizes, including an offline reload.

The build uses a relative base path and keeps storage behind `src/app/storage.ts`, so it can be wrapped as an App Store or Play Store app later without changing game code. The steps are in [docs/app-stores.md](docs/app-stores.md).

## Credits

Icons by Lorc, Delapouite and contributors at [game-icons.net](https://game-icons.net), CC BY 3.0. Typefaces Alegreya and Alegreya Sans by Huerta Tipográfica, SIL Open Font License (licenses in `src/app/fonts`).
