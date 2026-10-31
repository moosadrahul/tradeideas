const state = { symbol: "AAPL", timeframe: "1Y", prices: [], indicators: {}, source: "Demo data", exchange: "NASDAQ" };
const storedHoldings = JSON.parse(localStorage.getItem("trend-analysis-holdings") || "[]");
let holdingAccounts = JSON.parse(localStorage.getItem("trend-analysis-holding-accounts") || "null");
if (!Array.isArray(holdingAccounts) || !holdingAccounts.length) {
  holdingAccounts = [{ id: "default", name: "Main holdings", holdings: Array.isArray(storedHoldings) ? storedHoldings : [] }];
}
const savedDividendSettings = new Map();
holdingAccounts.forEach((account) => account.holdings.forEach((holding) => {
  const hasSavedSettings = holding.dividendAmount !== undefined || holding.amount !== undefined || holding.quarterlyDividend !== undefined;
  if (!hasSavedSettings) return;
  const settings = holding.dividendAmount !== undefined
    ? { amount: holding.dividendAmount || 0, frequency: holding.dividendFrequency || "quarterly" }
    : holding.amount !== undefined
      ? { amount: holding.amount || 0, frequency: holding.frequency || "quarterly" }
      : { amount: holding.quarterlyDividend || 0, frequency: "quarterly" };
  const key = holding.symbol.trim().toUpperCase();
  const previous = savedDividendSettings.get(key);
  if (!previous || settings.amount > previous.amount) savedDividendSettings.set(key, settings);
}));
holdingAccounts.forEach((account) => account.holdings.forEach((holding) => {
  const settings = savedDividendSettings.get(holding.symbol.trim().toUpperCase());
  if (!settings) return;
  holding.dividendAmount = settings.amount;
  holding.dividendFrequency = settings.frequency;
  delete holding.amount;
  delete holding.frequency;
  delete holding.quarterlyDividend;
}));
localStorage.setItem("trend-analysis-holding-accounts", JSON.stringify(holdingAccounts));
let currentHoldingAccountId = localStorage.getItem("trend-analysis-current-holding-account") || holdingAccounts[0].id;
if (!holdingAccounts.some((account) => account.id === currentHoldingAccountId)) currentHoldingAccountId = holdingAccounts[0].id;
let holdings = holdingAccounts.find((account) => account.id === currentHoldingAccountId).holdings;
let signedInUser = null;
let authRegisterMode = false;
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
function formatHoldingMoney(value) { return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
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
  account.holdings = holdings;
  localStorage.setItem("trend-analysis-holdings", JSON.stringify(holdings));
  localStorage.setItem("trend-analysis-holding-accounts", JSON.stringify(holdingAccounts));
  localStorage.setItem("trend-analysis-current-holding-account", currentHoldingAccountId);
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
    const localHoldings = holdingAccounts.reduce((total, account) => total + (account.holdings?.length || 0), 0) || storedHoldings.length;
    if (Array.isArray(payload.portfolio) && serverHoldings > 0) {
      holdingAccounts = payload.portfolio;
      currentHoldingAccountId = holdingAccounts[0]?.id || "default";
      holdings = holdingAccounts[0]?.holdings || [];
      localStorage.setItem("trend-analysis-holding-accounts", JSON.stringify(holdingAccounts));
      renderPortfolioSections();
      refreshPortfolioOverview();
    } else if (localHoldings > 0) {
      if (!holdingAccounts.some((account) => account.holdings?.length)) {
        holdingAccounts = [{ id: "default", name: "Main holdings", holdings: storedHoldings }];
        holdings = storedHoldings;
        localStorage.setItem("trend-analysis-holding-accounts", JSON.stringify(holdingAccounts));
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
  return { asOf: `${successful.length} live position${successful.length === 1 ? "" : "s"}`, summary: `<div class="holding-performance-summary"><div><span>Portfolio current value</span><strong>${formatHoldingMoney(totalCurrentValue)}</strong></div><div><span>Total gain/loss</span><strong class="${valueClass(totalGainLoss)}">${totalGainLoss >= 0 ? "+" : ""}${formatHoldingMoney(totalGainLoss)}</strong></div><div><span>Return on book value</span><strong class="${valueClass(totalGainLossPercent)}">${formatPercent(totalGainLossPercent)}</strong></div><div><span>Positions in gain</span><strong>${performance.filter((item) => item.gainLoss > 0).length} of ${performance.length}</strong></div></div>` };
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
  container.innerHTML = holdingAccounts.map((account) => `<section class="portfolio-section" data-account-section="${account.id}"><div class="portfolio-section-heading"><div><p class="card-kicker">Account type</p><input class="portfolio-section-name" data-account-name="${account.id}" value="${account.name}" maxlength="40" aria-label="Portfolio name" /></div><button class="holding-portfolio-delete" data-delete-account="${account.id}" aria-label="Delete ${account.name}" title="Delete ${account.name}">×</button></div><form class="holding-form portfolio-holding-form" data-account-form="${account.id}"><div class="holding-symbol-input-wrap"><label>Symbol<input name="symbol" class="holding-symbol-input" placeholder="Enter symbol" maxlength="20" required /></label><div class="holding-symbol-suggestions" data-suggestions="${account.id}"></div></div><label>Quantity<input name="quantity" type="number" min="0.0001" step="any" placeholder="Qty" required /></label><label>Book price<input name="bookPrice" type="number" min="0.0001" step="any" placeholder="Price" required /></label><button class="primary-button" type="submit">Add holding <span>+</span></button></form><section class="holdings-performance"><div class="holdings-performance-heading"><div><p class="card-kicker">Position performance</p><h2>Gain/loss by holding</h2></div><span class="holdings-performance-as-of" data-performance-as-of="${account.id}"></span></div><div class="holdings-performance-list" data-performance="${account.id}"><p class="scanner-empty">Loading live prices…</p></div></section><div class="card holdings-card"><div class="holdings-table-wrap"><table class="holdings-table"><thead><tr><th>Symbol</th><th>Qty</th><th>Book price</th><th>Book value</th><th>Current price</th><th>Gain/loss</th><th>Gain/loss %</th><th>Projected income (1 year)</th><th>Expected 1 month</th><th>Expected 1 year</th><th>Expected 5 years</th><th></th></tr></thead><tbody data-rows="${account.id}"><tr><td colspan="12" class="scanner-empty">Loading live prices…</td></tr></tbody>${portfolioTotalsMarkup(account, [])}</table></div></div></section>`).join("");
  container.querySelectorAll("[data-delete-account]").forEach((button) => button.addEventListener("click", () => deleteHoldingAccount(button.dataset.deleteAccount)));
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
            suggestionsContainer.querySelectorAll("[data-result-index]").forEach((button, index) => {
              button.addEventListener("click", (e) => {
                e.preventDefault();
                symbolInput.value = results[index].symbol;
                suggestionsContainer.classList.remove("show");
                suggestionsContainer.innerHTML = "";
              });
            });
          } else {
            suggestionsContainer.innerHTML = '<div class="symbol-option"><small>No matching symbols found.</small></div>';
            suggestionsContainer.classList.add("show");
          }
        } catch (error) {
          suggestionsContainer.innerHTML = `<div class="symbol-option"><small>${error.message}</small></div>`;
          suggestionsContainer.classList.add("show");
        }
      }, 250);
    });
        }
      }, 250);
    });
    symbolInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        suggestionsContainer.classList.remove("show");
        suggestionsContainer.innerHTML = "";
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
      document.querySelectorAll(".holding-symbol-suggestions").forEach((cont) => cont.classList.remove("show"));
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
      return { holding, market: payload };
    } catch (error) { return { holding, error: error.message }; }
  }));
  const rows = document.querySelector(`[data-rows="${account.id}"]`);
  const performance = document.querySelector(`[data-performance="${account.id}"]`);
  const asOf = document.querySelector(`[data-performance-as-of="${account.id}"]`);
  rows.innerHTML = account.holdings.length ? results.map(({ holding, market, error }) => error ? unavailableHoldingRow(holding, account.id, error) : renderHoldingRow(holding, market, account.id)).join("") : '<tr><td colspan="13" class="scanner-empty">No holdings added yet.</td></tr>';
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
  saveHoldings();
  renderPortfolioSections();
}
function addHoldingToAccount(event, form) {
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
  const account = holdingAccounts.find((item) => item.id === accountId);
  if (!account) return;
  account.holdings = account.holdings.filter((holding) => holding.id !== holdingId);
  saveHoldings();
  renderPortfolioSections();
  refreshPortfolioOverview();
}
async function refreshPortfolioOverview() {
  const valueElement = document.querySelector("#portfolioOverviewValue");
  const incomeElement = document.querySelector("#portfolioOverviewIncome");
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
  const totalProjectedIncome = holdingAccounts.reduce((sum, account) => sum + account.holdings.reduce((accountSum, holding) => {
    const dividend = getDividendSettings(holding);
    return accountSum + getProjectedAnnualIncome(holding.quantity, dividend.amount, dividend.frequency);
  }, 0), 0);
  valueElement.textContent = formatHoldingMoney(totalValue);
  incomeElement.textContent = formatHoldingMoney(totalProjectedIncome);
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
  const accountId = pendingDeleteAccountId;
  const account = holdingAccounts.find((item) => item.id === accountId);
  if (!account) return closeDeletePortfolioDialog();
  holdingAccounts = holdingAccounts.filter((item) => item.id !== accountId);
  if (currentHoldingAccountId === accountId) {
    currentHoldingAccountId = holdingAccounts[0].id;
    holdings = getCurrentHoldingAccount().holdings;
  }
  saveHoldings();
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
  saveHoldings();
  renderHoldingAccounts();
  showToast(`Account renamed to ${account.name}.`);
}
function setHoldingsStatus(message) { showToast(message); }
function getHoldingPerformance(holding, market) {
  const current = market.prices.at(-1).close;
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
  element.innerHTML = `<div class="holding-performance-summary"><div><span>Portfolio current value</span><strong>${formatHoldingMoney(totalCurrentValue)}</strong></div><div><span>Total gain/loss</span><strong class="${valueClass(totalGainLoss)}">${totalGainLoss >= 0 ? "+" : ""}${formatHoldingMoney(totalGainLoss)}</strong></div><div><span>Return on book value</span><strong class="${valueClass(totalGainLossPercent)}">${formatPercent(totalGainLossPercent)}</strong></div><div><span>Positions in gain</span><strong>${performance.filter((item) => item.gainLoss > 0).length} of ${performance.length}</strong></div></div>`;
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
function renderHoldingRow(holding, market, accountId) {
  const { current, bookValue, gainLoss, gainLossPercent } = getHoldingPerformance(holding, market);
  const indicators = calculateIndicators(market.prices);
  const modelReturns = getModelReturns(current, indicators.score);
  const monthExpected = Math.max(-25, Math.min(35, (modelReturns.oneYearLow + modelReturns.oneYearHigh) / 12));
  const dividend = getDividendSettings(holding);
  const projectedIncome = getProjectedAnnualIncome(holding.quantity, dividend.amount, dividend.frequency);
  const valueClass = (value) => value >= 0 ? "positive" : "negative";
  return `<tr><td><button class="holding-symbol-button" data-holding-id="${holding.id}" type="button" aria-label="Edit dividend settings for ${holding.symbol}"><strong>${holding.symbol}</strong></button></td><td><input class="holding-quantity-input" type="number" min="0.0001" step="any" value="${holding.quantity}" data-account-id="${accountId}" data-holding-id="${holding.id}" aria-label="Quantity for ${holding.symbol}" /></td><td><input class="holding-bookprice-input" type="number" min="0.0001" step="any" value="${holding.bookPrice}" data-account-id="${accountId}" data-holding-id="${holding.id}" aria-label="Book price for ${holding.symbol}" /></td><td>${formatMoney(bookValue)}</td><td>${formatHoldingMoney(current)}</td><td class="${valueClass(gainLoss)}">${gainLoss >= 0 ? "+" : ""}${formatHoldingMoney(gainLoss)}</td><td class="${valueClass(gainLossPercent)}">${formatPercent(gainLossPercent)}</td><td class="positive">${formatHoldingMoney(projectedIncome)}</td><td>${formatPercent(monthExpected)}</td><td>${formatPercent(modelReturns.oneYearLow)} to ${formatPercent(modelReturns.oneYearHigh)}</td><td>${formatPercent(modelReturns.fiveYearLow)} to ${formatPercent(modelReturns.fiveYearHigh)}</td><td><button class="remove-holding" data-id="${holding.id}" data-account-id="${accountId}" type="button" aria-label="Remove ${holding.symbol}" title="Remove ${holding.symbol}">×</button></td></tr><tr class="holding-income-editor hidden" data-editor="${holding.id}"><td colspan="12"><label>Dividend amount per payment <input class="holding-income-input" data-account-id="${accountId}" data-holding-id="${holding.id}" data-dividend-field="amount" type="number" min="0" step="0.001" value="${dividend.amount}" /></label><label>Frequency <select class="holding-income-input" data-account-id="${accountId}" data-holding-id="${holding.id}" data-dividend-field="frequency"><option value="monthly" ${dividend.frequency === "monthly" ? "selected" : ""}>Monthly</option><option value="quarterly" ${dividend.frequency === "quarterly" ? "selected" : ""}>Quarterly</option><option value="semi-annual" ${dividend.frequency === "semi-annual" ? "selected" : ""}>Semi-annual</option><option value="annual" ${dividend.frequency === "annual" ? "selected" : ""}>Annual</option></select></label></td></tr>`;
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
document.querySelector("#analyzeButton").addEventListener("click", () => { const value = document.querySelector("#symbolInput").value.trim().toUpperCase(); if (!isValidSymbol(value)) return showToast("Enter a valid ticker symbol, such as AAPL, CM:NYSE, or CM:TSX."); state.symbol = value; state.timeframe = document.querySelector("#chartTimeframeSelect").value; state.exchange = value.includes(":") ? value.split(":")[1] : exchangeBySymbol[value] || "NASDAQ"; render(); showToast(`Loaded market data for ${value}.`); });
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
refreshPortfolioOverview();
initializeAuth();
document.querySelector("#newHoldingAccountButton").addEventListener("click", createHoldingAccount);
document.querySelector("#authButton").addEventListener("click", openAuthPanel);
document.querySelector("#authClose").addEventListener("click", closeAuthPanel);
document.querySelector("#authMode").addEventListener("click", () => setAuthMode(!authRegisterMode));
document.querySelector("#authForm").addEventListener("submit", authenticate);
document.querySelector("#cancelDeletePortfolio").addEventListener("click", closeDeletePortfolioDialog);
document.querySelector("#confirmDeletePortfolio").addEventListener("click", confirmDeleteHoldingAccount);
window.addEventListener("resize", drawChart); render();
