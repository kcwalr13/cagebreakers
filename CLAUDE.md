# Cagebreakers: notes for Claude

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
- Before shipping: `npm run typecheck && npm test && npm run build && npm run e2e`, then look at the
  screenshots in `test-results/`.
