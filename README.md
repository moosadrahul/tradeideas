 # TradeIdeas

TradeIdeas is a browser-based market research terminal for exploring technical signals, paper portfolio performance, and historical strategy behavior.

## Run locally

The app uses Twelve Data through a small server-side adapter. If no key is configured, it explicitly falls back to generated demo OHLCV data:

```bash
export TWELVE_DATA_API_KEY="your-key"
python3 server.py
```

Open http://localhost:4173.

## MVP capabilities

- Ticker and timeframe controls for Twelve Data symbols across supported TSX, NASDAQ, and NYSE listings
- Live multi-horizon scanner for high-scoring candidates
- Composite signal combining moving-average trend, RSI, MACD, volatility, and volume confirmation
- Interactive price chart and indicator dashboard
- Paper portfolio performance view
- Backtest with starting capital and entry-threshold controls

## Data provider integration

The key is read only by `server.py` and is never placed in browser JavaScript. For Canadian listings, use the Twelve Data symbol format returned by its symbol search/catalog (commonly symbols such as `SHOP:TSX` or `SHOP.TO`, depending on the instrument entry). Verify the exact symbol in Twelve Data before querying.

Signals are educational research output, not financial advice. Backtests are hypothetical and do not guarantee future results.

The scanner UI currently uses a checked-in universe snapshot and deterministic demo ranking. It does not claim that the displayed volume or market-cap order is live. A production scanner needs a licensed market-cap/ranking feed and a cached server-side batch job; Twelve Data Basic's 800-request daily limit is not enough for unrestricted 150-symbol historical scans.

The weekly watchlist is currently a UI/prototype layer. It does not yet request a dedicated weekly forecast for every candidate. Before acting on any row, replace the demo setup calculation with server-side Twelve Data historical requests, add slippage/commission assumptions, and run out-of-sample backtests. A 2–5% target is not guaranteed.

The Strategy Lab now includes date-bounded historical periods for the dot-com bust (2000–2002), the financial crisis (2008–2009), the recovery (2010–2012), and a modern comparison. These tests require successful Twelve Data responses; demo fallback data must not be used to judge strategy performance. Historical results remain research-only and are not evidence of future returns.

Refresh now starts a cached live scan across the checked-in NASDAQ, NYSE, TSX, and ETF universes and renders separate one-week, one-month, and one-year tables containing up to 10 candidates with a score of 90 or higher, a Constructive regime, and a positive expected return. Tables can show fewer than 10 when fewer candidates qualify. Rankings use recent price trend, momentum, long-term regime, volume, and volatility from Twelve Data daily candles. A scan can return fewer than the requested universe when Twelve Data rejects a symbol, a symbol format is unsupported, history is insufficient, or the account rate limit is reached; the UI reports the unavailable count instead of substituting demo data. The scan cache lasts 15 minutes.

Each horizon candidate also includes estimated stop-loss and target prices. The stop uses a volatility-based buffer, while the target uses the model's expected move with a minimum 2:1 target-to-risk relationship. These levels are research estimates, not trading instructions or guarantees.

The symbol search field uses a debounced Twelve Data symbol-search request. It presents exchange-qualified matches such as `CM.TSX` (`CM:TSX` provider symbol) and `CM.NYSE` (`CM` provider symbol), along with the instrument name and type. Selecting a result immediately analyzes that exact exchange-qualified instrument. The checked-in TSX scan universe uses the provider-compatible `:TSX` format; legacy `.TO` symbols can be rejected by Twelve Data.

The selected-symbol chart supports 1 day (5-minute candles), 1 week, 1 month, 1 year, and 5 years (daily candles). The chart range selector is displayed in the Trend overview header and the chart labels the time axis and price axis in USD.

The trend chart overlays the price with SMA 20, SMA 50, and SMA 200 lines.

The price series is always rendered as candlesticks, with bullish candles in green and bearish candles in red.

The Holdings tab stores positions locally and can also sync them across browsers through the server. Click Sign in to sync, create an account with a password of at least eight characters, and use the same credentials in Chrome and the VS Code browser. Add a symbol, quantity, and book price to see live current price, book value, gain/loss amount and percentage, plus projected one-year dividend income. Click a holding's symbol to expand two editable dividend fields: amount per payment and frequency (monthly, quarterly, semi-annual, or annual). New holdings default to zero dividend income. Projected income is calculated as amount per payment times payments per year times quantity. The app opens on Holdings by default. The five-year estimate is a scenario range, not a historical return or guarantee. Adding the same symbol again averages it into the existing position. Holdings can be organized into multiple named portfolios, such as TFSA, RRSP, or a taxable account; use New account type to create a portfolio, edit its name within the account section, and use the X on an account section to delete one after confirmation. All account sections are shown one below another with separators. The final remaining portfolio cannot be deleted. The top Portfolio value overview shows the combined current value across all account types and each account's current value. Existing saved positions are migrated into Main holdings.

The Holdings symbol field uses the same debounced exchange-qualified search as Analysis and limits matches to TSX, NASDAQ, NYSE, and CBOE.