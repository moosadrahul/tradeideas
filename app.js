// Password protection
(function() {
  const passwordScreen = document.getElementById("passwordScreen");
  const appContainer = document.getElementById("appContainer");
  const passwordForm = document.getElementById("passwordForm");
  
  if (!sessionStorage.getItem("passwordAuthenticated")) {
    passwordForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const usernameInput = document.getElementById("usernameInput");
      const passwordInput = document.getElementById("passwordInput");
      const username = usernameInput.value;
      const password = passwordInput.value;
      
      try {
        const response = await fetch("/api/auth/verify-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password })
        });
        
        if (response.ok) {
          const data = await response.json();
          sessionStorage.setItem("passwordAuthenticated", "true");
          sessionStorage.setItem("username", username);
          sessionStorage.setItem("userRole", data.role || "read-only");
          window.currentUser = { username, role: data.role || "read-only" };
          passwordScreen.style.display = "none";
          appContainer.removeAttribute("hidden");
          initializeApp();
        } else {
          passwordInput.value = "";
          passwordInput.style.borderColor = "var(--red)";
          setTimeout(() => passwordInput.style.borderColor = "var(--line)", 2000);
        }
      } catch (e) {
        console.error("Password verification failed:", e);
        passwordInput.value = "";
        passwordInput.style.borderColor = "var(--red)";
        setTimeout(() => passwordInput.style.borderColor = "var(--line)", 2000);
      }
    });
  } else {
    const username = sessionStorage.getItem("username");
    const userRole = sessionStorage.getItem("userRole");
    window.currentUser = { username, role: userRole || "read-only" };
    passwordScreen.style.display = "none";
    appContainer.removeAttribute("hidden");
  }
})();

function isReadOnly() { return window.currentUser?.role === "read-only"; }
function isAdmin() { return window.currentUser?.role === "admin"; }

function initializeApp() {
  // Show admin button only if user is admin
  const adminButton = document.getElementById("adminConsoleButton");
  if (adminButton && isAdmin()) {
    adminButton.removeAttribute("hidden");
  }
  // Initialize rest of app
  initializeHoldings();
}

// Server sync for holdings
const serverSync = {
  async loadHoldings() {
    try {
      const username = window.currentUser?.username || sessionStorage.getItem("username");
      console.log("Loading holdings for user:", username);
      if (!username) {
        console.warn("No username found - using default");
      }
      const response = await fetch(`/api/holdings?username=${encodeURIComponent(username || "moosadrahul")}`);
      if (response.ok) {
        const data = await response.json();
        console.log("Server returned holdings:", data);
        return data.holdings_accounts || [];
      } else {
        console.error("Holdings API returned:", response.status);
      }
    } catch (e) {
      console.error("Server sync error:", e);
    }
    return null;
  },
  async saveHoldings(accounts) {
    try {
      console.log("Saving holdings to server:", accounts);
      const response = await fetch("/api/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: window.currentUser?.username || sessionStorage.getItem("username"),
          holdings_accounts: accounts
        })
      });
      console.log("Server save response:", response.status, response.ok);
      if (!response.ok) {
        const text = await response.text();
        console.error("Server error response:", text);
      }
      return response.ok;
    } catch (e) {
      console.error("Failed to save holdings to server:", e);
      return false;
    }
  },
  async changePassword(currentPassword, newPassword) {
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      return response.ok ? { ok: true } : { ok: false, error: await response.text() };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
};

// Change password UI
document.getElementById("changePasswordButton").addEventListener("click", () => {
  document.getElementById("changePasswordPanel").classList.remove("hidden");
});
document.getElementById("changePasswordClose").addEventListener("click", () => {
  document.getElementById("changePasswordPanel").classList.add("hidden");
  document.getElementById("changePasswordForm").reset();
});
document.getElementById("changePasswordForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const currentPassword = document.getElementById("currentPasswordInput").value;
  const newPassword = document.getElementById("newPasswordInput").value;
  const result = await serverSync.changePassword(currentPassword, newPassword);
  if (result.ok) {
    showToast("Password updated successfully!");
    document.getElementById("changePasswordPanel").classList.add("hidden");
    document.getElementById("changePasswordForm").reset();
  } else {
    alert("Error: " + (result.error || "Failed to change password"));
  }
});

// Logout
document.getElementById("logoutButton")?.addEventListener("click", () => {
  sessionStorage.removeItem("passwordAuthenticated");
  sessionStorage.removeItem("username");
  sessionStorage.removeItem("userRole");
  location.reload();
});

// Admin console
document.getElementById("adminConsoleButton")?.addEventListener("click", () => {
  document.getElementById("adminPanel").classList.remove("hidden");
  loadAdminUsersList();
});
document.getElementById("adminClose")?.addEventListener("click", () => {
  document.getElementById("adminPanel").classList.add("hidden");
  document.getElementById("adminForm").reset();
});
document.getElementById("createUserButton")?.addEventListener("click", async () => {
  const newUsername = document.getElementById("newUsernameInput").value.trim();
  const newPassword = document.getElementById("newUserPasswordInput").value;
  const role = document.getElementById("newUserRoleSelect").value;
  
  if (!newUsername || !newPassword) {
    showToast("Username and password required");
    return;
  }
  
  try {
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: window.currentUser?.username,
        newUsername,
        newPassword,
        role
      })
    });
    
    if (response.ok) {
      showToast(`User "${newUsername}" created successfully`);
      document.getElementById("newUsernameInput").value = "";
      document.getElementById("newUserPasswordInput").value = "";
      loadAdminUsersList();
    } else {
      const error = await response.json();
      showToast("Error: " + (error.error || "Failed to create user"));
    }
  } catch (e) {
    console.error("Failed to create user:", e);
    showToast("Failed to create user");
  }
});

document.getElementById("migrateHoldingsButton")?.addEventListener("click", async () => {
  const confirmed = confirm("This will migrate old portfolio data to new holdings format.\n\nContinue?");
  if (!confirmed) return;
  
  const button = document.getElementById("migrateHoldingsButton");
  button.disabled = true;
  button.textContent = "Migrating...";
  
  try {
    const response = await fetch("/api/admin/migrate-holdings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: window.currentUser?.username
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      showToast(data.message);
      console.log("Migration result:", data.migrated);
      if (data.migrated.length > 0) {
        setTimeout(() => initializeHoldings(), 1000);
      }
    } else {
      const error = await response.json();
      showToast("Error: " + (error.error || "Migration failed"));
    }
  } catch (e) {
    console.error("Migration failed:", e);
    showToast("Migration failed");
  } finally {
    button.disabled = false;
    button.textContent = "Migrate Holdings Data";
  }
});

