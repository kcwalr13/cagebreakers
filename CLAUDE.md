# Plot Twist: notes for Claude

Plot Twist was called Cagebreakers until M8. Players see garden words (plot, bloom, week, water, coins, seeds,
garden, request, Potting Shed, Herbarium, tool belt, path, home garden, journal, garden diary; the twists are
fences, lost labels, crossed paths, shade, runners, bean poles, elbow room, tidy plots and Zen gardens); the
code, storage keys, save-code id and web address keep the original names (cage, seal, round, ink, gold, leaf,
page, commission, scriptorium, library, satchel, `cagebreakers.*`). Write player-facing text in garden words;
the design doc's Garden words table maps the two. Fonts are bundled open fonts: Fraunces and Alegreya Sans,
Nunito (Cottage Garden), DM Sans (Greenhouse).

Kyle is the visionary; Claude builds. The design doc is the source of truth:
https://claude.ai/artifact/NJVkJZeMok9X2xViKNu7mY. Read it (docs tools) before changing gameplay, keep
it true to the build in the same step, and log calls Claude makes on its own in its Decision log.

Stop and ask Kyle only when a pillar conflicts with what can be built, a change would alter the core
loop or anything Kyle owns (vision, pillars, art direction, name, scope), or a taste call has no
defensible default. Each milestone ends at a gate only Kyle can pass.

## Rules of the codebase

- `src/core` is pure and deterministic: no DOM, no `Date`, no `Math.random`. All randomness comes from
  `stream(seed, name)`. A run must be reproducible from its seed and action list.
- Balance numbers live in content data, not in code paths or the design doc.
- The app never decides a rule; it asks `src/core`.
- Nothing is fetched at runtime. Fonts and icons are bundled (`npm run assets`).
- Every interactive control is at least 44 points; the e2e suite checks it.
- Commissions must be provably possible: `src/core/commission.ts` only posts one after finding legal layouts
  (subsets of the hidden solution) that meet it. A new kind needs `measure`, `describe`, `readout`, `cellsOf`
  and a candidate in `candidates`, plus its pay and rounds in `src/content/commissions.ts`.
- Every round must have a perfect round: all three commissions met with every number placed. `planRound`
  returns the posted commissions and a `proof` layout of every number meeting all three; it lives in
  `RunState.proof`, and any tool that changes your numbers or the page (Extra, Dig) must keep one or be
  refused for free.
- Requests never fight right play: no posted kind may be broken by adding a right number (`RETIRED_KINDS` in
  `src/content/commissions.ts` lists the kinds that could, kept only so old saves read), and the required request
  is chosen so that layouts of every number you hold in right squares meet it (`DIFFICULTY.requiredRight`).
  After a change to posting, `npx tsx lab/friction.ts 40` must pass too.
- Right numbers stay: `RunState.rooted` lists cells holding their right (hidden-solution) number when the round
  began, and every proof leaves them in place (`Holding.rooted`, honored by `sampleLayout` and `findLayout`).
  No request may ever need a right number moved. Nothing on screen marks which numbers are right.
- Every number is alike: to ink, all your numbers are on the page, or all but one (`placementOf`). Token
  `round` is history, not a rule.
- Pages are 5×5 to 8×8 (`Page.size`, numbers 1 to size). Read geometry from `gridOf(page.size)`; never assume 6.
  Every page variant except the legacy 6×6 ones (`standard`, `cloister`, `bare`, `counting`, kept so saved gardens keep
  their pages) has exactly one solution (`PageRules.unique`, checked by `src/core/solve.ts`). Season shapes per size
  live in `SEASONS` in `src/content/stations.ts`; `standardSetup(size)` is each size's Daily Garden.
- Twists live on the page: `Page.fences` (greater-than signs between neighbours, drawn from the solution),
  `Page.hidden` (plots show only their target; `makes`/`isSealed(cage, values, hidden)` accept any operation, and
  operation requests are never posted), `Page.diagonal` (both long diagonals count), `Page.shade` (even numbers
  only), `Page.runners` (neighbours one apart), `Page.poles` (numbers climb from root to tip), `Page.elbow` (no
  number touches itself at a corner) and `Page.tidy` (no repeats in a plot). Every twist is a rule about one square
  or a pair, drawn from the solution, so any subset of the solution keeps it. `src/core/twists.ts` compiles them
  once per page (`constraintsOf`): `isLegal`, `brokenBy` (the refusal's reason) and `solve` all read it, so twisted
  pages have one solution too. A new page variant must leave the existing variants' pages unchanged.
- A Zen garden is `RunSetup.zen`: one week with every number, no commissions (the proof is the solution), no water;
  blooms pay `ZEN.bloomGold` and full bloom `ZEN.perfectGold`. Its stars are finish, full bloom, full bloom without Hint.
- A run carries its `RunSetup` (station, page variant, rounds, deal, ink, gold, tools, enabled kinds). Read the
  page with `runPage(s)`, never `pageOf(s.seed)`, so variants and erased stones apply. The Daily Gardens always
  use `standardSetup(size)`.
- The scriptorium profile is pure (`src/core/meta.ts`, v2); `recordRun` counts each run once by its id and also keeps
  the daily streak, the Weekly Garden, the journal's counts, hidden gardens found and a seed packet for the home garden
  (`src/core/home.ts`). The app passes dates in as 'YYYY-MM-DD' strings; `src/core/calendar.ts` does the arithmetic.
  `migrateProfile` reads v1 profiles and keeps every garden that was open as a bought path. Regions and gardens live
  in `src/content/stations.ts`, the shop in `src/content/meta.ts`, the home garden in `src/content/home.ts`, and goals,
  the daily bonus and the Weekly Garden in `src/content/journal.ts`. A finished garden's `LibraryEntry.diary` keeps
  each week's requests and whether they were met (`RoundRecord.asked`).
- After a balance change: `npx tsx lab/runs.ts 400` must meet the design doc's Verification targets, and on a change that
  touches other sizes, `npx tsx lab/runs.ts 200 all 5` (and 7, 8) too. After a
  station, price, leaf, goal or home-garden change: `npx tsx lab/meta.ts` must pass too. A new map garden's star marks
  come from `npx tsx lab/calibrate.ts 120 <id>`.
- Before shipping: `npm run typecheck && npm test && npm run build && npm run e2e`, then look at the
  screenshots in `test-results/`.
