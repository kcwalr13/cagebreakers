// Renders the home-screen icons from one SVG design. Run: node scripts/app-icons.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public/icons');
mkdirSync(out, { recursive: true });
const font = (f) => `file://${join(root, 'src/app/fonts', f)}`;

/** A gilded cell: gold leaf with tooling, an ink frame, an ink token showing 6, a red target. */
function design({ maskable = false, framed = true } = {}) {
  const tokenR = maskable ? 128 : 150;
  const cy = maskable ? 262 : 286;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F3DC93"/><stop offset=".45" stop-color="#C99A3B"/><stop offset=".55" stop-color="#E2BD62"/><stop offset="1" stop-color="#A67826"/>
    </linearGradient>
    <pattern id="t" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="2.6" fill="rgba(105,70,15,.32)"/></pattern>
  </defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <rect width="512" height="512" fill="url(#t)"/>
  ${framed ? '<rect x="34" y="34" width="444" height="444" fill="none" stroke="#2A1F16" stroke-width="22"/>' : ''}
  ${maskable ? '' : '<text x="70" y="128" font-family="Alegreya" font-style="italic" font-weight="700" font-size="74" fill="#7E2114">12×</text>'}
  <circle cx="${maskable ? 256 : 286}" cy="${cy}" r="${tokenR}" fill="#33281F"/>
  <circle cx="${maskable ? 256 : 286}" cy="${cy}" r="${tokenR - 12}" fill="none" stroke="rgba(246,238,220,.45)" stroke-width="5"/>
  <text x="${maskable ? 256 : 286}" y="${cy + tokenR * 0.42}" text-anchor="middle" font-family="Alegreya" font-weight="800" font-size="${tokenR * 1.22}" fill="#F6EEDC">6</text>
</svg>`;
}

const page = (svg) => `<!doctype html><html><head><style>
@font-face { font-family: 'Alegreya'; font-weight: 700; font-style: italic; src: url('${font('alegreya-latin-700-italic.woff2')}'); }
@font-face { font-family: 'Alegreya'; font-weight: 800; src: url('${font('alegreya-latin-800-normal.woff2')}'); }
html, body { margin: 0; background: transparent; } svg { display: block; }
</style></head><body>${svg}</body></html>`;

const browser = await chromium.launch();
const shots = [
  ['icon-512.png', 512, design()],
  ['icon-192.png', 192, design()],
  ['apple-touch-icon.png', 180, design({ framed: false })],
  ['icon-maskable-512.png', 512, design({ maskable: true, framed: false })],
];
for (const [file, size, svg] of shots) {
  const p = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: size / 512 });
  await p.setContent(page(svg));
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: join(out, file), omitBackground: false });
  await p.close();
}
await browser.close();

// The favicon stays vector and font-free: a gold square, an ink frame and an ink dot.
writeFileSync(join(out, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="10" fill="#D9AE52"/><rect x="5" y="5" width="54" height="54" rx="4" fill="none" stroke="#2A1F16" stroke-width="5"/>
  <circle cx="35" cy="36" r="17" fill="#33281F"/>
</svg>
`);
console.log('icons written to public/icons');
