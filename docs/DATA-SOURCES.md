# Data sources and network constraints

## Verified live, 2026-09-18, from an Indonesian ISP

| Source                                            | Result                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Binance `data-api` / `data-stream.binance.vision` | **OK.** REST 411ms. WebSocket opened in 430ms, 4 live trade ticks in 591ms. No API key. |
| Yahoo `BBCA.JK`                                   | **OK.** 143ms, returned 6225 IDR.                                                       |
| SEC EDGAR submissions                             | **OK.** 326ms, no key, declared User-Agent required.                                    |
| Indodax `btcidr`                                  | **OK.** 195ms.                                                                          |
| Coinbase (`api.exchange`, `api.coinbase.com`)     | **Unreachable.** Connection never establishes.                                          |
| Kraken                                            | **Unreachable.**                                                                        |
| Bybit, OKX, Bitfinex, Gemini                      | **Unreachable.**                                                                        |

## The crypto venue ladder needs rethinking

The plan assumed a Binance to Coinbase to Kraken failover ladder. From this development
machine, **only Binance and Indodax are reachable**; six other exchanges fail at the TCP
level, not with an HTTP error. That pattern is consistent with Indonesian ISP filtering of
exchanges not registered with Bappebti.

This matters in two directions, and they are opposite:

- **Locally**, you cannot develop or demo the Coinbase and Kraken failover, because you
  cannot reach them. The ladder would appear broken on your own machine.
- **For a viewer abroad**, the situation inverts. The WebSocket runs in the viewer's browser,
  so it is _their_ IP that matters. A US-based recruiter will typically reach Coinbase and
  Kraken fine, and may be the one blocked from Binance.

So the ladder is still right, but it needs a fourth rung that works here:

```
Binance (data-stream.binance.vision)   primary, USDT quotes
  -> Coinbase                          unreachable locally, fine for most viewers abroad
  -> Kraken                            same
  -> Indodax                           reachable locally, quotes in IDR
```

Indodax quoting in IDR is not a problem to paper over. It is exactly the case the
`fidelity: 'proxy'` machinery exists for: the ladder falls through to it, the chip renders
the approximation badge, and the note reads "quote currency IDR, not USDT". The design
already handles this honestly, which is a better demonstration than a ladder that never
falls over.

## Action for Phase 1

- Add an `indodax` codec and adapter alongside the three planned exchanges.
- Set the ladder probe timeout to 2.5s so an unreachable venue advances quickly rather than
  hanging the panel for 20 seconds, which is what a raw TCP timeout costs.
- Keep a `?venue=` override so the failover path can be demonstrated deliberately rather than
  only when a network happens to break.
- Test the deployed URL from a US VPN before sending the link to anyone.
