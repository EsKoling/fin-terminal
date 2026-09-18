import { provenance } from '@ft/contracts';
import { Change, Price, ProvenanceChip } from '@ft/ui';
import { displayWithVenue, parseSid, venueState } from '@ft/symbology';

/**
 * Phase 0 shell.
 *
 * Deliberately not an empty page: it renders the token system, the tabular
 * numerics, and the provenance chip against fixture data so the Phase 0 gate
 * is something you can actually look at and judge. Every number here is
 * synthetic and says so in its chip. The live workspace replaces this in
 * Phase 1.
 */

const FIXTURES = [
  { sid: 'crypto:BINANCE:BTC/USDT', last: 97412.5, change: 2011.4, changePct: 2.11, ccy: 'USD' },
  { sid: 'equity:XNAS:AAPL', last: 227.52, change: 2.79, changePct: 1.24, ccy: 'USD' },
  { sid: 'equity:XIDX:BBCA', last: 9375, change: -125, changePct: -1.32, ccy: 'IDR' },
  { sid: 'fx:OTC:EUR/USD', last: 1.0842, change: 0.0009, changePct: 0.08, ccy: 'USD' },
  { sid: 'commodity:XCEC:GC@FRONT', last: 2648.3, change: -7.2, changePct: -0.27, ccy: 'USD' },
] as const;

const now = () => Date.now();

export default function TerminalPage() {
  const t = now();
  const prov = provenance({
    provider: 'cache',
    asOf: t - 4000,
    latencyClass: 'synthetic',
    freshness: 'quote',
    note: 'Phase 0 fixture data. No provider is wired up yet.',
    now: t,
  });

  return (
    <main className="bg-base text-fg flex h-screen flex-col">
      <header className="border-line flex items-center gap-3 border-b px-3 py-2">
        <span className="text-amber text-sm font-semibold tracking-tight">TERMINAL</span>
        <span className="text-fg-subtle text-2xs tracking-widest uppercase">phase 0 shell</span>
        <div className="ml-auto flex items-center gap-2">
          <kbd className="border-line-strong text-2xs text-fg-muted rounded-sm border px-1.5 py-0.5">
            {'⌘'}K
          </kbd>
          <ProvenanceChip prov={prov} now={t} />
        </div>
      </header>

      <div className="bg-line grid flex-1 grid-cols-1 gap-px overflow-auto md:grid-cols-2">
        <section className="bg-panel p-3">
          <h2 className="text-fg-muted text-2xs mb-2 tracking-widest uppercase">Watchlist</h2>
          <table className="w-full">
            <tbody>
              {FIXTURES.map((f) => {
                const sid = parseSid(f.sid);
                return (
                  <tr key={f.sid} className="border-line/60 border-b last:border-0">
                    <td className="py-1.5 pr-3 text-sm">{displayWithVenue(sid)}</td>
                    <td className="py-1.5 pr-3 text-right">
                      <Price value={f.last} currency={f.ccy} assetClass={sid.assetClass} />
                    </td>
                    <td className="py-1.5 text-right">
                      <Change
                        change={f.change}
                        changePct={f.changePct}
                        currency={f.ccy}
                        assetClass={sid.assetClass}
                        pctOnly
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="bg-panel p-3">
          <h2 className="text-fg-muted text-2xs mb-2 tracking-widest uppercase">Venue status</h2>
          <ul className="space-y-1">
            {['XNAS', 'XIDX', 'BINANCE', 'OTC', 'XCEC'].map((mic) => (
              <li key={mic} className="flex items-center justify-between text-sm">
                <span className="text-fg-muted">{mic}</span>
                <span className="tabular text-2xs uppercase">{venueState(mic)}</span>
              </li>
            ))}
          </ul>
          <p className="text-fg-faint text-2xs mt-4 leading-relaxed">
            Session windows drive polling cadence: 5s while a venue is open, 60s pre and post, 300s
            closed. IDX and the US sessions barely overlap, so a uniform poll would burn roughly
            four times the necessary free-tier budget.
          </p>
        </section>
      </div>

      <footer className="text-fg-faint border-line text-2xs border-t px-3 py-1.5">
        Demo {'·'} fixture data {'·'} not investment advice
      </footer>
    </main>
  );
}
