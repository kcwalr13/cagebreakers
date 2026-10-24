import { effect } from '@preact/signals';
import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
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

exposeTestHooks();
render(<App />, document.getElementById('app')!);

// Cache the whole game for offline play. Updates install quietly and apply on the next launch.
if ('serviceWorker' in navigator && !new URLSearchParams(location.search).has('nosw')) {
  registerSW({ immediate: true });
}