async function loadAdminUsersList() {
  try {
    const response = await fetch("/api/admin/users?username=" + encodeURIComponent(window.currentUser?.username || ""));
    if (!response.ok) throw new Error("Failed to load users");
    
    const data = await response.json();
    const usersList = document.getElementById("usersList");
    usersList.innerHTML = data.users.map(user => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0; border-bottom: 1px solid var(--line);">
        <div>
          <strong>${user.username}</strong>
          <small style="display: block; color: var(--muted);">${user.role}</small>
        </div>
        ${user.username !== "moosadrahul" ? `<button type="button" class="delete-user-btn" data-username="${user.username}" style="padding: 0.5rem 1rem; background: var(--red); color: white; border: none; border-radius: 4px; cursor: pointer;">Delete</button>` : ""}
      </div>
    `).join("");
    
    usersList.querySelectorAll(".delete-user-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        const username = btn.dataset.username;
        if (confirm(`Delete user "${username}"?`)) {
          try {
            const response = await fetch(`/api/admin/users/${username}`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username: window.currentUser?.username })
            });
            if (response.ok) {
              showToast(`User "${username}" deleted`);
              loadAdminUsersList();
            } else {
              showToast("Failed to delete user");
            }
          } catch (e) {
            console.error("Failed to delete user:", e);
            showToast("Failed to delete user");
          }
        }
      });
    });
  } catch (e) {
    console.error("Failed to load users:", e);
    document.getElementById("usersList").innerHTML = '<p class="muted">Failed to load users</p>';
  }
}

const state = { symbol: "AAPL", timeframe: "1Y", prices: [], indicators: {}, source: "Demo data", exchange: "NASDAQ" };
// Holdings are ONLY loaded from server, not localStorage
let holdingAccounts = [];
let currentHoldingAccountId = null;
let holdings = [];
let signedInUser = null;
let authRegisterMode = false;

async function initializeHoldings() {
  try {
    const serverHoldings = await serverSync.loadHoldings();
    console.log("Server holdings loaded:", serverHoldings);
    if (serverHoldings && Array.isArray(serverHoldings) && serverHoldings.length > 0) {
      // Server has holdings - use them
      holdingAccounts = serverHoldings;
      currentHoldingAccountId = holdingAccounts[0]?.id || "default";
      holdings = holdingAccounts[0]?.holdings || [];
      console.log("Updated holdingAccounts from server:", holdingAccounts);
      console.log("Current holdings:", holdings);
    } else {
      // Server returned empty or error - initialize with empty default account
      console.log("No holdings on server - initializing empty");
      holdingAccounts = [{ id: "default", name: "Main holdings", holdings: [] }];
      currentHoldingAccountId = "default";
      holdings = [];
    }
  } catch (e) {
    console.error("Failed to load holdings from server:", e);
    // Initialize with empty default account on error
    holdingAccounts = [{ id: "default", name: "Main holdings", holdings: [] }];
    currentHoldingAccountId = "default";
    holdings = [];
  }
  // Render with server holdings (or empty default)
  refreshPortfolioOverview();
  renderPortfolioSections();
}

const stockNames = {
  AAPL: "Apple Inc.",
  MSFT: "Microsoft Corporation",
  NVDA: "NVIDIA Corporation",
  AMZN: "Amazon.com, Inc.",
  GOOGL: "Alphabet Inc.",
  META: "Meta Platforms, Inc.",
  TSLA: "Tesla, Inc.",
  NFLX: "Netflix, Inc.",
  AMD: "Advanced Micro Devices, Inc.",
  INDA: "iShares MSCI India ETF",
  JPM: "JPMorgan Chase & Co.",
  V: "Visa Inc.",
  WMT: "Walmart Inc.",
  XOM: "Exxon Mobil Corporation",
  SHOP: "Shopify Inc.",
  AME: "AMETEK, Inc."
};
const universes = {
  NASDAQ: ["AAPL","MSFT","NVDA","AMZN","META","GOOGL","AVGO","TSLA","COST","NFLX","AMD","ADBE","PEP","CSCO","TMUS","INTC","QCOM","TXN","AMGN","INTU","CMCSA","AMAT","ISRG","BKNG","GILD","VRTX","ADI","SBUX","MDLZ","REGN","PANW","MU","LRCX","MELI","KLAC","PYPL","SNPS","CDNS","CRWD","MAR","ORLY","ABNB","CTAS","CSX","ADP","NXPI","ROP","MRVL","WDAY"],
  NYSE: ["BRK.B","LLY","JPM","V","WMT","XOM","MA","JNJ","ORCL","HD","PG","UNH","BAC","KO","CVX","GE","IBM","CAT","ABBV","MRK","CRM","WFC","PM","LIN","GS","TMO","MCD","RTX","ABT","DIS","NKE","AXP","LOW","SPGI","BLK","DE","TJX","COP","UPS","PFE","MS","C","SCHW","BMY","AMT","SO","PLD","MDT","CB","AME"],
  TSX: ["RY:TSX","TD:TSX","SHOP:TSX","ENB:TSX","CNR:TSX","BNS:TSX","CP:TSX","BMO:TSX","TRP:TSX","CNQ:TSX","SU:TSX","BCE:TSX","ATD:TSX","ABX:TSX","WCN:TSX","MFC:TSX","CM:TSX","T:TSX","NA:TSX","FTS:TSX","IFC:TSX","SLF:TSX","NTR:TSX","L:TSX","GIB.A:TSX","CCO:TSX","WSP:TSX","EMA:TSX","QSR:TSX","DOL:TSX","MRU:TSX","IMO:TSX","FM:TSX","AQN:TSX","BAM:TSX","OTEX:TSX","CAE:TSX","STN:TSX","ARX:TSX","TOU:TSX","WEED:TSX","HUT:TSX","AC:TSX","MG:TSX","CVE:TSX","TECK.B:TSX","BEP.UN:TSX"]
};
universes.ETFs = ["SPY","QQQ","DIA","IWM","VTI","VOO","IVV","VEA","VWO","EFA","EEM","XLK","XLF","XLE","XLV","XLI","XLP","XLY","XLC","XLU","ARKK","SMH","SOXX","SCHD","VIG","IJH","IJR","MDY","RSP","TLT","IEF","SHY","GLD","SLV","USO","VNQ","REET","INDA","EWJ","EWZ","FXI","MCHI","XBI","IBB","HYG","LQD","PFF","GDX","XRT","KWEB"];
let selectedExchange = "NASDAQ";
const exchangeBySymbol = Object.fromEntries(Object.entries(universes).flatMap(([exchange, symbols]) => symbols.map((symbol) => [symbol, exchange])));
const supportedExchanges = new Set(["TSX", "NASDAQ", "NYSE", "CBOE"]);
function isValidSymbol(value) { return /^[A-Z]{1,6}(?:[.:-][A-Z]{1,8})?$/.test(value); }
let symbolSearchTimer;
let symbolSearchResults = [];
let holdingSearchTimer;
let holdingSearchResults = [];
let pendingDeleteAccountId = null;
function closeSymbolSuggestions() {
  document.querySelector("#symbolSuggestions").classList.remove("show");
}
function formatPercent(value) { return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`; }
function formatHoldingMoney(value) { 
  const num = typeof value === 'number' ? value : parseFloat(value) || 0;
  return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function getDividendSettings(holding) {
  if (holding.dividendAmount !== undefined) return { amount: holding.dividendAmount || 0, frequency: holding.dividendFrequency || "quarterly" };
  if (holding.amount !== undefined) return { amount: holding.amount || 0, frequency: holding.frequency || "quarterly" };
  return { amount: holding.quarterlyDividend || 0, frequency: "quarterly" };
}
function normalizeHoldingSymbol(symbol) { return symbol.trim().toUpperCase(); }
function getProjectedAnnualIncome(quantity, amount, frequency) {
  const paymentsPerYear = { monthly: 12, quarterly: 4, "semi-annual": 2, annual: 1 };
  return (amount || 0) * (paymentsPerYear[frequency] || 0) * quantity;
}
function getModelReturns(current, score) {
  const conviction = (score - 50) / 100;
  return {
    oneYearLow: (0.04 + conviction * 0.3) * 100,
    oneYearHigh: (0.18 + conviction * 0.65) * 100,
    fiveYearLow: (0.18 + conviction * 0.9) * 100,
    fiveYearHigh: (0.8 + conviction * 2.2) * 100,
  };
}
function getCurrentHoldingAccount() { return holdingAccounts.find((account) => account.id === currentHoldingAccountId); }
function saveHoldings() {
  const account = getCurrentHoldingAccount();
  if (!account) {
    console.error("No current holding account found!");
    return;
  }
  account.holdings = holdings;
  serverSync.saveHoldings(holdingAccounts).then((success) => {
    console.log("Holdings saved to server:", success);
    if (!success) console.warn("Failed to save holdings to server, will retry on next change");
  });
  if (signedInUser) syncPortfolio();
}
function saveHoldingsStructure() {
  // Save account order and structure to server only
  serverSync.saveHoldings(holdingAccounts).then((success) => {
    console.log("Holdings structure saved to server:", success);
    if (!success) console.warn("Failed to save holdings structure to server, will retry on next change");
  });
  if (signedInUser) syncPortfolio();
}
async function syncPortfolio() {
  try {
    await fetch("/api/portfolio", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portfolio: holdingAccounts }),
    });
  } catch {
    showToast("Portfolio saved locally; sync is temporarily unavailable.");
  }
}
function getCachedPrice(symbol) {
  try {
    const cache = JSON.parse(localStorage.getItem("trend-analysis-price-cache") || "{}");
    return cache[symbol];
  } catch {
    return null;
  }
}
function setCachedPrice(symbol, price) {
  try {
    const cache = JSON.parse(localStorage.getItem("trend-analysis-price-cache") || "{}");
    cache[symbol] = { price, timestamp: Date.now() };
    localStorage.setItem("trend-analysis-price-cache", JSON.stringify(cache));
  } catch {
    // Silently fail if cache storage fails
  }
}
async function refreshAllPrices() {
  const btn = document.querySelector("#refreshPricesButton");
  btn.disabled = true;
  btn.textContent = "↻ Refreshing…";
  try {
    await Promise.all(holdingAccounts.map((account) => refreshPortfolioSection(account)));
    showToast("Prices refreshed successfully");
  } catch (error) {
    showToast(`Error refreshing prices: ${error.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "↻ Refresh prices";
  }
}
function openAuthPanel() { document.querySelector("#authPanel").classList.remove("hidden"); document.querySelector("#authUsername").focus(); }
function closeAuthPanel() { document.querySelector("#authPanel").classList.add("hidden"); }
function setAuthMode(register) {
  authRegisterMode = register;
  document.querySelector("#authTitle").textContent = register ? "Create sync account" : "Sign in to sync";
  document.querySelector("#authSubmit").textContent = register ? "Create account" : "Sign in";
  document.querySelector("#authMode").textContent = register ? "I already have an account" : "Create a new account";
  document.querySelector("#authPassword").autocomplete = register ? "new-password" : "current-password";
}
async function authenticate(event) {
  event.preventDefault();
  const username = document.querySelector("#authUsername").value.trim();
  const password = document.querySelector("#authPassword").value;
  const message = document.querySelector("#authMessage");
  message.textContent = "Connecting…";
  try {
    const response = await fetch(`/api/auth/${authRegisterMode ? "register" : "login"}`, {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Authentication failed");
    signedInUser = payload.username;
    const serverHoldings = Array.isArray(payload.portfolio) ? payload.portfolio.reduce((total, account) => total + (account.holdings?.length || 0), 0) : 0;
    const localHoldings = holdingAccounts.reduce((total, account) => total + (account.holdings?.length || 0), 0) || 0;
    if (Array.isArray(payload.portfolio) && serverHoldings > 0) {
      holdingAccounts = payload.portfolio;
      currentHoldingAccountId = holdingAccounts[0]?.id || "default";
      holdings = holdingAccounts[0]?.holdings || [];
      renderPortfolioSections();
      refreshPortfolioOverview();
    } else if (localHoldings > 0) {
      if (!holdingAccounts.some((account) => account.holdings?.length)) {
        holdingAccounts = [{ id: "default", name: "Main holdings", holdings: [] }];
        holdings = [];
        renderPortfolioSections();
        refreshPortfolioOverview();
      }
      await syncPortfolio();
    } else {
      await syncPortfolio();
    }
    document.querySelector("#authButton").textContent = `Synced: ${signedInUser}`;
    closeAuthPanel();
    showToast(`Portfolio sync enabled for ${signedInUser}.`);
  } catch (error) {
    message.textContent = error.message;
  }
}
async function initializeAuth() {
  try {
    const response = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (!response.ok) return;
    const payload = await response.json();
    signedInUser = payload.username;
    document.querySelector("#authButton").textContent = `Synced: ${signedInUser}`;
  } catch {}
}
function renderHoldingAccounts() {
  renderPortfolioSections();
}
function performanceMarkup(results) {
  const successful = results.filter((result) => !result.error);
  if (!successful.length) return { summary: '<p class="scanner-empty">Live gain/loss will appear after price data loads.</p>', asOf: "" };
  const performance = successful.map(({ holding, market }) => ({ holding, ...getHoldingPerformance(holding, market) }));
  const totalBookValue = performance.reduce((sum, item) => sum + item.bookValue, 0);
  const totalCurrentValue = performance.reduce((sum, item) => sum + item.currentValue, 0);
  const totalGainLoss = performance.reduce((sum, item) => sum + item.gainLoss, 0);
  const totalGainLossPercent = totalBookValue ? totalGainLoss / totalBookValue * 100 : 0;
  const valueClass = (value) => value >= 0 ? "positive" : "negative";
  return { asOf: `${successful.length} live position${successful.length === 1 ? "" : "s"}`, summary: `<div class="holding-performance-summary"><div><span>Portfolio current value</span><strong>${formatHoldingMoney(totalCurrentValue)}</strong></div><div><span>Total gain/loss</span><strong class="${valueClass(totalGainLoss)}">${totalGainLoss >= 0 ? "+" : ""}${formatHoldingMoney(totalGainLoss)}</strong></div><div><span>Return on book value</span><strong class="${valueClass(totalGainLossPercent)}">${formatPercent(totalGainLossPercent)}</strong></div></div>` };
}
function portfolioTotalsMarkup(account, results) {
  const performance = results.filter((result) => !result.error).map(({ holding, market }) => getHoldingPerformance(holding, market));
  const bookValue = account.holdings.reduce((sum, holding) => sum + holding.quantity * holding.bookPrice, 0);
  const gainLoss = performance.reduce((sum, item) => sum + item.gainLoss, 0);
  const projectedIncome = account.holdings.reduce((sum, holding) => {
    const dividend = getDividendSettings(holding);
    return sum + getProjectedAnnualIncome(holding.quantity, dividend.amount, dividend.frequency);
  }, 0);
  const valueClass = gainLoss >= 0 ? "positive" : "negative";
  return `<tfoot><tr class="holdings-totals"><th colspan="3">Portfolio totals</th><td>${formatMoney(bookValue)}</td><td>—</td><td class="${valueClass}">${gainLoss >= 0 ? "+" : ""}${formatHoldingMoney(gainLoss)}</td><td>—</td><td class="positive">${formatHoldingMoney(projectedIncome)}</td><td colspan="4"></td></tr></tfoot>`;
}
function unavailableHoldingRow(holding, accountId, error) {
  const dividend = getDividendSettings(holding);
  const projectedIncome = getProjectedAnnualIncome(holding.quantity, dividend.amount, dividend.frequency);
  return `<tr><td><strong>${holding.symbol}</strong></td><td>${holding.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td><td>${formatHoldingMoney(holding.bookPrice)}</td><td>${formatMoney(holding.quantity * holding.bookPrice)}</td><td class="negative">Unavailable</td><td class="negative">Unavailable</td><td>—</td><td class="positive">${formatHoldingMoney(projectedIncome)}</td><td colspan="3">Live price unavailable</td><td><button class="remove-holding" data-id="${holding.id}" data-account-id="${accountId}" type="button" aria-label="Remove ${holding.symbol}" title="Remove ${holding.symbol}">×</button></td></tr>`;
}
async function renderPortfolioSections() {
  const container = document.querySelector("#portfolioSections");
  container.innerHTML = holdingAccounts.map((account, index) => {
    const canMoveUp = index > 0;
    const canMoveDown = index < holdingAccounts.length - 1;
    const moveButtonsHTML = `<div style="display: flex; gap: 0.25rem; margin-left: auto;">
      ${canMoveUp ? `<button type="button" class="account-move-btn" data-move-up="${index}" title="Move up" style="padding: 0.3rem 0.5rem; font-size: 0.85rem; cursor: pointer; border: 1px solid #444; background: transparent; color: inherit; border-radius: 0.25rem;" ${isReadOnly() ? 'disabled' : ''}>▲</button>` : ''}
      ${canMoveDown ? `<button type="button" class="account-move-btn" data-move-down="${index}" title="Move down" style="padding: 0.3rem 0.5rem; font-size: 0.85rem; cursor: pointer; border: 1px solid #444; background: transparent; color: inherit; border-radius: 0.25rem;" ${isReadOnly() ? 'disabled' : ''}>▼</button>` : ''}
    </div>`;
    
    return `<section class="portfolio-section" data-account-section="${account.id}" draggable="${!isReadOnly()}" data-account-index="${index}" style="cursor: ${!isReadOnly() ? 'move' : 'default'};"><div class="portfolio-section-heading" style="display: flex; align-items: center; gap: 1rem;"><div style="display: flex; align-items: center; gap: 0.5rem; flex: 1;"><span class="drag-handle" style="cursor: grab; font-size: 1.2rem; user-select: none; ${isReadOnly() ? 'opacity: 0.3;' : ''}">≡</span><div><p class="card-kicker">Account type</p><input class="portfolio-section-name" data-account-name="${account.id}" value="${account.name}" maxlength="40" aria-label="Portfolio name" ${isReadOnly() ? 'disabled' : ''} /></div></div>${moveButtonsHTML}<button class="holding-portfolio-delete" data-delete-account="${account.id}" aria-label="Delete ${account.name}" title="Delete ${account.name}" ${isReadOnly() ? 'disabled' : ''}>×</button></div><form class="holding-form portfolio-holding-form" data-account-form="${account.id}"><div class="holding-symbol-input-wrap"><label>Symbol<input name="symbol" class="holding-symbol-input" placeholder="Enter symbol" maxlength="20" ${isReadOnly() ? 'disabled' : ''} required /></label><div class="holding-symbol-suggestions" data-suggestions="${account.id}"></div></div><label>Quantity<input name="quantity" type="number" min="0.0001" step="any" placeholder="Qty" ${isReadOnly() ? 'disabled' : ''} required /></label><label>Book price<input name="bookPrice" type="number" min="0.0001" step="any" placeholder="Price" ${isReadOnly() ? 'disabled' : ''} required /></label><button class="primary-button" type="submit" ${isReadOnly() ? 'disabled' : ''}>Add holding <span>+</span></button></form><section class="holdings-performance"><div class="holdings-performance-heading"><div><p class="card-kicker">Position performance</p><h2>Gain/loss by holding</h2></div><span class="holdings-performance-as-of" data-performance-as-of="${account.id}"></span></div><div class="holdings-performance-list" data-performance="${account.id}"><p class="scanner-empty">Loading live prices…</p></div></section><div class="card holdings-card"><div class="holdings-table-wrap"><table class="holdings-table"><thead><tr><th>Symbol</th><th>Qty</th><th>Book price</th><th>Book value</th><th>Current price</th><th>Gain/loss</th><th>Gain/loss %</th><th>Proj Inc.</th><th>Expected 1 month</th><th>Expected 1 year</th><th>Expected 5 years</th><th></th></tr></thead><tbody data-rows="${account.id}"><tr><td colspan="12" class="scanner-empty">Loading live prices…</td></tr></tbody>${portfolioTotalsMarkup(account, [])}</table></div></div></section>`;
  }).join("");
  
  // Add move button click handlers
  container.querySelectorAll("[data-move-up]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = parseInt(btn.dataset.moveUp);
      if (index > 0) {
        const draggedAccount = holdingAccounts[index];
        holdingAccounts.splice(index, 1);
        holdingAccounts.splice(index - 1, 0, draggedAccount);
        saveHoldingsStructure();
        renderPortfolioSections();
      }
    });
  });
  
  container.querySelectorAll("[data-move-down]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = parseInt(btn.dataset.moveDown);
      if (index < holdingAccounts.length - 1) {
        const draggedAccount = holdingAccounts[index];
        holdingAccounts.splice(index, 1);
        holdingAccounts.splice(index + 1, 0, draggedAccount);
        saveHoldingsStructure();
        renderPortfolioSections();
      }
    });
  });
  
  // Add drag and drop handlers
  if (!isReadOnly()) {
    container.querySelectorAll("[data-account-section]").forEach((section) => {
      section.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/html", e.currentTarget.innerHTML);
        e.currentTarget.style.opacity = "0.5";
        e.currentTarget.dataset.draggedIndex = section.dataset.accountIndex;
        // Start auto-scroll during drag
        startDragAutoScroll();
      });
      section.addEventListener("dragend", (e) => {
        e.currentTarget.style.opacity = "1";
        delete e.currentTarget.dataset.draggedIndex;
        // Stop auto-scroll
        stopDragAutoScroll();
      });
      section.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        e.currentTarget.style.borderTop = "3px solid var(--green)";
        // Auto-scroll toward the dragged element
        autoScrollToDrag(e);
      });
      section.addEventListener("dragleave", (e) => {
        e.currentTarget.style.borderTop = "";
      });
      section.addEventListener("drop", (e) => {
        e.preventDefault();
        e.currentTarget.style.borderTop = "";
        const draggedIndex = parseInt(container.querySelector("[data-dragged-index]")?.dataset.draggedIndex || -1);
        const targetIndex = parseInt(e.currentTarget.dataset.accountIndex);
        if (draggedIndex !== -1 && draggedIndex !== targetIndex) {
          const draggedAccount = holdingAccounts[draggedIndex];
          holdingAccounts.splice(draggedIndex, 1);
          holdingAccounts.splice(targetIndex > draggedIndex ? targetIndex - 1 : targetIndex, 0, draggedAccount);
          saveHoldingsStructure();
          renderPortfolioSections();
        }
      });
    });

  }
  
  container.querySelectorAll("[data-delete-account]").forEach((button) => button.addEventListener("click", () => deleteHoldingAccount(button.dataset.deleteAccount)));
  
  // Auto-scroll helper functions
  let autoScrollInterval;
  function startDragAutoScroll() {
    autoScrollInterval = setInterval(() => {
      const container = document.querySelector("[data-portfolio-container]");
      if (!container) return;
      
      const rect = container.getBoundingClientRect();
      const scrollSpeed = 5;
      
      // Scroll up if mouse is near top
      if (window.dragMouseY && window.dragMouseY < rect.top + 50) {
        container.scrollBy(0, -scrollSpeed);
      }
      // Scroll down if mouse is near bottom
      else if (window.dragMouseY && window.dragMouseY > rect.bottom - 50) {
        container.scrollBy(0, scrollSpeed);
      }
    }, 50);
  }

  function stopDragAutoScroll() {
    if (autoScrollInterval) clearInterval(autoScrollInterval);
  }

  function autoScrollToDrag(e) {
    window.dragMouseY = e.clientY;
  }

  // Clean up on drag end
  document.addEventListener("dragend", stopDragAutoScroll);
  container.querySelectorAll("[data-account-name]").forEach((input) => input.addEventListener("blur", () => saveAccountName(input)));
  container.querySelectorAll("[data-account-form]").forEach((form) => {
    form.addEventListener("submit", (event) => addHoldingToAccount(event, form));
    const symbolInput = form.querySelector(".holding-symbol-input");
    const suggestionsContainer = form.querySelector(".holding-symbol-suggestions");
    const symbolInputWrap = form.querySelector(".holding-symbol-input-wrap");
    let searchTimer;
    symbolInput.addEventListener("input", (event) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        const term = event.target.value.trim();
        if (!term) {
          suggestionsContainer.classList.remove("show");
          suggestionsContainer.innerHTML = "";
          suggestionsContainer.style.display = "none";
          return;
        }
        try {
          const response = await fetch(`/api/symbol-search?symbol=${encodeURIComponent(term)}`);
          if (!response.ok) throw new Error(`Symbol search failed: ${response.status}`);
          const payload = await response.json();
          const results = (payload.results || []).filter((result) => supportedExchanges.has(result.exchange));
          if (results.length) {
            suggestionsContainer.innerHTML = results.map((result, index) => `<button type="button" class="symbol-option" data-result-index="${index}" role="option" data-symbol="${result.symbol}" data-exchange="${result.exchange}"><strong>${result.display_symbol}</strong><em>${result.exchange}</em><small>${result.name}${result.type ? ` · ${result.type}` : ""}</small></button>`).join("");
            suggestionsContainer.classList.add("show");
            suggestionsContainer.style.display = "block";
            suggestionsContainer.querySelectorAll("[data-result-index]").forEach((button, index) => {
              button.addEventListener("click", (e) => {
                e.preventDefault();
                symbolInput.value = results[index].symbol;
                suggestionsContainer.classList.remove("show");
                suggestionsContainer.innerHTML = "";
                suggestionsContainer.style.display = "none";
              });
            });
          } else {
            suggestionsContainer.innerHTML = '<div class="symbol-option"><small>No matching symbols found.</small></div>';
            suggestionsContainer.classList.add("show");
            suggestionsContainer.style.display = "block";
          }
        } catch (error) {
          console.error("Symbol search error:", error);
          suggestionsContainer.innerHTML = `<div class="symbol-option"><small>Error: ${error.message}</small></div>`;
          suggestionsContainer.classList.add("show");
          suggestionsContainer.style.display = "block";
        }
      }, 250);
    });
    symbolInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        suggestionsContainer.classList.remove("show");
        suggestionsContainer.innerHTML = "";
        suggestionsContainer.style.display = "none";
      }
    });
    symbolInputWrap.addEventListener("click", (event) => {
      if (event.target === symbolInput && suggestionsContainer.classList.contains("show")) {
        return;
      }
    });
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".holding-symbol-input-wrap")) {
      document.querySelectorAll(".holding-symbol-suggestions").forEach((cont) => {
        cont.classList.remove("show");
        cont.style.display = "none";
      });
    }
  }, { capture: false });
  await Promise.all(holdingAccounts.map((account) => refreshPortfolioSection(account)));
}
async function refreshPortfolioSection(account) {
  const results = await Promise.all(account.holdings.map(async (holding) => {
    try {
      const response = await fetch(`/api/time-series?symbol=${encodeURIComponent(holding.symbol)}&outputsize=1261&interval=1day`);
      const payload = await response.json();
      if (!response.ok || !payload.prices?.length) throw new Error(payload.error || "No price data");
      // Cache the current price
      if (payload.prices && payload.prices.length > 0) {
        setCachedPrice(holding.symbol, payload.prices[payload.prices.length - 1].close);
      }
      return { holding, market: payload };
    } catch (error) {
      // Try to use cached price
      const cachedPrice = getCachedPrice(holding.symbol);
      if (cachedPrice) {
        // Create a minimal market object with just the last cached price
        return { holding, market: { prices: [{ close: cachedPrice }] }, fromCache: true };
      }
      return { holding, error: error.message };
    }
  }));
  const rows = document.querySelector(`[data-rows="${account.id}"]`);
  const performance = document.querySelector(`[data-performance="${account.id}"]`);
  const asOf = document.querySelector(`[data-performance-as-of="${account.id}"]`);
  rows.innerHTML = account.holdings.length ? results.map(({ holding, market, error, fromCache }) => error ? unavailableHoldingRow(holding, account.id, error) : renderHoldingRow(holding, market, account.id, fromCache)).join("") : '<tr><td colspan="13" class="scanner-empty">No holdings added yet.</td></tr>';
  rows.parentElement.querySelector("tfoot").outerHTML = portfolioTotalsMarkup(account, results);
  const markup = performanceMarkup(results);
  performance.innerHTML = markup.summary;
  asOf.textContent = markup.asOf;
  rows.querySelectorAll(".holding-dividend-input").forEach((input) => input.addEventListener("change", () => saveHoldingDividend(input)));
  rows.querySelectorAll(".holding-quantity-input").forEach((input) => input.addEventListener("change", () => saveHoldingQuantity(input)));
  rows.querySelectorAll(".holding-bookprice-input").forEach((input) => input.addEventListener("change", () => saveHoldingBookPrice(input)));
  rows.querySelectorAll(".holding-symbol-button").forEach((button) => button.addEventListener("click", () => {
    rows.querySelector(`[data-editor="${button.dataset.holdingId}"]`).classList.toggle("hidden");
  }));
  rows.querySelectorAll(".holding-income-input").forEach((input) => input.addEventListener("change", () => saveHoldingDividend(input)));
  rows.querySelectorAll(".remove-holding").forEach((button) => button.addEventListener("click", () => removeHolding(button.dataset.accountId, button.dataset.id)));
}
function saveAccountName(input) {
  const account = holdingAccounts.find((item) => item.id === input.dataset.accountName);
  const name = input.value.trim();
  if (!account) return;
  if (!name) { input.value = account.name; return; }
  account.name = name;
  saveHoldingsStructure();
  renderPortfolioSections();
}
function addHoldingToAccount(event, form) {
  if (isReadOnly()) return showToast("Read-only users cannot add holdings.");
  event.preventDefault();
  const account = holdingAccounts.find((item) => item.id === form.dataset.accountForm);
  const symbol = form.elements.symbol.value.trim().toUpperCase();
  const quantity = Number(form.elements.quantity.value);
  const bookPrice = Number(form.elements.bookPrice.value);
  if (!account || !isValidSymbol(symbol) || quantity <= 0 || bookPrice <= 0) return showToast("Enter a valid symbol, quantity, and book price.");
  const existing = account.holdings.find((holding) => holding.symbol === symbol);
  if (existing) { const totalQuantity = existing.quantity + quantity; existing.bookPrice = (existing.quantity * existing.bookPrice + quantity * bookPrice) / totalQuantity; existing.quantity = totalQuantity; }
  else account.holdings.push({ id: `${Date.now()}-${symbol}`, symbol, quantity, bookPrice, dividendAmount: 0, dividendFrequency: "quarterly" });
  saveHoldings();
  form.reset();
  renderPortfolioSections();
  refreshPortfolioOverview();
}
function saveHoldingDividend(input) {
  if (isReadOnly()) return showToast("Read-only users cannot modify holdings.");
  const account = holdingAccounts.find((item) => item.id === input.dataset.accountId);
  const holding = account?.holdings.find((item) => item.id === input.dataset.holdingId);
  if (!holding) return;
  const settings = getDividendSettings(holding);
  if (input.dataset.dividendField === "frequency") settings.frequency = input.value;
  else settings.amount = Math.max(0, Number(input.value) || 0);
  holdingAccounts.forEach((portfolio) => portfolio.holdings.forEach((item) => {
    if (normalizeHoldingSymbol(item.symbol) === normalizeHoldingSymbol(holding.symbol)) {
      item.dividendAmount = settings.amount;
      item.dividendFrequency = settings.frequency;
      delete item.amount;
      delete item.frequency;
      delete item.quarterlyDividend;
    }
  }));
  saveHoldings();
  renderPortfolioSections();
  showToast(`Dividend settings updated for ${holding.symbol}.`);
}
function removeHolding(accountId, holdingId) {
  if (isReadOnly()) return showToast("Read-only users cannot modify holdings.");
  const account = holdingAccounts.find((item) => item.id === accountId);
  if (!account) return;
  account.holdings = account.holdings.filter((holding) => holding.id !== holdingId);
  if (accountId === currentHoldingAccountId) holdings = account.holdings;
  saveHoldings();
  renderPortfolioSections();
  refreshPortfolioOverview();
}
async function refreshPortfolioOverview() {
  const valueElement = document.querySelector("#portfolioOverviewValue");
  const incomeElement = document.querySelector("#portfolioOverviewIncome");
  const gainLossElement = document.querySelector("#portfolioOverviewGainLoss");
  const accountsElement = document.querySelector("#portfolioAccountValues");
  const statusElement = document.querySelector("#portfolioOverviewStatus");
  const accountResults = await Promise.all(holdingAccounts.map(async (account) => {
    const values = await Promise.all(account.holdings.map(async (holding) => {
      try {
        const response = await fetch(`/api/time-series?symbol=${encodeURIComponent(holding.symbol)}&outputsize=2&interval=1day`);
        const payload = await response.json();
        if (!response.ok || !payload.prices?.length) throw new Error(payload.error || "No price data");
        return holding.quantity * payload.prices.at(-1).close;
      } catch {
        return null;
      }
    }));
    return { account, value: values.reduce((sum, value) => sum + (value || 0), 0), failed: values.filter((value) => value === null).length };
  }));
  const totalValue = accountResults.reduce((sum, result) => sum + result.value, 0);
  const totalBookValue = holdingAccounts.reduce((sum, account) => sum + account.holdings.reduce((accountSum, holding) => accountSum + (holding.quantity * holding.bookPrice), 0), 0);
  const totalGainLoss = totalValue - totalBookValue;
  const totalProjectedIncome = holdingAccounts.reduce((sum, account) => sum + account.holdings.reduce((accountSum, holding) => {
    const dividend = getDividendSettings(holding);
    return accountSum + getProjectedAnnualIncome(holding.quantity, dividend.amount, dividend.frequency);
  }, 0), 0);
  valueElement.textContent = formatHoldingMoney(totalValue);
  incomeElement.textContent = formatHoldingMoney(totalProjectedIncome);
  gainLossElement.textContent = `${totalGainLoss >= 0 ? "+" : ""}${formatHoldingMoney(totalGainLoss)}`;
  gainLossElement.classList.toggle("positive", totalGainLoss >= 0);
  gainLossElement.classList.toggle("negative", totalGainLoss < 0);
  accountsElement.innerHTML = accountResults.map(({ account, value, failed }) => `<div class="portfolio-account-value"><strong>${account.name}</strong><span>${formatHoldingMoney(value)}</span>${failed ? `<small>${failed} price${failed === 1 ? "" : "s"} unavailable</small>` : ""}</div>`).join("");
  statusElement.textContent = `${accountResults.length} account type${accountResults.length === 1 ? "" : "s"}`;
}
function switchHoldingAccount(accountId) {
  const account = holdingAccounts.find((item) => item.id === accountId);
  if (!account) return;
  currentHoldingAccountId = account.id;
  holdings = account.holdings;
  saveHoldings();
  renderHoldingAccounts();
  renderPortfolioSections();
  refreshPortfolioOverview();
}
function createHoldingAccount() {
  const account = { id: `${Date.now()}-portfolio`, name: `Portfolio ${holdingAccounts.length + 1}`, holdings: [] };
  holdingAccounts.push(account);
  currentHoldingAccountId = account.id;
  holdings = account.holdings;
  saveHoldings();
  renderHoldingAccounts();
  renderPortfolioSections();
  refreshPortfolioOverview();
  showToast(`${account.name} created.`);
}
function deleteHoldingAccount(accountId) {
  if (isReadOnly()) return showToast("Read-only users cannot delete portfolios.");
  if (holdingAccounts.length === 1) {
    showToast("Keep at least one portfolio.");
    return;
  }
  const account = holdingAccounts.find((item) => item.id === accountId);
  if (!account) return;
  pendingDeleteAccountId = accountId;
  document.querySelector("#deletePortfolioMessage").textContent = `Delete "${account.name}" and all of its holdings? This cannot be undone.`;
  document.querySelector("#deletePortfolioDialog").classList.remove("hidden");
}
function closeDeletePortfolioDialog() {
  pendingDeleteAccountId = null;
  document.querySelector("#deletePortfolioDialog").classList.add("hidden");
}
function confirmDeleteHoldingAccount() {
  if (isReadOnly()) return showToast("Read-only users cannot delete portfolios.");
  const accountId = pendingDeleteAccountId;
  const account = holdingAccounts.find((item) => item.id === accountId);
  if (!account) return closeDeletePortfolioDialog();
  holdingAccounts = holdingAccounts.filter((item) => item.id !== accountId);
  if (currentHoldingAccountId === accountId) {
    currentHoldingAccountId = holdingAccounts[0].id;
    holdings = getCurrentHoldingAccount().holdings;
    saveHoldings();
  } else {
    saveHoldingsStructure();
  }
  renderHoldingAccounts();
  renderPortfolioSections();
  refreshPortfolioOverview();
  closeDeletePortfolioDialog();
  showToast(`${account.name} deleted.`);
}
function saveHoldingAccountName() {
  const account = getCurrentHoldingAccount();
  const nameInput = document.querySelector("#holdingAccountName");
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.value = account.name;
    return;
  }
  if (name === account.name) return;
  account.name = name;
  holdings = account.holdings;
  saveHoldings();
  renderHoldingAccounts();
  renderPortfolioSections();
  refreshPortfolioOverview();
  showToast(`Account renamed to ${account.name}.`);
}
function setHoldingsStatus(message) { showToast(message); }
function getHoldingPerformance(holding, market) {
  const priceData = market.prices.at(-1);
  const current = typeof priceData.close === 'number' ? priceData.close : parseFloat(priceData.close);
  const bookValue = holding.quantity * holding.bookPrice;
  const currentValue = holding.quantity * current;
  const gainLoss = currentValue - bookValue;
  return { current, bookValue, currentValue, gainLoss, gainLossPercent: bookValue ? gainLoss / bookValue * 100 : 0 };
}
function renderHoldingsPerformance(results) {
  const element = document.querySelector("#holdingsPerformance");
  const asOf = document.querySelector("#holdingsPerformanceAsOf");
  const successful = results.filter((result) => !result.error);
  if (!successful.length) {
    element.innerHTML = '<p class="scanner-empty">Live gain/loss will appear after price data loads.</p>';
    asOf.textContent = "";
    return;
  }
  const performance = successful.map(({ holding, market }) => ({ holding, ...getHoldingPerformance(holding, market) }));
  const totalBookValue = performance.reduce((sum, item) => sum + item.bookValue, 0);
  const totalCurrentValue = performance.reduce((sum, item) => sum + item.currentValue, 0);
  const totalGainLoss = performance.reduce((sum, item) => sum + item.gainLoss, 0);
  const totalGainLossPercent = totalBookValue ? totalGainLoss / totalBookValue * 100 : 0;
  const valueClass = (value) => value >= 0 ? "positive" : "negative";
  element.innerHTML = `<div class="holding-performance-summary"><div><span>Portfolio current value</span><strong>${formatHoldingMoney(totalCurrentValue)}</strong></div><div><span>Total gain/loss</span><strong class="${valueClass(totalGainLoss)}">${totalGainLoss >= 0 ? "+" : ""}${formatHoldingMoney(totalGainLoss)}</strong></div><div><span>Return on book value</span><strong class="${valueClass(totalGainLossPercent)}">${formatPercent(totalGainLossPercent)}</strong></div></div>`;
  asOf.textContent = `${successful.length} live position${successful.length === 1 ? "" : "s"}`;
}
function saveHoldingQuantity(input) {
  const account = holdingAccounts.find((item) => item.id === input.dataset.accountId);
  const holding = account?.holdings.find((item) => item.id === input.dataset.holdingId);
  if (!holding) return;
  const newQuantity = Number(input.value) || 0;
  if (newQuantity <= 0) {
    input.value = holding.quantity;
    showToast("Quantity must be greater than 0.");
    return;
  }
  holding.quantity = newQuantity;
  saveHoldings();
  renderPortfolioSections();
  refreshPortfolioOverview();
  showToast(`Quantity updated to ${newQuantity} for ${holding.symbol}.`);
}
function saveHoldingBookPrice(input) {
  const account = holdingAccounts.find((item) => item.id === input.dataset.accountId);
  const holding = account?.holdings.find((item) => item.id === input.dataset.holdingId);
  if (!holding) return;
  const newBookPrice = Number(input.value) || 0;
  if (newBookPrice <= 0) {
    input.value = holding.bookPrice;
    showToast("Book price must be greater than 0.");
    return;
  }
  holding.bookPrice = newBookPrice;
  saveHoldings();
  renderPortfolioSections();
  refreshPortfolioOverview();
  showToast(`Book price updated to ${formatHoldingMoney(newBookPrice)} for ${holding.symbol}.`);
}
function renderHoldingRow(holding, market, accountId, fromCache = false) {
  const { current, bookValue, gainLoss, gainLossPercent } = getHoldingPerformance(holding, market);
  const indicators = calculateIndicators(market.prices);
  const modelReturns = getModelReturns(current, indicators.score);
  const monthExpected = Math.max(-25, Math.min(35, (modelReturns.oneYearLow + modelReturns.oneYearHigh) / 12));
  const dividend = getDividendSettings(holding);
  const projectedIncome = getProjectedAnnualIncome(holding.quantity, dividend.amount, dividend.frequency);
  const valueClass = (value) => value >= 0 ? "positive" : "negative";
  const cacheIndicator = fromCache ? ' <small style="opacity: 0.6;">(cached)</small>' : '';
  return `<tr><td><strong class="holding-symbol-button" data-holding-id="${holding.id}" style="cursor:pointer;text-decoration:none;display:block;color:var(--ink)">${holding.symbol}${cacheIndicator}</strong></td><td><input class="holding-quantity-input" type="number" min="0.0001" step="any" value="${holding.quantity}" data-account-id="${accountId}" data-holding-id="${holding.id}" aria-label="Quantity for ${holding.symbol}" /></td><td><input class="holding-bookprice-input" type="number" min="0.0001" step="any" value="${holding.bookPrice}" data-account-id="${accountId}" data-holding-id="${holding.id}" aria-label="Book price for ${holding.symbol}" /></td><td>${formatMoney(bookValue)}</td><td>${formatHoldingMoney(current)}</td><td class="${valueClass(gainLoss)}">${gainLoss >= 0 ? "+" : ""}${formatHoldingMoney(gainLoss)}</td><td class="${valueClass(gainLossPercent)}">${formatPercent(gainLossPercent)}</td><td class="positive">${formatHoldingMoney(projectedIncome)}</td><td>${formatPercent(monthExpected)}</td><td>${formatPercent(modelReturns.oneYearLow)} to ${formatPercent(modelReturns.oneYearHigh)}</td><td>${formatPercent(modelReturns.fiveYearLow)} to ${formatPercent(modelReturns.fiveYearHigh)}</td><td><button class="remove-holding" data-id="${holding.id}" data-account-id="${accountId}" type="button" aria-label="Remove ${holding.symbol}" title="Remove ${holding.symbol}">×</button></td></tr><tr class="holding-income-editor hidden" data-editor="${holding.id}"><td colspan="12"><label>Dividend amount per payment <input class="holding-income-input" data-account-id="${accountId}" data-holding-id="${holding.id}" data-dividend-field="amount" type="number" min="0" step="0.001" value="${dividend.amount}" /></label><label>Frequency <select class="holding-income-input" data-account-id="${accountId}" data-holding-id="${holding.id}" data-dividend-field="frequency"><option value="monthly" ${dividend.frequency === "monthly" ? "selected" : ""}>Monthly</option><option value="quarterly" ${dividend.frequency === "quarterly" ? "selected" : ""}>Quarterly</option><option value="semi-annual" ${dividend.frequency === "semi-annual" ? "selected" : ""}>Semi-annual</option><option value="annual" ${dividend.frequency === "annual" ? "selected" : ""}>Annual</option></select></label></td></tr>`;
}
async function refreshHoldings() {
  const rows = document.querySelector("#holdingsRows");
  if (!holdings.length) {
    rows.innerHTML = '<tr><td colspan="12" class="scanner-empty">No holdings added yet.</td></tr>';
    renderHoldingsPerformance([]);
    return;
  }
  rows.innerHTML = '<tr><td colspan="12" class="scanner-empty">Loading live prices…</td></tr>';
  const results = await Promise.all(holdings.map(async (holding) => {
    try {
      const response = await fetch(`/api/time-series?symbol=${encodeURIComponent(holding.symbol)}&outputsize=1261&interval=1day`);
      const payload = await response.json();
      if (!response.ok || !payload.prices?.length) throw new Error(payload.error || "No price data");
      return { holding, market: payload };
    } catch (error) {
      return { holding, error: error.message };
    }
  }));
  rows.innerHTML = results.map(({ holding, market, error }) => error
    ? `<tr><td><strong>${holding.symbol}</strong></td><td colspan="10" class="negative">${error}</td><td><button class="remove-holding" data-id="${holding.id}" type="button">Remove</button></td></tr>`
    : renderHoldingRow(holding, market, currentHoldingAccountId)).join("");
  renderHoldingsPerformance(results);
  rows.querySelectorAll(".remove-holding").forEach((button) => button.addEventListener("click", () => {
    holdings = holdings.filter((holding) => holding.id !== button.dataset.id);
    saveHoldings();
    refreshHoldings();
  }));
}
function chooseSymbol(result) {
  state.symbol = result.symbol;
  state.exchange = result.exchange;
  stockNames[result.symbol] = result.name;
  const input = document.querySelector("#symbolInput");
  input.value = result.display_symbol;
  closeSymbolSuggestions();
  state.timeframe = document.querySelector("#chartTimeframeSelect").value;
  render();
  showToast(`Analyzing ${result.display_symbol}.`);
}
function renderSymbolSuggestions(results) {
  symbolSearchResults = results.filter((result) => supportedExchanges.has(result.exchange));
  const element = document.querySelector("#symbolSuggestions");
  element.innerHTML = results.length ? results.map((result, index) => `<button type="button" class="symbol-option" data-index="${index}" role="option"><strong>${result.display_symbol}</strong><em>${result.exchange}</em><small>${result.name}${result.type ? ` · ${result.type}` : ""}</small></button>`).join("") : '<div class="symbol-option"><small>No matching symbols found.</small></div>';
  element.classList.add("show");
  element.querySelectorAll("[data-index]").forEach((option) => option.addEventListener("click", () => chooseSymbol(symbolSearchResults[Number(option.dataset.index)])));
}
function renderHoldingSuggestions(results) {
  holdingSearchResults = results.filter((result) => supportedExchanges.has(result.exchange));
  const element = document.querySelector("#holdingSymbolSuggestions");
  element.innerHTML = holdingSearchResults.length ? holdingSearchResults.map((result, index) => `<button type="button" class="symbol-option" data-index="${index}" role="option"><strong>${result.display_symbol}</strong><em>${result.exchange}</em><small>${result.name}${result.type ? ` · ${result.type}` : ""}</small></button>`).join("") : '<div class="symbol-option"><small>No matching symbols found.</small></div>';
  element.classList.add("show");
  element.querySelectorAll("[data-index]").forEach((option) => option.addEventListener("click", () => {
    document.querySelector("#holdingSymbol").value = holdingSearchResults[Number(option.dataset.index)].symbol;
    element.classList.remove("show");
  }));
}
async function searchHoldingSymbols(term) {
  if (!term.trim()) {
    document.querySelector("#holdingSymbolSuggestions").classList.remove("show");
    return;
  }
  try {
    const response = await fetch(`/api/symbol-search?symbol=${encodeURIComponent(term.trim())}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Symbol search failed");
    renderHoldingSuggestions(payload.results || []);
  } catch (error) {
    document.querySelector("#holdingSymbolSuggestions").classList.remove("show");
    setHoldingsStatus(error.message);
  }
}
async function searchSymbols(term) {
  if (!term.trim()) {
    closeSymbolSuggestions();
    return;
  }
  try {
    const response = await fetch(`/api/symbol-search?symbol=${encodeURIComponent(term.trim())}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Symbol search failed");
    renderSymbolSuggestions(payload.results || []);
  } catch (error) {
    closeSymbolSuggestions();
    showToast(error.message);
  }
}
function scanIntraday() {
  const symbols = [...new Set([...universes.NASDAQ.slice(0, 20), ...universes.NYSE.slice(0, 15), ...universes.TSX.slice(0, 15)])];
  const setups = symbols.map((symbol) => {
    const random = seededNumber([...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0) + 71);
    const price = 35 + random() * 440;
    const trend = random() > 0.36;
    const momentum = random() > 0.38;
    const direction = trend && momentum ? "BUY WATCH" : "NO TRADE";
    const changePercent = (random() - 0.42) * 5;
    const entryLow = price * (0.992 - random() * 0.004);
    const entryHigh = price * (0.998 - random() * 0.002);
    const targetPercent = 2 + random() * 3;
    const targetLow = entryHigh * (1 + targetPercent / 100);
    const targetHigh = entryHigh * (1 + Math.min(5, targetPercent + 0.8) / 100);
    const stop = entryLow * 0.975;
    return { symbol, direction, price, changePercent, changeDollar: price * changePercent / 100, entryLow, entryHigh, stop, targetLow, targetHigh, ratio: ((targetLow - entryHigh) / (entryHigh - stop)), agreement: trend && momentum };
  }).filter((setup) => setup.direction === "BUY WATCH").sort((a, b) => b.ratio - a.ratio).slice(0, 8);
  document.querySelector("#intradayRows").innerHTML = setups.length ? setups.map((setup) => `<div class="scanner-row intraday-row"><strong>${setup.symbol}</strong><span>$${setup.price.toFixed(2)}</span><span class="${setup.changePercent >= 0 ? "positive" : "negative"}">${setup.changePercent >= 0 ? "+" : ""}$${setup.changeDollar.toFixed(2)} (${setup.changePercent >= 0 ? "+" : ""}${setup.changePercent.toFixed(2)}%)</span><b class="state-positive">${setup.direction}</b><span>$${setup.entryLow.toFixed(2)}–$${setup.entryHigh.toFixed(2)}</span><span class="negative">$${setup.stop.toFixed(2)}</span><span class="positive">$${setup.targetLow.toFixed(2)}–$${setup.targetHigh.toFixed(2)}</span><b>${setup.ratio.toFixed(1)}:1</b></div>`).join("") : '<div class="scanner-empty">No aligned setups found. No trade is a valid result.</div>';
  document.querySelector("#intradaySource").textContent = "1-week trend + momentum confirmation · demo swing feed";
  showToast(`Found ${setups.length} weekly buy setups.`);
}
function seededNumber(seed) { let value = seed; return () => { value = (value * 9301 + 49297) % 233280; return value / 233280; }; }
function generatePrices(symbol, timeframe) { const count = timeframe === "1D" ? 78 : timeframe === "1W" ? 10 : timeframe === "1M" ? 31 : timeframe === "5Y" ? 1260 : 252; const random = seededNumber([...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0)); let price = 145 + (symbol.charCodeAt(0) % 50); return Array.from({ length: count }, (_, index) => { const trend = 0.0007 + Math.sin(index / 34) * 0.001; const open = price; price *= 1 + trend + (random() - 0.47) * 0.035; const close = Math.max(20, price); const high = Math.max(open, close) * (1 + random() * 0.012); const low = Math.min(open, close) * (1 - random() * 0.012); return { open, high, low, close, volume: 8e6 + random() * 7e6 }; }); }
const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
function sma(values, period) { return values.length < period ? average(values) : average(values.slice(-period)); }
function ema(values, period) { const multiplier = 2 / (period + 1); return values.reduce((result, value, index) => index === 0 ? [value] : [...result, value * multiplier + result[index - 1] * (1 - multiplier)], [])[values.length - 1]; }
function rsi(values, period = 14) { const changes = values.slice(1).map((value, index) => value - values[index]); const gains = changes.slice(-period).filter((change) => change > 0); const losses = changes.slice(-period).filter((change) => change < 0).map(Math.abs); if (!losses.length) return 70; return 100 - 100 / (1 + average(gains) / average(losses)); }
function calculateIndicators(prices) { const closes = prices.map((point) => point.close); const volumes = prices.map((point) => point.volume || 0); const current = closes.at(-1); const sma20 = sma(closes, 20); const sma50 = sma(closes, 50); const macd = ema(closes, 12) - ema(closes, 26); const rsiValue = rsi(closes); const volatility = Math.sqrt(average(closes.slice(-20).map((value) => ((value - sma20) / sma20) ** 2))) * 100; const averageVolume = average(volumes.slice(-21, -1)); const currentVolume = volumes.at(-1); const volumeRatio = averageVolume ? currentVolume / averageVolume : 1; const volume = volumeRatio >= 1.2 ? "Confirmed" : volumeRatio <= 0.8 ? "Weak" : "Neutral"; const trend = current > sma20 && sma20 > sma50 ? "Bullish" : current < sma20 && sma20 < sma50 ? "Bearish" : "Neutral"; const momentum = rsiValue > 55 && macd > 0 ? "Bullish" : rsiValue < 45 && macd < 0 ? "Bearish" : "Neutral"; const volumeAdjustment = volume === "Confirmed" ? (current >= sma20 ? 8 : -8) : volume === "Weak" ? (current >= sma20 ? -4 : 4) : 0; const score = Math.max(20, Math.min(92, Math.round(50 + (current > sma20 ? 12 : -12) + (current > sma50 ? 10 : -10) + (rsiValue - 50) * 0.35 + (macd > 0 ? 8 : -8) + volumeAdjustment))); return { current, previous: closes.at(-2), sma20, sma50, macd, rsi: rsiValue, volatility, averageVolume, currentVolume, volumeRatio, volume, trend, momentum, score }; }
function formatMoney(value) { return `$${value.toFixed(2)}`; }
function renderTargets() {
  const { current, score, volatility } = state.indicators;
  const { oneYearLow: oneYearLowPercent, oneYearHigh: oneYearHighPercent, fiveYearLow: fiveYearLowPercent, fiveYearHigh: fiveYearHighPercent } = getModelReturns(current, score);
  const oneYearLow = current * (1 + oneYearLowPercent / 100);
  const oneYearHigh = current * (1 + oneYearHighPercent / 100);
  const fiveYearLow = current * (1 + fiveYearLowPercent / 100);
  const fiveYearHigh = current * (1 + fiveYearHighPercent / 100);
  const targetText = (low, high) => `${formatMoney(low)}–${formatMoney(high)}`;
  document.querySelector("#oneYearTarget").textContent = targetText(oneYearLow, oneYearHigh);
  document.querySelector("#fiveYearTarget").textContent = targetText(fiveYearLow, fiveYearHigh);
  document.querySelector("#oneYearReturn").textContent = `+${((oneYearLow / current - 1) * 100).toFixed(1)}% to +${((oneYearHigh / current - 1) * 100).toFixed(1)}%`;
  document.querySelector("#fiveYearReturn").textContent = `+${((fiveYearLow / current - 1) * 100).toFixed(1)}% to +${((fiveYearHigh / current - 1) * 100).toFixed(1)}% · ${volatility.toFixed(1)}% vol`;
}
function showToast(message) { const toast = document.querySelector("#toast"); toast.textContent = message; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 2600); }
function renderHorizonRows(id, rows) {
  const element = document.querySelector(`#${id}`);
  element.innerHTML = rows.length ? rows.map((row, index) => {
    const expected = row.horizon.expected_return;
    const changeDollar = row.price * row.change_percent / (100 + row.change_percent);
    return `<div class="scanner-row horizon-row"><span class="rank">${index + 1}</span><strong>${row.symbol}</strong><span>${exchangeBySymbol[row.symbol] || "Other"}</span><span>$${row.price.toFixed(2)}</span><span class="${row.change_percent >= 0 ? "positive" : "negative"}">${changeDollar >= 0 ? "+" : ""}$${changeDollar.toFixed(2)} (${row.change_percent >= 0 ? "+" : ""}${row.change_percent.toFixed(2)}%)</span><span>${expected >= 0 ? "+" : ""}${expected.toFixed(1)}%</span><span>$${row.horizon.stop_loss.toFixed(2)}</span><span>$${row.horizon.target.toFixed(2)}</span><span>${row.horizon.score.toFixed(0)}</span></div>`;
  }).join("") : '<div class="scanner-empty">No live candidates returned.</div>';
}
async function scanAllHorizons() {
  const refreshButton = document.querySelector("#liveScanButton");
  if (refreshButton.disabled) return;
  refreshButton.disabled = true;
  refreshButton.classList.add("is-loading");
  const symbols = [...new Set(Object.values(universes).flat())].join(",");
  document.querySelector("#horizonSource").textContent = "Scanning live Twelve Data candles…";
  try {
    const response = await fetch(`/api/scan?symbols=${encodeURIComponent(symbols)}`);
    const payload = await response.json();
    if (!response.ok) {
      document.querySelector("#horizonSource").textContent = "Live scan unavailable";
      showToast(payload.error || "Live scan failed.");
      return;
    }
    for (const [key, label] of [["week", "weeklyRows"], ["month", "monthlyRows"], ["year", "yearlyRows"]]) {
      const ranked = payload.rows.filter((row) => row.regime === "Constructive" && row.horizons[key].expected_return > 0 && row.horizons[key].score >= 90).sort((a, b) => b.horizons[key].score - a.horizons[key].score).slice(0, 10).map((row) => ({ ...row, horizon: row.horizons[key] }));
      renderHorizonRows(label, ranked);
    }
    document.querySelector("#horizonSource").textContent = `Live Twelve Data · ${payload.rows.length} symbols · ${payload.cached ? "cached" : "refreshed"} · ${payload.errors.length} unavailable`;
    showToast(`Showing score-90+ candidates across ${payload.rows.length} live symbols.`);
  } catch (error) {
    document.querySelector("#horizonSource").textContent = "Live scan unavailable";
    showToast("Live scan failed. Check the server connection and try again.");
  } finally {
    refreshButton.disabled = false;
    refreshButton.classList.remove("is-loading");
  }
}
function scanExchange(exchange = selectedExchange) {
  selectedExchange = exchange;
  const rows = [...new Set(universes[exchange])].map((symbol, index) => {
    const random = seededNumber([...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0));
    const volume = 1 + random() * 99;
    const changePercent = (random() - 0.42) * 5;
    const score = Math.round(35 + random() * 55);
    const signal = score >= 68 ? "BUY WATCH" : score <= 44 ? "SELL WATCH" : "HOLD";
    const price = 40 + random() * 460;
    return { symbol, volume, score, signal, price, changePercent, changeDollar: price * changePercent / 100 };
  }).filter((row) => row.signal === "BUY WATCH").sort((a, b) => b.volume - a.volume).slice(0, 10);
  document.querySelector("#scannerRows").innerHTML = rows.map((row, index) => `<div class="scanner-row"><span class="rank">${index + 1}</span><strong>${row.symbol}</strong><span>$${row.price.toFixed(2)}</span><span class="${row.changePercent >= 0 ? "positive" : "negative"}">${row.changePercent >= 0 ? "+" : ""}$${row.changeDollar.toFixed(2)} (${row.changePercent >= 0 ? "+" : ""}${row.changePercent.toFixed(2)}%)</span><span>${row.volume.toFixed(1)}M</span><b class="state-positive">${row.signal}</b></div>`).join("");
  document.querySelector("#scanSource").textContent = `${exchange} · top 10 volume · demo market-cap universe`;
  document.querySelectorAll(".scanner-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.exchange === exchange));
}
function getMarketStatus() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const minutes = Number(values.hour) * 60 + Number(values.minute);
  const isWeekday = !["Sat", "Sun"].includes(values.weekday);
  return isWeekday && minutes >= 570 && minutes < 960 ? "Open" : "Closed";
}
async function loadPrices() {
  const settings = { "1D": [78, "5min"], "1W": [10, "1day"], "1M": [31, "1day"], "1Y": [252, "1day"], "5Y": [1260, "1day"] };
  const [outputsize, interval] = settings[state.timeframe];
  try {
    const response = await fetch(`/api/time-series?symbol=${encodeURIComponent(state.symbol)}&outputsize=${outputsize}&interval=${interval}`);
    if (!response.ok) throw new Error((await response.json()).error || "Provider request failed");
    const payload = await response.json();
    state.prices = payload.prices;
    state.source = payload.source;
  } catch (error) {
    state.prices = generatePrices(state.symbol, state.timeframe);
    state.source = "Demo fallback";
    showToast(`Live data unavailable: ${error.message}. Showing demo data.`);
  }
}
function renderIndicators() { const i = state.indicators; const rows = [["RSI (14)", "Momentum oscillator", i.rsi.toFixed(1), i.rsi > 55 ? "Bullish" : i.rsi < 45 ? "Bearish" : "Neutral"], ["SMA (20)", "Short-term trend", formatMoney(i.sma20), i.current > i.sma20 ? "Bullish" : "Bearish"], ["SMA (50)", "Medium-term trend", formatMoney(i.sma50), i.current > i.sma50 ? "Bullish" : "Bearish"], ["MACD", "Trend momentum", i.macd.toFixed(2), i.macd > 0 ? "Bullish" : "Bearish"], ["Volatility", "20-day standard deviation", `${i.volatility.toFixed(2)}%`, i.volatility < 3 ? "Low" : "Elevated"], ["Volume confirmation", "Current vs prior 20-day average", `${i.volumeRatio.toFixed(2)}x avg`, i.volume]]; document.querySelector("#indicatorList").innerHTML = rows.map(([name, description, value, status]) => `<div class="indicator"><div><strong>${name}</strong><small>${description}</small></div><span class="indicator-value">${value}</span><span class="indicator-state ${status === "Bullish" || status === "Low" || status === "Confirmed" ? "state-positive" : status === "Neutral" ? "state-neutral" : "negative"}">${status}</span></div>`).join(""); }
function drawChart() { const canvas = document.querySelector("#priceChart"); const rect = canvas.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1; canvas.width = rect.width * ratio; canvas.height = rect.height * ratio; const context = canvas.getContext("2d"); context.scale(ratio, ratio); const width = rect.width; const height = rect.height; const points = state.prices.map((point) => point.close); const sma20Points = points.map((_, index) => sma(points.slice(0, index + 1), 20)); const sma50Points = points.map((_, index) => sma(points.slice(0, index + 1), 50)); const sma200Points = points.map((_, index) => sma(points.slice(0, index + 1), 200)); const min = Math.min(...state.prices.map((point) => point.low), ...sma20Points, ...sma50Points, ...sma200Points) * .98; const max = Math.max(...state.prices.map((point) => point.high), ...sma20Points, ...sma50Points, ...sma200Points) * 1.02; const toY = (value) => height - (value - min) / (max - min) * height; const toX = (index) => index * width / Math.max(1, points.length - 1); context.strokeStyle = "#242424"; context.lineWidth = 1; for (let line = 1; line < 5; line++) { const y = line * height / 5; context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); } const candleWidth = Math.max(2, Math.min(10, width / points.length * .65)); state.prices.forEach((candle, index) => { const x = toX(index); const bullish = candle.close >= candle.open; const color = bullish ? "#26a978" : "#d76b65"; context.strokeStyle = color; context.fillStyle = color; context.lineWidth = 1; context.beginPath(); context.moveTo(x, toY(candle.high)); context.lineTo(x, toY(candle.low)); context.stroke(); const top = Math.min(toY(candle.open), toY(candle.close)); const bodyHeight = Math.max(1, Math.abs(toY(candle.open) - toY(candle.close))); context.fillRect(x - candleWidth / 2, top, candleWidth, bodyHeight); }); const drawAverage = (values, color) => { context.beginPath(); context.strokeStyle = color; context.lineWidth = 1.5; context.setLineDash([5, 5]); values.forEach((value, index) => { const x = toX(index); const y = toY(value); index ? context.lineTo(x, y) : context.moveTo(x, y); }); context.stroke(); context.setLineDash([]); }; drawAverage(sma20Points, "#b9c9c1"); drawAverage(sma50Points, "#e0a458"); drawAverage(sma200Points, "#b56bd7"); }
async function render() { await loadPrices(); state.indicators = calculateIndicators(state.prices); const i = state.indicators; const change = (i.current / i.previous - 1) * 100; const dailyChange = document.querySelector("#dailyChange"); const marketStatus = getMarketStatus(); const marketStatusElement = document.querySelector("#marketStatus"); document.querySelector("#tickerSymbol").textContent = state.symbol; document.querySelector("#stockName").textContent = stockNames[state.symbol] || "Company name unavailable"; document.querySelector("#tickerExchange").textContent = state.exchange; document.querySelector("#currentPrice").textContent = formatMoney(i.current); dailyChange.textContent = `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`; dailyChange.classList.toggle("positive", change >= 0); dailyChange.classList.toggle("negative", change < 0); marketStatusElement.innerHTML = `<i class="live-dot"></i> ${marketStatus}`; marketStatusElement.classList.toggle("closed-status", marketStatus === "Closed"); const statusDot = marketStatusElement.querySelector(".live-dot"); statusDot.classList.toggle("closed-dot", marketStatus === "Closed"); statusDot.style.backgroundColor = marketStatus === "Closed" ? "var(--red)" : "var(--green)"; statusDot.style.boxShadow = marketStatus === "Closed" ? "0 0 0 4px #fbeceb" : "0 0 0 4px var(--mint)"; document.querySelector("#updatedAt").textContent = `${state.source} · just now`; const labels = { "1D": "1 day · 5-minute", "1W": "1 week · daily", "1M": "1 month · daily", "1Y": "1 year · daily", "5Y": "5 years · daily" }; document.querySelector("#chartRange").textContent = labels[state.timeframe]; document.querySelector("#scoreValue").textContent = i.score; document.querySelector("#scoreLabel").textContent = i.score > 70 ? "Strongly bullish" : i.score > 55 ? "Moderately bullish" : i.score < 45 ? "Bearish" : "Neutral"; document.querySelector("#signalText").textContent = i.score > 62 ? "BUY WATCH" : i.score < 42 ? "SELL WATCH" : "HOLD"; document.querySelector("#trendSignal").textContent = i.trend; document.querySelector("#momentumSignal").textContent = i.momentum; document.querySelector("#volumeSignal").textContent = i.volume; document.querySelector("#volatilitySignal").textContent = i.volatility < 3 ? "Low" : "Elevated"; document.querySelector("#signalBar").style.width = `${i.score}%`; document.querySelector("#scoreRing").style.background = `radial-gradient(var(--navy) 62%,transparent 63%),conic-gradient(#57d9a3 0 ${i.score}%,#35524d ${i.score}%)`; document.querySelector("#indicatorAsOf").textContent = `As of ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`; renderIndicators(); renderTargets(); requestAnimationFrame(drawChart); }
function runBacktest() { const capital = Number(document.querySelector("#capitalInput").value) || 10000; const threshold = Number(document.querySelector("#thresholdInput").value); const prices = state.prices.map((point) => point.close); let equity = capital; let peak = capital; let maxDrawdown = 0; let wins = 0; let trades = 0; let entry = null; prices.forEach((price, index) => { const window = prices.slice(Math.max(0, index - 50), index + 1); const fast = sma(window, 20); const slow = sma(window, 50); const score = 50 + (price > fast ? 16 : -16) + (price > slow ? 12 : -12); if (!entry && score >= threshold) entry = price; if (entry && (score < 45 || index === prices.length - 1)) { const result = (price / entry - 1) * equity * 0.98; equity += result; if (result > 0) wins++; trades++; entry = null; } peak = Math.max(peak, equity); maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak); }); const returnPercent = (equity / capital - 1) * 100; document.querySelector("#netReturn").textContent = `${returnPercent >= 0 ? "+" : ""}${returnPercent.toFixed(2)}%`; document.querySelector("#netReturn").className = returnPercent >= 0 ? "positive" : "negative"; document.querySelector("#finalEquity").textContent = formatMoney(equity); document.querySelector("#winRate").textContent = `${trades ? (wins / trades * 100).toFixed(1) : "0.0"}%`; document.querySelector("#drawdown").textContent = `-${(maxDrawdown * 100).toFixed(2)}%`; document.querySelector("#tradeCount").textContent = trades; document.querySelector("#backtestResults").classList.remove("hidden"); showToast(`Backtest complete · ${trades} simulated trades`); }
async function runHistoricalBacktest() {
  const periods = {
    dotcom: ["1999-10-01", "2002-12-31"],
    gfc: ["2007-10-01", "2009-12-31"],
    recovery: ["2009-10-01", "2012-12-31"],
    modern: ["2014-10-01", new Date().toISOString().slice(0, 10)]
  };
  const periodKey = document.querySelector("#backtestPeriod").value;
  if (periodKey === "loaded") return runBacktest();
  const [startDate, endDate] = periods[periodKey];
  const response = await fetch(`/api/time-series?symbol=${encodeURIComponent(state.symbol)}&start_date=${startDate}&end_date=${endDate}&outputsize=5000`);
  if (!response.ok) {
    const payload = await response.json();
    showToast(`Historical backtest unavailable: ${payload.error || "provider request failed"}`);
    return;
  }
  const payload = await response.json();
  const prices = payload.prices.filter((point) => point.date >= startDate);
  if (prices.length < 60) {
    showToast("Not enough historical data for this period.");
    return;
  }
  const capital = Number(document.querySelector("#capitalInput").value) || 10000;
  const threshold = Number(document.querySelector("#thresholdInput").value);
  let equity = capital;
  let peak = capital;
  let maxDrawdown = 0;
  let wins = 0;
  let trades = 0;
  let entry = null;
  prices.forEach((point, index) => {
    const values = prices.slice(Math.max(0, index - 50), index + 1).map((item) => item.close);
    const fast = sma(values, 20);
    const slow = sma(values, 50);
    const score = 50 + (point.close > fast ? 16 : -16) + (point.close > slow ? 12 : -12);
    if (!entry && score >= threshold) entry = point.close;
    if (entry && (score < 45 || index === prices.length - 1)) {
      const result = (point.close / entry - 1) * equity * 0.98;
      equity += result;
      if (result > 0) wins++;
      trades++;
      entry = null;
    }
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak);
  });
  const returnPercent = (equity / capital - 1) * 100;
  document.querySelector("#netReturn").textContent = `${returnPercent >= 0 ? "+" : ""}${returnPercent.toFixed(2)}%`;
  document.querySelector("#netReturn").className = returnPercent >= 0 ? "positive" : "negative";
  document.querySelector("#finalEquity").textContent = formatMoney(equity);
  document.querySelector("#winRate").textContent = `${trades ? (wins / trades * 100).toFixed(1) : "0.0"}%`;
  document.querySelector("#drawdown").textContent = `-${(maxDrawdown * 100).toFixed(2)}%`;
  document.querySelector("#tradeCount").textContent = trades;
  document.querySelector("#backtestResults").classList.remove("hidden");
  showToast(`Historical backtest complete · ${state.symbol} · ${trades} trades`);
}
document.querySelector("#analyzeButton").addEventListener("click", () => { const value = document.querySelector("#symbolInput").value.trim().toUpperCase().replace(".", ":"); if (!isValidSymbol(value)) return showToast("Enter a valid ticker symbol, such as AAPL, CM:NYSE, or CM:TSX."); state.symbol = value; state.timeframe = document.querySelector("#chartTimeframeSelect").value; state.exchange = value.includes(":") ? value.split(":")[1] : exchangeBySymbol[value] || "NASDAQ"; render(); showToast(`Loaded market data for ${value}.`); });
document.querySelector("#symbolInput").addEventListener("input", (event) => { clearTimeout(symbolSearchTimer); symbolSearchTimer = setTimeout(() => searchSymbols(event.target.value), 250); });
document.querySelector("#symbolInput").addEventListener("keydown", (event) => { if (event.key === "Escape") closeSymbolSuggestions(); if (event.key === "Enter" && symbolSearchResults[0]) { event.preventDefault(); chooseSymbol(symbolSearchResults[0]); } });
document.addEventListener("click", (event) => { if (!event.target.closest(".search-wrap")) closeSymbolSuggestions(); });
document.querySelector("#chartTimeframeSelect").addEventListener("change", (event) => { state.timeframe = event.target.value; render(); }); document.querySelector("#liveScanButton").addEventListener("click", scanAllHorizons); document.querySelector("#runBacktestButton").addEventListener("click", runHistoricalBacktest); document.querySelector("#thresholdInput").addEventListener("input", (event) => { document.querySelector("#thresholdOutput").value = event.target.value; }); document.querySelector("#detailsButton").addEventListener("click", () => showToast("Model details: SMA trend, RSI momentum, MACD crossover, and volatility filter.")); document.querySelector("#addTradeButton").addEventListener("click", () => showToast("Trade logging will be connected to the portfolio ledger next.")); window.addEventListener("resize", drawChart); render();
document.querySelectorAll(".top-tab").forEach((tab) => tab.addEventListener("click", () => {
  document.querySelectorAll(".top-tab").forEach((item) => item.classList.toggle("active", item === tab));
  document.querySelector("#dashboardView").hidden = tab.dataset.view !== "dashboardView";
  document.querySelector("#holdingsView").hidden = tab.dataset.view !== "holdingsView";
  if (tab.dataset.view === "holdingsView") {
    renderPortfolioSections();
    refreshPortfolioOverview();
  }
}));
renderHoldingAccounts();
initializeAuth();
(async () => {
  await initializeHoldings();
})();
document.querySelector("#refreshPricesButton")?.addEventListener("click", refreshAllPrices);
document.querySelector("#newHoldingAccountButton")?.addEventListener("click", createHoldingAccount);
document.querySelector("#authButton")?.addEventListener("click", openAuthPanel);
document.querySelector("#authClose")?.addEventListener("click", closeAuthPanel);
document.querySelector("#authMode")?.addEventListener("click", () => setAuthMode(!authRegisterMode));
document.querySelector("#authForm")?.addEventListener("submit", authenticate);
document.querySelector("#cancelDeletePortfolio")?.addEventListener("click", closeDeletePortfolioDialog);
document.querySelector("#confirmDeletePortfolio")?.addEventListener("click", confirmDeleteHoldingAccount);
window.addEventListener("resize", drawChart); render();

// CSV/Excel Import Functions
async function parseCSVFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;
      const lines = content.split('\n');
      
      if (lines.length < 2) {
        reject(new Error("CSV file must have headers and at least one data row"));
        return;
      }
      
      // Helper to parse CSV line respecting quoted fields
      function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim().replace(/^"|"$/g, ''));
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim().replace(/^"|"$/g, ''));
        return result;
      }
      
      // Try to find the actual header row
      // Look for a row containing "Symbol" or "Asset type" (common headers)
      let headerRowIdx = 0;
      for (let i = 0; i < Math.min(lines.length, 50); i++) {
        const lowerLine = lines[i].toLowerCase();
        if (lowerLine.includes('symbol') || lowerLine.includes('ticker') || 
            lowerLine.includes('asset type')) {
          headerRowIdx = i;
          break;
        }
      }
      
      // Parse header row (case-insensitive)
      const headerLine = lines[headerRowIdx];
      const headers = parseCSVLine(headerLine).map(h => h.toLowerCase());
      
      const symbolColIdx = headers.findIndex(h => h.includes('symbol') || h.includes('ticker'));
      const exchangeColIdx = headers.findIndex(h => h.includes('market') || h.includes('exchange'));
      const currencyColIdx = headers.findIndex(h => h.includes('currency') && h.includes('held'));
      const quantityColIdx = headers.findIndex(h => h.includes('quantity') || h.includes('qty') || h.includes('shares'));
      const priceColIdx = headers.findIndex(h => {
        const lower = h.toLowerCase();
        // More specific: look for "Average" for average cost, or pure "Cost"
        if (lower.includes('average') && lower.includes('cost')) return true;
        if (lower === 'cost' || lower === 'average cost') return true;
        return false;
      });
      
      if (symbolColIdx === -1 || quantityColIdx === -1 || priceColIdx === -1) {
        reject(new Error(`CSV must have Symbol/Ticker, Quantity/QTY, and Average Cost/Price columns. Found: ${headers.join(', ')}`));
        return;
      }
      
      // Parse data rows (starting from row after headers)
      const holdings = [];
      for (let i = headerRowIdx + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = parseCSVLine(line);
        if (values.length < 3) continue;
        
        const symbol = values[symbolColIdx]?.toUpperCase() || '';
        let exchange = values[exchangeColIdx]?.toUpperCase() || '';
        // Fallback to currency column if market not found
        if (!exchange && currencyColIdx !== -1) {
          exchange = values[currencyColIdx]?.toUpperCase() || '';
        }
        const quantity = parseFloat(values[quantityColIdx]) || 0;
        const bookPrice = parseFloat(values[priceColIdx]) || 0;
        
        if (!symbol || quantity <= 0 || bookPrice <= 0) continue;
        
        // Map exchange to format (CDN->TSX, US->NAS by default)
        let mappedSymbol = symbol;
        if (symbol.includes('.') || symbol.includes(':')) {
          mappedSymbol = symbol.replace('.', ':');
        } else if (exchange) {
          const exchangeMap = {
            'CDN': 'TSX', 'TORONTO': 'TSX', 'TSX': 'TSX',
            'US': 'NAS', 'NASDAQ': 'NAS', 'NYSE': 'NYS'
          };
          const mapped = exchangeMap[exchange] || (exchange.startsWith('CDN') ? 'TSX' : 'NAS');
          mappedSymbol = `${symbol}:${mapped}`;
        } else {
          mappedSymbol = `${symbol}:NAS`;
        }
        
        holdings.push({ symbol: mappedSymbol, quantity, bookPrice });
      }
      
      resolve(holdings);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

