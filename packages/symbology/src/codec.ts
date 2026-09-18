import type { Fidelity, ProviderId } from '@ft/contracts';
import type { SymbolId } from './symbol-id';

/**
 * The result of asking a provider to express one of our symbols.
 *
 * `fidelity: 'proxy'` is the important case. It means the provider cannot
 * serve exactly what we asked for and we accepted the nearest instrument:
 * Binance BTC/USDT requested from Yahoo comes back as BTC-USD, a different
 * quote currency; COMEX gold futures requested from Twelve Data come back as
 * XAU/USD spot, a genuinely different instrument with a different price.
 *
 * These are useful fallbacks and terrible silent substitutions, so fidelity
 * propagates into Provenance and the UI renders a small approximation badge.
 * Being visibly approximate is what separates this from a toy.
 */
export interface CodecResult {
  readonly vendor: string;
  readonly fidelity: Fidelity;
  readonly note?: string;
}

export interface SymbolCodec {
  readonly id: ProviderId;
  /** null means this provider has no way to express the symbol at all. */
  toVendor(sid: SymbolId): CodecResult | null;
  /** Parse a vendor ticker back to canonical form. null if unrecognizable. */
  fromVendor(vendor: string, hint?: Partial<SymbolId>): SymbolId | null;
}

export function exact(vendor: string): CodecResult {
  return { vendor, fidelity: 'exact' };
}

export function proxy(vendor: string, note: string): CodecResult {
  return { vendor, fidelity: 'proxy', note };
}
