# Plot Twist: notes for Claude

Plot Twist was called Cagebreakers until M8. Players see garden words (plot, bloom, week, water, coins,
seeds, garden, request, Potting Shed, Herbarium, tool belt); the code, storage keys, save-code id and web
address keep the original names (cage, seal, round, ink, gold, leaf, page, commission, scriptorium, library,
satchel, `cagebreakers.*`). Write player-facing text in garden words; the design doc's Garden words table maps
the two. Fonts are bundled open fonts: Fraunces and Alegreya Sans, Nunito (Cottage Garden), DM Sans (Greenhouse).

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
  `RunState.proof`, and any tool that changes your numbers or the page (Swap, Extra, Erase) must keep one or be
  refused for free.
- Every number is alike: to ink, all your numbers are on the page, or all but one (`placementOf`). Token
  `round` is history, not a rule.
- A run carries its `RunSetup` (station, page variant, rounds, deal, ink, gold, tools, enabled kinds). Read the
  page with `runPage(s)`, never `pageOf(s.seed)`, so variants and erased stones apply. The Daily Page always
  uses the standard setup.
- The scriptorium profile is pure (`src/core/meta.ts`); `recordRun` counts each run once by its id. Stations
  and the shop live in `src/content/stations.ts` and `src/content/meta.ts`.
- After a balance change: `npx tsx lab/runs.ts 400` must meet the design doc's Verification targets. After a
  station, price or leaf change: `npx tsx lab/meta.ts` must pass too.
- Before shipping: `npm run typecheck && npm test && npm run build && npm run e2e`, then look at the
  screenshots in `test-results/`.