async function parseXLSXFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        // Use SheetJS to parse Excel file
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          reject(new Error("Excel file is empty"));
          return;
        }
        
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        if (!jsonData || jsonData.length === 0) {
          reject(new Error("Excel sheet has no data rows"));
          return;
        }
        
        // Find column indices (case-insensitive)
        const firstRow = jsonData[0];
        const keys = Object.keys(firstRow);
        
        const symbolKey = keys.find(k => k.toLowerCase().includes('symbol') || k.toLowerCase().includes('ticker'));
        const exchangeKey = keys.find(k => k.toLowerCase().includes('exchange') || k.toLowerCase().includes('market'));
        const quantityKey = keys.find(k => k.toLowerCase().includes('quantity') || k.toLowerCase().includes('qty') || k.toLowerCase().includes('shares'));
        const priceKey = keys.find(k => k.toLowerCase().includes('price') || k.toLowerCase().includes('cost') || k.toLowerCase().includes('average') || k.toLowerCase().includes('book'));
        
        if (!symbolKey || !quantityKey || !priceKey) {
          reject(new Error("Excel must have Symbol/Ticker, Quantity/QTY/Shares, and Average Cost/Price/Book Price columns"));
          return;
        }
        
        // Parse data rows
        const holdings = [];
        for (const row of jsonData) {
          const symbol = String(row[symbolKey] || '').toUpperCase().trim();
          const exchange = String(row[exchangeKey] || '').toUpperCase().trim();
          const quantity = parseFloat(row[quantityKey]) || 0;
          const bookPrice = parseFloat(row[priceKey]) || 0;
          
          if (!symbol || quantity <= 0 || bookPrice <= 0) continue;
          
          // Map exchange to format (CDN->TSX, US->NAS by default)
          let mappedSymbol = symbol;
          if (symbol.includes('.') || symbol.includes(':')) {
            mappedSymbol = symbol.replace('.', ':');
          } else if (exchange) {
            const exchangeMap = {
              'CDN': 'TSX', 'TORONTO': 'TSX', 'TSX': 'TSX',
              'US': 'NAS', 'NASDAQ': 'NAS', 'NYSE': 'NYS'
            };
            const mapped = exchangeMap[exchange] || (exchange.startsWith('CDN') ? 'TSX' : 'NAS');
            mappedSymbol = `${symbol}:${mapped}`;
          } else {
            mappedSymbol = `${symbol}:NAS`;
          }
          
          holdings.push({ symbol: mappedSymbol, quantity, bookPrice });
        }
        
        resolve(holdings);
      } catch (error) {
        reject(new Error(`Failed to parse Excel file: ${error.message}`));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

async function showImportPreview(holdings) {
  const previewPanel = document.querySelector("#importPreviewPanel");
  const previewContent = document.querySelector("#importPreviewContent");
  
  if (!previewPanel || !previewContent) {
    throw new Error("Import preview panel not found in HTML");
  }
  
  // Create preview table
  let html = '<table style="width: 100%; border-collapse: collapse; font-size: 12px;">';
  html += '<thead><tr style="border-bottom: 1px solid var(--line);"><th style="text-align: left; padding: 8px;">Symbol</th><th style="text-align: right; padding: 8px;">Quantity</th><th style="text-align: right; padding: 8px;">Avg Cost</th><th style="text-align: right; padding: 8px;">Value</th></tr></thead>';
  html += '<tbody>';
  
  let totalValue = 0;
  holdings.forEach(h => {
    const value = h.quantity * h.bookPrice;
    totalValue += value;
    html += `<tr style="border-bottom: 1px solid var(--line);"><td style="text-align: left; padding: 8px;">${h.symbol}</td><td style="text-align: right; padding: 8px;">${h.quantity}</td><td style="text-align: right; padding: 8px;">$${h.bookPrice.toFixed(2)}</td><td style="text-align: right; padding: 8px;">$${value.toFixed(2)}</td></tr>`;
  });
  
  html += '</tbody></table>';
  html += `<div style="margin-top: 16px; padding: 12px; background: var(--paper); border-radius: 6px;"><strong>Total Investment:</strong> $${totalValue.toFixed(2)}<br><strong>Holdings Count:</strong> ${holdings.length}</div>`;
  
  previewContent.innerHTML = html;
  previewPanel.classList.remove("hidden");
  // Force layout recalculation to ensure centering CSS applies
  void previewPanel.offsetHeight;
  
  return new Promise((resolve, reject) => {
    const confirmBtn = document.querySelector("#importConfirmButton");
    const cancelBtn = document.querySelector("#importCancelButton");
    const closeBtn = document.querySelector("#importPreviewClose");
    
    if (!confirmBtn || !cancelBtn || !closeBtn) {
      console.error("Import buttons not found", { confirmBtn, cancelBtn, closeBtn });
      reject(new Error("Import buttons not found in HTML"));
      return;
    }
    
    let resolved = false;
    
    const cleanup = () => {
      if (resolved) return;
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      closeBtn.removeEventListener("click", onCancel);
    };
    
    const onConfirm = async () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      previewPanel.classList.add("hidden");
      resolve();
    };
    
    const onCancel = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      previewPanel.classList.add("hidden");
      reject(new Error("Import cancelled by user"));
    };
    
    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
    closeBtn.addEventListener("click", onCancel);
  });
}

