// Copies the bundled fonts and extracts the icon paths the app uses into source files,
// so the shipped game never fetches anything at runtime. Run: npm run assets
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fontsOut = join(root, 'src/app/fonts');
mkdirSync(fontsOut, { recursive: true });

const fonts = [
  // Botanical (the default) and Night Garden: Fraunces for display and numbers, Alegreya Sans for text.
  ['fraunces', 'fraunces-latin-600-normal.woff2'],
  ['fraunces', 'fraunces-latin-600-italic.woff2'],
  ['fraunces', 'fraunces-latin-800-normal.woff2'],
  ['alegreya-sans', 'alegreya-sans-latin-400-normal.woff2'],
  ['alegreya-sans', 'alegreya-sans-latin-500-normal.woff2'],
  ['alegreya-sans', 'alegreya-sans-latin-700-normal.woff2'],
  // Cottage: Nunito throughout.
  ['nunito', 'nunito-latin-500-normal.woff2'],
  ['nunito', 'nunito-latin-700-normal.woff2'],
  ['nunito', 'nunito-latin-900-normal.woff2'],
  // Greenhouse: DM Sans throughout.
  ['dm-sans', 'dm-sans-latin-400-normal.woff2'],
  ['dm-sans', 'dm-sans-latin-500-normal.woff2'],
  ['dm-sans', 'dm-sans-latin-700-normal.woff2'],
];
for (const [pkg, file] of fonts) {
  copyFileSync(require.resolve(`@fontsource/${pkg}/files/${file}`), join(fontsOut, file));
}
for (const [pkg, name] of [['fraunces', 'Fraunces'], ['alegreya-sans', 'Alegreya-Sans'], ['nunito', 'Nunito'], ['dm-sans', 'DM-Sans']]) {
  copyFileSync(require.resolve(`@fontsource/${pkg}/LICENSE`), join(fontsOut, `OFL-${name}.txt`));
}

// Icon silhouettes from game-icons.net (CC BY 3.0), keyed by the name the game uses.
const icons = require('@iconify-json/game-icons/icons.json').icons;
const used = {
  undo: 'anticlockwise-rotation', newPage: 'seedling', menu: 'hamburger-menu', close: 'cancel', sun: 'sun', moon: 'moon',
  back: 'return-arrow', info: 'info', help: 'help', remove: 'trash-can', page: 'seedling',
  // The garden: coins, water and what they buy (keys keep the code's names: ink is water, gold is coins)
  gold: 'two-coins', ink: 'water-drop', spill: 'droplet-splash', check: 'check-mark', seal: 'flower-emblem', trophy: 'laurels-trophy',
  lens: 'magnifying-glass',
  quill: 'sprout', gilder: 'sunbeams', eraser: 'trowel', inkwell: 'plant-watering',
  // The map, the Potting Shed (scriptorium) and the Herbarium (library); leaf is seeds
  map: 'treasure-map', library: 'book-cover', scriptorium: 'flower-pot', leaf: 'plant-seed', star: 'round-star', lock: 'padlock',
  purse: 'shiny-purse', strap: 'belt', bounty: 'gloves', palette: 'palette',
  kitchen: 'carrot', rocks: 'stone-pile', fallow: 'field', market: 'fruit-bowl', dry: 'sun', season: 'sunflower',
  box: 'daisy', allotment: 'wheelbarrow', walled: 'stone-wall',
  // M9: the new gardens on the map
  herbs: 'herbs-bundle', bees: 'beehive', espalier: 'fruit-tree', labels: 'price-tag', knot: 'knot', tea: 'teapot', secret: 'open-gate',
  vineyard: 'grapes', moonGarden: 'moon', stones: 'stone-stack', orangery: 'orange', maze: 'maze',
  bramble: 'thorny-vine', hedgerow: 'hedgehog', meadow: 'flowers', fern: 'fern', oak: 'oak', fairy: 'mushrooms',
  // The twists, the streak, the Weekly Garden, the journal and the home garden
  fences: 'wooden-fence', diagonal: 'crossed-chains', zen: 'lotus', overgrown: 'vines', path: 'footprint', unlock: 'padlock-open',
  flame: 'flame', weekly: 'calendar', journal: 'open-book', home: 'house', packet: 'plant-seed', move: 'move', gift: 'present',
  birdHouse: 'bird-house', frog: 'frog', lantern: 'lantern', scarecrow: 'scarecrow', bench: 'park-bench', butterflies: 'butterfly',
  sundial: 'sundial', beehive: 'beehive', mushroomHouse: 'mushroom-house', fruitTree: 'fruit-tree', bonsai: 'bonsai-tree', swing: 'tree-swing',
  well: 'well', fountain: 'fountain', bridge: 'japanese-bridge',
  // The Botanic Garden's twists and gardens
  shade: 'umbrella', runners: 'strawberry', poles: 'beanstalk', elbow: 'checkered-flag', tidy: 'broom',
  hosta: 'leaf-swirl', berryBush: 'berry-bush', beanRows: 'curling-vines', parterre: 'vine-flower', topiary: 'gardening-shears',
  moss: 'ground-sprout', physic: 'pestle-mortar',
};
const missing = Object.entries(used).filter(([, n]) => !icons[n]);
if (missing.length) throw new Error('missing icons: ' + missing.map(([k, n]) => `${k}=${n}`).join(', '));
const custom = {
  // A garden square crossed by its two long diagonals.
  diagonal: '<rect x="88" y="88" width="336" height="336" rx="28" fill="none" stroke="currentColor" stroke-width="40"/><path d="M150 150l212 212M362 150L150 362" fill="none" stroke="currentColor" stroke-width="44" stroke-linecap="round"/>',
  // Two squares that touch only at a corner, each holding a number.
  elbow: '<rect x="76" y="76" width="168" height="168" rx="22" fill="none" stroke="currentColor" stroke-width="36"/><rect x="268" y="268" width="168" height="168" rx="22" fill="none" stroke="currentColor" stroke-width="36"/><circle cx="160" cy="160" r="34"/><circle cx="352" cy="352" r="34"/>',
  back: '<path d="M318 86L148 256l170 170" fill="none" stroke="currentColor" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/>',
};
const body = Object.entries(used)
  .map(([key, name]) => `  ${key}: ${JSON.stringify(custom[key] ?? icons[name].body.replace(/ fill="currentColor"/g, ''))},`)
  .join('\n');
writeFileSync(join(root, 'src/app/icons.ts'), `// Generated by scripts/assets.mjs from game-icons.net (CC BY 3.0). Do not edit by hand.
// Each value is the inner SVG of a 512×512 icon.
export const ICON_BODIES = {
${body}
} as const;

export type IconName = keyof typeof ICON_BODIES;
`);
console.log(`fonts: ${fonts.length}, icons: ${Object.keys(used).length}`);
