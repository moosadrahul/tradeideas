# TradeIdeas App — Development Handoff

**Project:** Browser-based stock research and portfolio tracking terminal  
**Repository:** moosadrahul/tradeideas  
**Status:** Functional with known issues and incomplete features  
**Last Updated:** 2026-10-31

---

## Overview

TradeIdeas is a web application that provides:
- **Live technical analysis** across NASDAQ, NYSE, TSX, and ETF universes
- **Multi-horizon scanning** (1-week, 1-month, 1-year)
- **Portfolio management** with multiple named accounts (RRSP, TFSA, etc.)
- **Dividend tracking** with projected annual income
- **Cross-browser sync** via server-side account storage
- **Candlestick charts** with SMA overlays (20, 50, 200)
- **Strategy backtesting** (research-only, not financial advice)

### Architecture

- **Frontend:** Vanilla JavaScript, browser localStorage, responsive CSS
- **Backend:** Python 3.9+ with `http.server`, single-threaded
- **Data Source:** Twelve Data API (market data only, no dividend feeds)
- **Hosting:** Local development at `http://127.0.0.1:4173`

---

## Current State

### What Works

✅ **Holdings Management**
- Add/edit positions with symbol, quantity, and book price
- Multiple named portfolio accounts (R-RRSP, RESP, R-TFSA, N-RRSP, N-TFSA)
- Live current price, gain/loss, gain/loss %, expected returns
- Projected annual dividend income (manually configured)
- Portfolio totals row (book value, gain/loss, projected income)
- Remove holdings with X button (styled as circular button)
- Dividend settings propagate across all matching symbols globally

✅ **Responsive Layout**
- Mobile-optimized for 390px+ screens
- Desktop layout with multi-column forms preserved above 600px
- Holdings tables horizontally scrollable
- Stacked portfolio sections with dividers

✅ **Portfolio Sync (New)**
- Server-side account registration and login
- Password hashing (PBKDF2-SHA256)
- Secure session cookies
- Portfolio save/load endpoints
- Sign-in persists across browsers using same credentials
- Button shows "Sign in to sync" or "Synced: [username]"

✅ **Analysis Tab** (when Twelve Data key is configured)
- Symbol search with exchange-qualified results
- Technical indicators (Trend, Momentum, Volume, Volatility)
- Candlestick chart with SMA 20/50/200
- Score ring (0–100 composite signal)
- Live multi-horizon scan (1-week, 1-month, 1-year)
- Backtesting over historical periods (dot-com, 2008, 2010–2012)

### Known Issues

❌ **API Key Configuration**
- **Issue:** Server requires `TWELVE_DATA_API_KEY` environment variable at startup
- **Symptom:** Price/search endpoints return 503 if key is missing or 401 if invalid
- **Workaround:** Start server with:
  ```bash
  TWELVE_DATA_API_KEY="YOUR_KEY" python3 server.py
  ```
- **Recovery:** If key expires or was rotated, restart server with new key in same Terminal session

❌ **Holdings Remove Button Not Functional**
- **Issue:** X button on holding rows has `data-account-id="default"` for all rows
- **Cause:** Account ID is hardcoded in `unavailableHoldingRow()` function
- **Status:** Code was updated but fix not verified after Twelve Data key errors
- **Fix Required:** Update `unavailableHoldingRow()` to include correct `${accountId}` parameter

❌ **Lost Account Data During Sync**
- **Issue:** When first syncing, empty server portfolio replaced local multi-account portfolio
- **Current State:** Only "Main holdings" / "R-RRSP" with ZID and T holdings remain
- **Missing:** Original R-RESP, R-TFSA, N-RRSP, N-TFSA accounts and their complete holdings
- **Recovery:** Only possible if other browser/device still has old local storage
- **Mitigation:** Added check to prevent empty server portfolio overwriting local data on future sign-ins

❌ **Portfolio Data Persistence Post-Sync**
- **Issue:** Sign-in recovery logic uses legacy `storedHoldings` variable
- **Status:** Untested after portfolio recovery fix was applied
- **Risk:** On subsequent sign-ins, local holdings may not restore correctly

---

## Data Storage

### Browser Local Storage

| Key | Content |
|-----|---------|
| `trend-analysis-holding-accounts` | Current multi-account portfolio structure (JSON) |
| `trend-analysis-holdings` | Legacy single-account holdings (JSON, deprecated) |
| `trend-analysis-current-holding-account` | Selected account UUID |

### Server-Side Storage

**File:** `users.json` (created on first registration)

```json
{
  "username": {
    "salt": "base64-salt",
    "password": "base64-pbkdf2-digest",
    "portfolio": [
      {
        "id": "uuid",
        "name": "Account Name",
        "holdings": [
          {
            "id": "uuid",
            "symbol": "SYMBOL:EXCHANGE",
            "quantity": 100,
            "bookPrice": 25.50,
            "dividendAmount": 0.50,
            "dividendFrequency": "quarterly"
          }
        ]
      }
    ]
  }
}
```

