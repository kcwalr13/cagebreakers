import { effect } from '@preact/signals';
import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { updateReady } from './nav';
import { watchRunForCodex } from './codex';
import { applySettingsToDocument } from './settings';
import { unlockAudio } from './sound';
import { exposeTestHooks, theme } from './state';
import './theme.css';

// Theme: follow the phone unless the player picked one, and keep the browser chrome in step.
const dark = window.matchMedia('(prefers-color-scheme: dark)');
const applyTheme = () => {
  const isDark = theme.value === 'dark' || (theme.value === 'system' && dark.matches);
  document.documentElement.className = isDark ? 'theme-dark' : 'theme-light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#15100C' : '#E2D3B4');
};
effect(applyTheme);
dark.addEventListener?.('change', applyTheme);

applySettingsToDocument();
watchRunForCodex();
// Phones only let a page make sound after a touch.
window.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });

exposeTestHooks();
render(<App />, document.getElementById('app')!);

// Cache the whole game for offline play. A new version downloads quietly in the background;
// the player sees a small "new version ready" note and reloads when it suits them.
if ('serviceWorker' in navigator && !new URLSearchParams(location.search).has('nosw')) {
  const update = registerSW({
    immediate: true,
    onNeedRefresh() { updateReady.value = () => void update(true); },
    onRegisteredSW(_url, reg) {
      // Look for updates hourly while the game is open and online.
      if (reg) setInterval(() => { if (navigator.onLine) void reg.update(); }, 60 * 60 * 1000);
    },
  });
}
