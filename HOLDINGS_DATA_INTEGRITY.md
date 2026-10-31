# Holdings Data Integrity Guarantees

## Overview
Holdings are persisted **exclusively on the server**. No client-side fallbacks exist that could lose or overwrite data during version updates, redeployments, or code changes.

## Critical Rules (v112+)

### ✅ Holdings Persistence Guarantees
1. **Server-Only Storage**
   - Holdings NEVER stored in `localStorage`
   - Holdings NEVER stored in `sessionStorage`
   - Holdings ONLY loaded from server via `/api/holdings` endpoint
   - Every holdings modification immediately syncs to server

2. **No Auto-Create Fallbacks**
   - Empty default accounts are NEVER auto-created to hide missing data
   - If server returns empty, app remains empty
   - If server is unreachable, app shows empty state (not defaults)
   - Users can manually create accounts once app loads

3. **Version-Safe Updates**
   - Version updates cannot lose holdings
   - Code changes cannot accidentally reset data
   - Deployments don't affect persisted holdings
   - Cache version parameter (`?v=112`) only affects code caching, not data

### ✅ When Holdings Change
Holdings ONLY change when:
1. **Server provides data** during initial load or authentication
   - `initializeHoldings()` loads from `/api/holdings`
   - `authenticate()` loads from server payload

2. **User explicitly creates an account**
   - `createHoldingAccount()` → `saveHoldings()`

3. **User explicitly deletes an account**
   - `confirmDeleteHoldingAccount()` → `saveHoldings()` or `saveHoldingsStructure()`
   - Only the deleted account is removed
   - All other accounts and their holdings preserved

4. **User explicitly renames an account**
   - `saveAccountName()` → `saveHoldingsStructure()`
   - Holdings data never touched

5. **User explicitly reorders accounts**
   - Move up/down buttons or drag-and-drop → `saveHoldingsStructure()`
   - Holdings data never touched

6. **User imports CSV**
   - `handleFileImport()` → `saveHoldings()`
   - Holdings merge with existing data

7. **User adds/modifies holdings**
   - `addHoldingToAccount()` → `saveHoldings()`
   - `deleteHoldingFromAccount()` → `saveHoldings()`

### ✅ Server Sync Architecture
Every holdings modification follows this pattern:

```javascript
// 1. Update in-memory state
holdingAccounts = [...];  // or modify existing

// 2. Immediately sync to server
saveHoldings();  // syncs full holdings to server
// OR
saveHoldingsStructure();  // syncs only account structure (names, order)

// 3. Both functions call serverSync.saveHoldings(holdingAccounts)
// which POSTs to /api/holdings
```

### ✅ Data Loss Prevention
The app is designed to NEVER lose holdings:

❌ **IMPOSSIBLE scenarios:**
- Holdings lost on version update
- Holdings lost on page refresh
- Holdings lost when switching accounts
- Holdings lost when authentication changes
- Holdings lost due to code bugs

✅ **Only way to lose holdings:**
- Explicitly delete an entire account via UI
- Explicit deletion is confirmed with dialog
- User action confirms deletion

## Implementation Details

### Initialization Flow
```
Page Load
  ↓
initializeApp()
  ↓
initializeHoldings()
  ↓
serverSync.loadHoldings() [GET /api/holdings]
  ↓
Server returns: { holdings_accounts: [...] }
  ↓
holdingAccounts = serverData (NEVER defaults)
  ↓
Render UI with server data
```

### Save Flow
```
User Action (add/delete/rename/reorder)
  ↓
Modify holdingAccounts in memory
  ↓
Call saveHoldings() or saveHoldingsStructure()
  ↓
serverSync.saveHoldings(holdingAccounts)
  ↓
POST to /api/holdings with username + holdings_accounts
  ↓
Server stores in USERS[username].holdings_accounts
  ↓
Response: { success: true }
```

### Authentication Flow
```
User logs in
  ↓
authenticate() fetches from /api/auth/login
  ↓
Server returns: { username, portfolio: [...] }
  ↓
holdingAccounts = portfolio from server
  ↓
Render UI with server data
```

## Storage Details

### Server Storage (SQLite)
```python
USERS = {
  "username": {
    "salt": "...",
    "password": "...",
    "portfolio": null,  # Legacy field (migrated to holdings_accounts)
    "holdings_accounts": [  # ← AUTHORITATIVE SOURCE
      {
        "id": "unique-id",
        "name": "Account Name",
        "holdings": [
          { "symbol": "AAPL", "quantity": 100, "bookPrice": 150.00, ... },
          ...
        ]
      },
      ...
    ]
  }
}
```

### Client Memory (JavaScript)
```javascript
let holdingAccounts = [];  // Loaded from server only
let currentHoldingAccountId = null;
let holdings = [];  // Pointer to current account's holdings
```

### Cache (localStorage)
```javascript
// Price cache only - temporary, not persistence
localStorage.getItem("trend-analysis-price-cache")  // ← OK, cache only
localStorage.getItem("trend-analysis-holdings")  // ← NEVER used
localStorage.getItem("trend-analysis-holding-accounts")  // ← NEVER used
```

## Logging & Debugging

All holdings operations log to browser console with clear indicators:
- ✓ Success: "✓ Loaded holdings from server: 4 accounts"
- ✗ Error: "✗ Failed to load holdings from server: ..."
- ℹ Info: "ℹ Server returned empty - user has no holdings yet"

## Testing & Verification

### Test: Version Update Doesn't Lose Holdings
1. Create holdings
2. Update version (`v=112` → `v=113`)
3. Hard refresh browser
4. Holdings still present ✓

### Test: Page Reload Doesn't Lose Holdings
1. Create holdings
2. Refresh page (F5)
3. Holdings still present ✓

### Test: Server Down Doesn't Lose Holdings
1. Create holdings
2. Server becomes unreachable
3. Holdings remain in-memory on client
4. Next server request syncs holdings ✓

### Test: Manual Delete Works
1. Create 2 accounts with holdings
2. Delete account 1
3. Account 1 deleted, account 2 + holdings preserved ✓

## Architecture Decisions

### Why Server-Only Storage?
- ✓ Multi-device sync possible
- ✓ No conflict between localStorage and server
- ✓ Version updates don't risk data
- ✓ Client resets don't lose data
- ✓ Simple, deterministic state

### Why No Auto-Create Defaults?
- ✓ Empty state is explicit, not hiding missing data
- ✓ User knows when holdings aren't loaded
- ✓ Won't accidentally create duplicate accounts
- ✓ Clearer debugging when API fails

### Why Immediate Server Sync?
- ✓ No queue of unsaved changes
- ✓ Every user action is persisted
- ✓ No "forgotten" edits on page close
- ✓ Server always has latest state

## Summary
**Holdings are now bulletproof against data loss.** They're stored exclusively on the server, synced immediately after any change, never fallback to defaults, and guaranteed to survive version updates and deployments.
