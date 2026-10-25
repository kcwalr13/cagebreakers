import { effect } from '@preact/signals';
import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { updateReady } from './nav';
import { applySettingsToDocument } from './settings';
import { unlockAudio } from './sound';
import { profile } from './meta';
import { exposeTestHooks, theme } from './state';
import './theme.css';

// Theme: follow the phone unless the player picked one, and keep the browser chrome in step.
const dark = window.matchMedia('(prefers-color-scheme: dark)');
const applyTheme = () => {
  // A style the scriptorium no longer holds (after loading another phone's save) falls back to the phone's choice.
  const t = (theme.value === 'newsprint' || theme.value === 'neon') && !profile.value.owned.includes(theme.value) ? 'system' : theme.value;
  const isDark = t === 'dark' || t === 'neon' || (t === 'system' && dark.matches);
  document.documentElement.className = `${isDark ? 'theme-dark' : 'theme-light'}${t === 'newsprint' ? ' theme-newsprint' : t === 'neon' ? ' theme-neon' : ''}`;
  const bg = t === 'newsprint' ? '#E9E6DE' : t === 'neon' ? '#0B0B14' : isDark ? '#15100C' : '#E2D3B4';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
};
effect(applyTheme);
dark.addEventListener?.('change', applyTheme);

applySettingsToDocument();
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
