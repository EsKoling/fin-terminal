import type { Provenance } from '@ft/contracts';
import { formatAge } from './format';

/**
 * The provenance chip. Small, always present, and the most important piece of
 * UI in the application.
 *
 * Every panel wears one. It states which upstream served the data, how close
 * to live it is, whether the symbol is an exact match or a proxy, and how old
 * the value is. When a free provider dies mid-session the chip is what turns
 * an invisible lie into a visible, explained degradation.
 */

const LATENCY_LABEL = {
  realtime: 'RT',
  delayed15: '15m',
  eod: 'EOD',
  derived: 'DERIV',
  synthetic: 'DEMO',
} as const;

function toneFor(p: Provenance): string {
  if (p.degraded === 'budget-exhausted' || p.degraded === 'partial')
    return 'var(--color-prov-error)';
  if (p.degraded) return 'var(--color-prov-degraded)';
  if (p.stale) return 'var(--color-prov-stale)';
  if (p.latencyClass === 'realtime') return 'var(--color-prov-realtime)';
  return 'var(--color-prov-delayed)';
}

const DEGRADED_LABEL = {
  'fallback-provider': 'fell back to this provider',
  'cache-only': 'serving cache, upstream unreachable',
  partial: 'incomplete response',
  'budget-exhausted': 'free-tier quota exhausted',
} as const;

export interface ProvenanceChipProps {
  prov: Provenance;
  /** Pass a clock tick to re-render the age. Omit for a static chip. */
  now?: number;
  className?: string;
}

export function ProvenanceChip({ prov, now, className }: ProvenanceChipProps) {
  const age = formatAge((now ?? Date.now()) - prov.asOf);
  const tone = toneFor(prov);

  const title = [
    'Source: ' + prov.provider,
    'As of: ' + new Date(prov.asOf).toISOString(),
    'Latency: ' + prov.latencyClass,
    prov.fidelity === 'proxy' ? 'Approximate symbol match' : null,
    prov.stale ? 'Older than this data class allows' : null,
    prov.degraded ? DEGRADED_LABEL[prov.degraded] : null,
    prov.note,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <span
      title={title}
      className={
        'text-2xs no-drag inline-flex items-center gap-1 rounded-sm px-1 py-px tracking-wide uppercase ' +
        (className ?? '')
      }
      style={{ color: tone, border: '1px solid currentColor', opacity: 0.85 }}
    >
      <span>{prov.provider}</span>
      <span aria-hidden>{'·'}</span>
      <span>{LATENCY_LABEL[prov.latencyClass]}</span>
      {prov.fidelity === 'proxy' && (
        <>
          <span aria-hidden>{'·'}</span>
          <span title="Approximate symbol match">{'≈'}</span>
        </>
      )}
      <span aria-hidden>{'·'}</span>
      <span className="tabular">{age}</span>
    </span>
  );
}
