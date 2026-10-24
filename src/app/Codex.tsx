import { ITEMS, RELICS, TOOLS } from '../content/items';
import { KEEPERS } from '../content/opponents';
import { SPECIES } from '../content/species';
import { SEAL_LINES } from './fight/Sheets';
import { codex } from './codex';
import { Icon } from './Icon';
import { screen, sheet } from './nav';
import { TokenSvg } from './Token';
import type { Op } from '../core/page';

const OPS: Op[] = ['+', '×', '−', '÷'];

/** Everything met so far: species, seals, items and Keepers. Unmet entries stay blank. */
export function CodexScreen() {
  const c = codex.value;
  const tiers = [1, 2, 3, 4, 5] as const;
  return (
    <div class="column codex">
      <header class="header">
        <button class="icon-btn" aria-label="Back to title" onClick={() => (screen.value = 'title')}><Icon name="back" /></button>
        <div class="title">
          <div class="title-page">Codex</div>
          <div class="title-sub">{c.species.length} of {SPECIES.length} species, {c.items.length} of {TOOLS.length + RELICS.length} items, {c.keepers.length} of {KEEPERS.length} Keepers</div>
        </div>
      </header>
      <div class="codex-scroll">
        {tiers.map((t) => (
          <section key={t}>
            <div class="section-label">{t === 5 ? 'The Misprints, cost 5' : `Cost ${t}`}</div>
            <div class="codex-grid">
              {SPECIES.filter((s) => s.tier === t).map((s) => {
                const met = c.species.includes(s.id);
                return met ? (
                  <button key={s.id} class="codex-cell" onClick={() => (sheet.value = { kind: 'card', species: s.id, n: s.misprint === 'blank' ? 0 : 3, n2: s.misprint === 'domino' ? 4 : undefined, stars: 1 })}>
                    <TokenSvg n={s.misprint === 'blank' ? 0 : 3} n2={4} species={s.id} size={48} />
                    <span>{s.name}</span>
                  </button>
                ) : (
                  <div key={s.id} class="codex-cell unmet" aria-label="Not met yet"><span class="unmet-token">?</span><span>Not met yet</span></div>
                );
              })}
            </div>
          </section>
        ))}

        <div class="section-label">Seals</div>
        {OPS.map((op) => (
          <div key={op} class={`codex-row${c.seals.includes(op) ? '' : ' unmet'}`}>
            <span class="codex-op">{op}</span>
            <span>{SEAL_LINES[op]} {c.seals.includes(op) ? '' : <em>Not sealed yet.</em>}</span>
          </div>
        ))}

        <div class="section-label">Items</div>
        {[...TOOLS, ...RELICS].map((id) => {
          const met = c.items.includes(id);
          return (
            <div key={id} class={`codex-row${met ? '' : ' unmet'}`}>
              <span class={`item-icon ${ITEMS[id].family}`}>{met ? <Icon name={id} /> : '?'}</span>
              <span>{met ? <><strong>{ITEMS[id].name}.</strong> {ITEMS[id].text}</> : <em>Not found yet.</em>}</span>
            </div>
          );
        })}

        <div class="section-label">Keepers</div>
        {KEEPERS.map((k) => {
          const met = c.keepers.includes(k.id);
          return (
            <div key={k.id} class={`codex-row${met ? '' : ' unmet'}`}>
              <span class="codex-op">{k.clash}</span>
              <span>{met ? <><strong>{k.name}.</strong> {k.twist}</> : <em>The Keeper of clash {k.clash}. Not faced yet.</em>}</span>
            </div>
          );
        })}
        <div class="bottom-pad" />
      </div>
    </div>
  );
}
