// Renders the home-screen icons from one SVG design. Run: node scripts/app-icons.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public/icons');
mkdirSync(out, { recursive: true });
const font = (f) => `file://${join(root, 'src/app/fonts', f)}`;

/** A plot in bloom: leaf-green ground, a moss frame, a terracotta target, a flower, and a token showing 6. */
const flower = (x, y, k) => [[0, -4.6], [4.4, -1.4], [2.7, 3.8], [-2.7, 3.8], [-4.4, -1.4]]
  .map(([dx, dy]) => `<circle cx="${x + dx * k}" cy="${y + dy * k}" r="${3.9 * k}" fill="#E08E9A"/>`).join('')
  + `<circle cx="${x}" cy="${y}" r="${2.6 * k}" fill="#F2C14E"/>`;

function design({ maskable = false, framed = true } = {}) {
  const tokenR = maskable ? 120 : 146;
  const cx = maskable ? 256 : 270, cy = maskable ? 276 : 292;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#E4EDC6"/><stop offset=".45" stop-color="#A9C47A"/><stop offset=".55" stop-color="#CADB9C"/><stop offset="1" stop-color="#86A45A"/>
    </linearGradient>
    <pattern id="t" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="2.4" fill="rgba(60,90,30,.24)"/></pattern>
  </defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <rect width="512" height="512" fill="url(#t)"/>
  ${framed ? '<rect x="34" y="34" width="444" height="444" fill="none" stroke="#26331F" stroke-width="22"/>' : ''}
  ${maskable ? '' : '<text x="68" y="132" font-family="Fraunces" font-style="italic" font-weight="600" font-size="76" fill="#7C3418">12+</text>'}
  ${flower(maskable ? 352 : 392, maskable ? 150 : 124, maskable ? 7 : 8.5)}
  <circle cx="${cx}" cy="${cy}" r="${tokenR}" fill="#34452B"/>
  <circle cx="${cx}" cy="${cy}" r="${tokenR - 12}" fill="none" stroke="rgba(245,243,231,.4)" stroke-width="5"/>
  <text x="${cx}" y="${cy + tokenR * 0.42}" text-anchor="middle" font-family="Fraunces" font-weight="800" font-size="${tokenR * 1.22}" fill="#F5F3E7">6</text>
</svg>`;
}

const page = (svg) => `<!doctype html><html><head><style>
@font-face { font-family: 'Fraunces'; font-weight: 600; font-style: italic; src: url('${font('fraunces-latin-600-italic.woff2')}'); }
@font-face { font-family: 'Fraunces'; font-weight: 800; src: url('${font('fraunces-latin-800-normal.woff2')}'); }
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

// The favicon stays vector and font-free: a leaf-green square, a moss frame and a flower.
writeFileSync(join(out, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="10" fill="#A9C47A"/><rect x="5" y="5" width="54" height="54" rx="4" fill="none" stroke="#26331F" stroke-width="5"/>
  ${flower(32, 32, 3.6)}
</svg>
`);
console.log('icons written to public/icons');
