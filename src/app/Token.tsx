export interface TokenProps {
  n: number;
  x: number;
  y: number;
  r: number;
  class?: string;
}

/** A number on the page: a round ink token centred on (x, y). */
export function TokenShape({ n, x, y, r, class: cls = '' }: TokenProps) {
  return (
    <g class={`token ${cls}`}>
      <circle class="tok-bg" cx={x} cy={y} r={r} />
      <circle class="tok-ring" cx={x} cy={y} r={r - 3} />
      <text class="tok-num" x={x} y={y + r * 0.42} font-size={r * 1.22}>{n}</text>
    </g>
  );
}

/** A standalone token, for the hand, the tray and the drag ghost. */
export function TokenSvg({ n, size, class: cls = '' }: { n: number; size: number; class?: string }) {
  const r = size / 2 - 1;
  return (
    <svg class="token-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <TokenShape n={n} x={size / 2} y={size / 2} r={r} class={cls} />
    </svg>
  );
}
