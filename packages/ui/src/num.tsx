import type { AssetClass } from '@ft/contracts';
import {
  DIRECTION_GLYPH,
  directionOf,
  formatCompact,
  formatPct,
  formatPrice,
  formatSigned,
  type Direction,
} from './format';

const TONE: Record<Direction, string> = {
  up: 'var(--color-up)',
  down: 'var(--color-down)',
  flat: 'var(--color-flat)',
};

export interface PriceProps {
  value: number;
  currency?: string;
  /** Drives decimal precision. Omitting it renders FX and crypto wrongly. */
  assetClass?: AssetClass;
  /** Tints the figure by the direction of the move that produced it. */
  direction?: Direction;
  className?: string;
}

export function Price({ value, currency = 'USD', assetClass, direction, className }: PriceProps) {
  return (
    <span
      className={'tabular ' + (className ?? '')}
      style={direction ? { color: TONE[direction] } : undefined}
    >
      {formatPrice(value, currency, assetClass)}
    </span>
  );
}

export interface ChangeProps {
  change: number;
  changePct: number;
  currency?: string;
  assetClass?: AssetClass;
  /** Hide the absolute change and show only the percentage. */
  pctOnly?: boolean;
  className?: string;
}

/**
 * A price move. Direction is signalled three ways at once: colour, an arrow
 * glyph, and an explicit sign. Colour alone would fail for the ~8% of men
 * with a red-green deficiency, which is a large slice of a finance audience.
 */
export function Change({
  change,
  changePct,
  currency = 'USD',
  assetClass,
  pctOnly,
  className,
}: ChangeProps) {
  const dir = directionOf(change);
  return (
    <span
      className={'tabular inline-flex items-center gap-1 ' + (className ?? '')}
      style={{ color: TONE[dir] }}
    >
      <span aria-hidden>{DIRECTION_GLYPH[dir]}</span>
      {!pctOnly && <span>{formatSigned(change, currency, assetClass)}</span>}
      <span>{formatPct(changePct)}</span>
    </span>
  );
}

export interface CompactProps {
  value: number;
  className?: string;
}

/** Market cap, volume, and anything else that would otherwise need 13 digits. */
export function Compact({ value, className }: CompactProps) {
  return <span className={'tabular ' + (className ?? '')}>{formatCompact(value)}</span>;
}

/** A value the app does not have. Never render 0 or an empty cell for this. */
export function Unavailable({ className }: { className?: string }) {
  return (
    <span
      className={'tabular ' + (className ?? '')}
      style={{ color: 'var(--color-fg-faint)' }}
      title="Not available from any reachable provider"
    >
      {'–'}
    </span>
  );
}