// File input change handler
async function handleFileImport(event) {
  const file = event.target.files[0];
  console.log("File selected:", file?.name);
  if (!file) return;
  
  try {
    if (isReadOnly()) {
      showToast("Read-only users cannot import holdings");
      event.target.value = '';
      return;
    }
    
    showToast("Processing file...");
    let holdings;
    
    if (file.name.endsWith('.csv')) {
      console.log("Parsing CSV file...");
      holdings = await parseCSVFile(file);
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      console.log("Parsing XLSX file...");
      holdings = await parseXLSXFile(file);
    } else {
      throw new Error("Please upload a CSV or Excel file (.csv, .xlsx, .xls)");
    }
    
    console.log("Parsed holdings:", holdings);
    
    if (holdings.length === 0) {
      showToast("No valid holdings found in file");
      event.target.value = '';
      return;
    }
    
    console.log("Showing import preview...");
    // Show preview
    await showImportPreview(holdings);
    console.log("Preview confirmed, proceeding with import...");
    
    // Generate account name from filename (remove extension)
    let accountName = file.name.replace(/\.[^/.]+$/, "").trim();
    if (!accountName) accountName = "Imported Holdings";
    
    console.log("Creating new account:", accountName);
    
    // Create a new account for these holdings (don't add to existing)
    const newAccountId = "imported-" + Date.now();
    const newAccount = {
      id: newAccountId,
      name: accountName,
      holdings: []
    };
    
    // Add each holding to the new account
    for (const holding of holdings) {
      const id = Math.random().toString(36).substr(2, 9);
      newAccount.holdings.push({
        id,
        symbol: holding.symbol,
        quantity: holding.quantity,
        bookPrice: holding.bookPrice,
        dividendAmount: 0,
        dividendFrequency: "yearly"
      });
    }
    
    // Add new account to holdings accounts
    if (!holdingAccounts) holdingAccounts = [];
    holdingAccounts.push(newAccount);
    currentHoldingAccountId = newAccountId;
    
    console.log("Created new account:", newAccount);
    console.log("All accounts now:", holdingAccounts);
    
    // Switch to the new account
    holdings = newAccount.holdings;
    
    // Save to server only
    console.log("Saving to server...");
    const serverSaveSuccess = await serverSync.saveHoldings(holdingAccounts);
    console.log("Server save result:", serverSaveSuccess);
    
    // Refresh UI
    refreshPortfolioOverview();
    renderPortfolioSections();
    
    showToast(`Successfully imported ${newAccount.holdings.length} holdings to account "${accountName}"!`);
    console.log("Import complete!");
    
  } catch (error) {
    console.error("CSV import error:", error);
    showToast(`Import failed: ${error.message}`);
  }
  
  // Reset file input
  event.target.value = '';
}