---

## File Structure

| File | Purpose | Status |
|------|---------|--------|
| `index.html` | Main page markup, auth panel | ✅ Complete |
| `app.js` | All frontend logic, portfolio management, sync | ⚠️ Needs remove button fix |
| `styles.css` | Dark theme, responsive layout, mobile overrides | ✅ Complete |
| `server.py` | Twelve Data adapter, auth endpoints, portfolio sync | ✅ Complete |
| `users.json` | Persistent user accounts (server-side) | 🔧 Auto-created |
| `README.md` | Setup, feature docs, caveats | ✅ Updated |

---

## Configuration & Running

### Prerequisites

- Python 3.9+
- Twelve Data API key (free tier available at twelvedata.com)
- Modern browser (Chrome, Safari, Firefox)

### Setup

```bash
cd /Users/rahulmoosad/Projects/tradeideas.worktrees/done
export TWELVE_DATA_API_KEY="your-api-key-here"
python3 server.py
```

Open: `http://127.0.0.1:4173`

### Environment Variables

- **`TWELVE_DATA_API_KEY`** (required for live data)
  - Scope: Server-side only, never sent to browser
  - If missing: Prices, search, scans return 503
  - If invalid/expired: Returns 401

---

## API Endpoints

### Market Data (Twelve Data Adapter)

| Endpoint | Method | Parameters | Auth | Status |
|----------|--------|-----------|------|--------|
| `/api/time-series` | GET | `symbol`, `outputsize`, `interval`, `start_date`, `end_date` | No | ✅ |
| `/api/symbol-search` | GET | `symbol` | No | ✅ |
| `/api/scan` | GET | `symbols` (comma-separated) | No | ✅ |

### Portfolio Sync (New)

| Endpoint | Method | Body | Auth | Status |
|----------|--------|------|------|--------|
| `/api/auth/register` | POST | `{username, password}` | No | ✅ |
| `/api/auth/login` | POST | `{username, password}` | No | ✅ |
| `/api/auth/logout` | POST | — | Cookie | ✅ |
| `/api/auth/me` | GET | — | Cookie | ✅ |
| `/api/portfolio` | GET | — | Cookie | ✅ |
| `/api/portfolio` | POST | `{portfolio: [...]}` | Cookie | ✅ |

---

## Key Functions & Logic

### Holdings Rendering

- **`renderPortfolioSections()`** – Generates all account HTML with forms and tables
- **`refreshPortfolioSection(account)`** – Fetches live prices and updates single account display
- **`renderHoldingRow(holding, market, accountId)`** – Creates single row with live data
- **`unavailableHoldingRow(holding, accountId, error)`** – Creates row when prices unavailable
- **`portfolioTotalsMarkup(account, results)`** – Generates account-level totals row

### Dividend & Income

- **`getDividendSettings(holding)`** – Reads legacy or new dividend fields, returns normalized `{amount, frequency}`
- **`getProjectedAnnualIncome(quantity, amount, frequency)`** – Calculates annual income
- **Formula:** `amount × (payments_per_year) × quantity`
- **Frequencies:** monthly (12), quarterly (4), semi-annual (2), annual (1)

### Sync & Auth

- **`authenticate(event)`** – Handles register/login, loads server portfolio or restores local data
- **`syncPortfolio()`** – Uploads `holdingAccounts` to server after any change
- **`initializeAuth()`** – Checks session on page load, updates button text

### Symbol Matching

- **`normalizeHoldingSymbol(symbol)`** – Uppercases and trims for consistent matching
- Applied when updating dividend settings across all accounts globally

---

## Testing Checklist

### Before Deploying

- [ ] Start server with valid Twelve Data key
- [ ] Symbol search returns results
- [ ] Live prices load on Holdings
- [ ] Add holding with symbol search
- [ ] Remove holding X button works (needs fix)
- [ ] Click symbol to expand dividend editor
- [ ] Change dividend → updates all matching symbols
- [ ] Create new account type
- [ ] Portfolio totals update correctly
- [ ] Sign in to sync → new account
- [ ] Sign in from Chrome with same credentials
- [ ] Portfolio persists across browsers
- [ ] Reload page → portfolio intact
- [ ] Mobile layout at 390px viewport
- [ ] Responsive form at 600px breakpoint

### Known Failing Tests

- ❌ Remove holding functionality (account ID mismatch)
- ❌ Dividend editor click expansion (untested after recent changes)

---

## Next Steps & Priorities

### Critical (Blocking UX)

1. **Fix remove button for holdings**
   - Update `unavailableHoldingRow()` to pass `${accountId}` correctly
   - Test that X removes holdings from correct account
   - Verify sync uploads deletion

2. **Verify dividend editor expansion**
   - Click on symbol → should expand dividend fields
   - May be broken by recent template changes

