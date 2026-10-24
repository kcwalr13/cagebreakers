# Getting Cagebreakers into the app stores

The game ships today as an installable web app. Everything needed to wrap the same build as a
native iPhone and Android app is in place; what remains needs a Mac with Xcode, Android Studio and
the two developer accounts, so it is a step for a person rather than for CI.

## What is already ready

- **One build for every target.** `npm run build` writes `dist/` with relative paths (`base: './'`),
  so the same files load from GitHub Pages, from a phone's home screen, or from inside a native
  wrapper.
- **No network.** The game fetches nothing at runtime: fonts and icons are bundled, sounds are
  synthesized. A wrapped app needs no network permission.
- **Storage behind one adapter.** All saves go through `src/app/storage.ts`. In a native wrapper,
  swap its body for `@capacitor/preferences` so iOS can't clear saves under storage pressure.
- **Safe areas.** The layout pads for the notch and home bar with `env(safe-area-inset-*)`, and
  `capacitor.config.json` sets `contentInset: never` so the web view doesn't double them.
- **Icons.** `public/icons` holds the home-screen icons; `node scripts/app-icons.mjs` re-renders
  them. Store icons (1024 × 1024, no transparency) come from the same source.

## Steps on a Mac

1. `npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android @capacitor/preferences @capacitor/haptics`
2. `npm run build && npx cap add ios && npx cap add android`
3. In `src/app/storage.ts`, back the adapter with `Preferences` (keep the in-memory copy for
   synchronous reads, and load it once at startup).
4. In `src/app/settings.ts`, route `buzz()` through `@capacitor/haptics` when running natively; iOS
   web views ignore `navigator.vibrate`.
5. Turn off the service worker inside the wrapper (the app bundle is already offline): skip
   `registerSW` when `Capacitor.isNativePlatform()`.
6. `npx cap sync`, then open the projects with `npx cap open ios` and `npx cap open android`, set the
   signing team, and archive.

## Store notes

- **Privacy:** the app collects nothing and makes no network calls. Both stores' privacy forms can
  answer "no data collected".
- **Age rating:** fantasy combat with no blood, no purchases and no ads.
- **Identifier:** `io.github.kcwalr13.cagebreakers` in `capacitor.config.json`, a placeholder until
  there's a domain or a developer name to use instead. It can't change after the first upload.
