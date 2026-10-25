export interface TokenProps {
  n: number;
  x: number;
  y: number;
  r: number;
  /** Dealt this round: a red rubric mark until the round is inked. */
  fresh?: boolean;
  class?: string;
}

/** A number on the page: a round ink token centred on (x, y). */
export function TokenShape({ n, x, y, r, fresh, class: cls = '' }: TokenProps) {
  return (
    <g class={`token${fresh ? ' fresh' : ''} ${cls}`}>
      <circle class="tok-bg" cx={x} cy={y} r={r} />
      <circle class="tok-ring" cx={x} cy={y} r={r - 3} />
      <text class="tok-num" x={x} y={y + r * 0.42} font-size={r * 1.22}>{n}</text>
      {fresh ? <circle class="tok-mark" cx={x + r * 0.68} cy={y - r * 0.68} r={r * 0.24} /> : null}
    </g>
  );
}

/** A standalone token, for the hand, the tray and the drag ghost. */
export function TokenSvg({ n, size, fresh, class: cls = '' }: { n: number; size: number; fresh?: boolean; class?: string }) {
  const r = size / 2 - 1;
  return (
    <svg class="token-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <TokenShape n={n} x={size / 2} y={size / 2} r={r} fresh={fresh} class={cls} />
    </svg>
  );
}