3. **Restore lost account data**
   - If other browser has old local storage, export and import
   - Otherwise, manually re-enter R-RESP, R-TFSA, N-RRSP, N-TFSA accounts

### High Priority

4. **Add export/import backup feature**
   - Prevent future data loss during sync
   - One-click export to file
   - One-click import from file (client-side only)

5. **Improve sync UX**
   - Show "Syncing..." indicator during POST /api/portfolio
   - Handle sync errors gracefully
   - Option to force-upload current state

### Medium Priority

6. **Dividend data persistence**
   - Current dividend settings sync correctly, but untested at scale
   - Consider caching commonly used dividends server-side

7. **Rate limit handling**
   - Twelve Data free tier has 800 requests/day
   - Add user notification when limit is reached
   - Consider request batching for scans

8. **Missing dividend feeds**
   - No server-side dividend endpoint
   - All dividends are manual entry only
   - Consider alpha Vantage, Finnhub, or polygon.io integration

### Low Priority (Nice-to-Have)

9. **Watchlist / favorites**
   - Save frequently analyzed symbols
   - Quick access from Holdings

10. **Backtest improvements**
    - Add more historical periods
    - In-sample vs. out-of-sample visualization
    - Monte Carlo simulation

11. **Mobile trading signals**
    - Push notifications for score 90+ candidates
    - Requires backend job queue (not currently planned)

---

## Security Notes

### Current Implementation

- Passwords hashed with PBKDF2-SHA256 (200,000 iterations), salted
- Session cookies are HttpOnly, SameSite=Lax
- API keys never sent to browser (server-side only)
- No HTTPS (development-only, localhost)

### Before Production

- [ ] Add HTTPS
- [ ] Implement CSRF tokens
- [ ] Add rate limiting on auth endpoints
- [ ] Store users in database, not JSON file
- [ ] Rotate old session tokens
- [ ] Audit for XSS vulnerabilities in symbol input
- [ ] Document OAuth2 integration path

---

## Dependencies

### Runtime

- Python 3.9+ (standard library only, no pip packages)
- Browser: ES2015+ (Chrome 51+, Safari 10+, Firefox 54+)

### Development

- None currently (edit files directly)

### Optional

- `npm install` – For production bundling/minification (not currently used)
- Database: SQLite or PostgreSQL for scaling (not currently used)

---

## Common Troubleshooting

### "Unable to reach Twelve Data: HTTP Error 401: Unauthorized"

**Cause:** API key is invalid or expired  
**Fix:**
1. Log in to twelvedata.com → API keys
2. Check if key is still active
3. Generate new key if necessary
4. Stop server (`Ctrl+C`)
5. Restart: `TWELVE_DATA_API_KEY="new-key" python3 server.py`

### "TWELVE_DATA_API_KEY is not configured"

**Cause:** Server started without key in environment  
**Fix:** Kill server and restart with key:
```bash
ps aux | grep python
kill <PID>
TWELVE_DATA_API_KEY="key" python3 server.py
```

### Holdings data disappeared after sign-in

**Cause:** Server portfolio was empty, replaced local portfolio  
**Fix (Implemented):** On next sign-in, local holdings are restored automatically if server is empty  
**Recovery:** Export from another browser or re-enter holdings

### Remove button doesn't work

**Cause:** Account ID is hardcoded as "default"  
**Status:** Needs code fix (see "Critical" section above)  
**Workaround:** Remove holdings before syncing

### Can't find projected income column

**Cause:** Holdings table is horizontally scrollable on narrow screens  
**Fix:** Scroll right or expand browser window

---

## Repository Structure

```
tradeideas/
├── index.html              # Main page
├── app.js                  # Frontend logic (app.js?v=67 cache)
├── styles.css              # Styling
├── server.py               # Backend
├── users.json              # User accounts (generated at runtime)
├── README.md               # User documentation
├── HANDOFF.md              # This file
└── .gitignore              # Ignores users.json, node_modules, .env
```

---

## Version History (Recent)

| Version | Date | Change |
|---------|------|--------|
| v67 | 2026-10-31 | Change remove button from "Remove" text to "×" symbol, fix responsive layout for mobile |
| v66 | 2026-10-31 | Show user holdings even when Twelve Data unavailable |
| v65 | 2026-10-31 | Add portfolio sync with server-side registration/login |
| v64 | 2026-10-31 | Fix sign-in to restore local holdings if server empty |
| v63 | 2026-10-31 | Add portfolio overview with total value and projected income |
| v62 | 2026-10-31 | Portfolio totals row under each holdings table |
| v61 | 2026-10-31 | Shared dividend settings propagate across all accounts |

---

## Contact & Questions

**Current Developer:** Copilot  
**User:** @moosadrahul  
**Repo:** moosadrahul/tradeideas (Private)

For issues, feature requests, or clarifications, refer to this document and the inline code comments.

---

*Last updated: 2026-10-31 01:01 UTC*
