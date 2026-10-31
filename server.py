import json
import os
import urllib.parse
import urllib.request
import time
import base64
import hashlib
import secrets
from concurrent.futures import ThreadPoolExecutor, as_completed
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

DATA_FILE = os.path.join(os.path.dirname(__file__), "users.json")
USERS = {}
SESSIONS = {}
if os.path.exists(DATA_FILE):
    try:
        with open(DATA_FILE, encoding="utf-8") as file:
            USERS = json.load(file)
    except (OSError, ValueError):
        USERS = {}

def hash_password(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return base64.b64encode(salt).decode(), base64.b64encode(digest).decode()

def save_users():
    temporary = f"{DATA_FILE}.tmp"
    with open(temporary, "w", encoding="utf-8") as file:
        json.dump(USERS, file)
    os.replace(temporary, DATA_FILE)

SCAN_CACHE = {}
SCAN_CACHE_TTL = 900
SYMBOL_SEARCH_CACHE = {}


def fetch_prices(symbol, outputsize, api_key, start_date=None, end_date=None, interval="1day"):
    request_params = {
        "symbol": symbol,
        "interval": interval,
        "outputsize": outputsize,
        "apikey": api_key,
    }
    if start_date:
        request_params["start_date"] = start_date
    if end_date:
        request_params["end_date"] = end_date
    params = urllib.parse.urlencode(request_params)
    with urllib.request.urlopen(
        f"https://api.twelvedata.com/time_series?{params}", timeout=15
    ) as response:
        payload = json.loads(response.read())
    if payload.get("status") == "error" or "values" not in payload:
        raise RuntimeError(payload.get("message", "Twelve Data returned no values"))
    return [
        {
            "open": float(row.get("open", row["close"])),
            "high": float(row.get("high", row["close"])),
            "low": float(row.get("low", row["close"])),
            "close": float(row["close"]),
            "volume": float(row.get("volume", 0)),
            "date": row["datetime"],
        }
        for row in reversed(payload["values"])
    ]


def average(values):
    return sum(values) / len(values) if values else 0


def scan_symbol(symbol, api_key):
    prices = fetch_prices(symbol, 260, api_key)
    closes = [point["close"] for point in prices]
    volumes = [point["volume"] for point in prices]
    if len(closes) < 60:
        raise RuntimeError("Not enough daily candles")
    current = closes[-1]
    previous = closes[-2]
    sma20 = average(closes[-20:])
    sma50 = average(closes[-50:])
    sma200 = average(closes[-200:]) if len(closes) >= 200 else sma50
    average_volume = average(volumes[-21:-1])
    volume_ratio = volumes[-1] / average_volume if average_volume else 1
    volatility = (sum(((value - sma20) / sma20) ** 2 for value in closes[-20:]) / 20) ** 0.5 * 100
    trend = 1 if current > sma20 and sma20 > sma50 else -1 if current < sma20 and sma20 < sma50 else 0
    regime = "Defensive" if current < sma50 and sma50 < sma200 else "Constructive" if current > sma50 and sma50 > sma200 else "Mixed"
    momentum = 1 if closes[-1] > closes[-6] else -1
    base_score = max(0, min(100, 50 + trend * 16 + momentum * 10 + (8 if volume_ratio >= 1.2 else -4 if volume_ratio <= 0.8 else 0) + (8 if current > sma200 else -8)))
    horizons = {}
    for label, days in (("week", 5), ("month", 21), ("year", 252)):
        if len(closes) > days:
            recent_return = (current / closes[-days - 1] - 1) * 100
        else:
            recent_return = 0
        horizon_score = max(0, min(100, base_score + recent_return * (1.5 if days == 5 else 0.8 if days == 21 else 0.25)))
        expected_return = max(-25, min(35, recent_return * (1.2 if days == 5 else 1.1 if days == 21 else 1.0)))
        stop_distance = min(15, max(3, volatility * 1.5))
        target_distance = min(35, max(expected_return, stop_distance * 2))
        horizons[label] = {
            "score": round(horizon_score, 1),
            "expected_return": round(expected_return, 1),
            "stop_loss": round(current * (1 - stop_distance / 100), 2),
            "target": round(current * (1 + target_distance / 100), 2),
        }
    return {
        "symbol": symbol,
        "price": round(current, 2),
        "change_percent": round((current / previous - 1) * 100, 2),
        "volume_ratio": round(volume_ratio, 2),
        "volatility": round(volatility, 2),
        "regime": regime,
        "source": "Twelve Data",
        "horizons": horizons,
    }


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/auth/me":
            self.handle_auth_me()
            return
        if parsed.path == "/api/holdings":
            self.handle_holdings_get()
            return
        if parsed.path == "/api/portfolio":
            self.handle_portfolio_get()
            return
        if parsed.path == "/api/symbol-search":
            self.handle_symbol_search(parsed)
            return
        if parsed.path == "/api/scan":
            self.handle_scan(parsed)
            return
        if parsed.path != "/api/time-series":
            return super().do_GET()

        query = urllib.parse.parse_qs(parsed.query)
        symbol = query.get("symbol", ["AAPL"])[0].upper()
        outputsize = query.get("outputsize", ["252"])[0]
        interval = query.get("interval", ["1day"])[0]
        start_date = query.get("start_date", [None])[0]
        end_date = query.get("end_date", [None])[0]
        api_key = os.environ.get("TWELVE_DATA_API_KEY")
        if not api_key:
            self.send_json(503, {"error": "TWELVE_DATA_API_KEY is not configured"})
            return

        print(f"DEBUG: Using API key: {api_key[:10]}..." if api_key else "DEBUG: No API key")
        try:
            prices = fetch_prices(symbol, outputsize, api_key, start_date, end_date, interval)
        except Exception as error:
            print(f"ERROR fetching {symbol}: {type(error).__name__}: {error}")
            self.send_json(502, {"error": f"Unable to reach Twelve Data: {error}"})
            return
        if start_date:
            prices = [point for point in prices if point["date"] >= start_date]
        if end_date:
            prices = [point for point in prices if point["date"] <= end_date]
        if not prices:
            self.send_json(502, {"error": "Twelve Data returned no candles in the requested date range"})
            return
        self.send_json(200, {"source": "Twelve Data", "symbol": symbol, "prices": prices})

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path in ("/api/auth/register", "/api/auth/login"):
            self.handle_auth(parsed.path)
            return
        if parsed.path == "/api/auth/logout":
            session = self.session_user()
            if session:
                SESSIONS.pop(session[0], None)
            self.send_json(200, {"ok": True}, clear_cookie=True)
            return
        if parsed.path == "/api/auth/verify-password":
            self.handle_verify_password()
            return
        if parsed.path == "/api/auth/change-password":
            self.handle_change_password()
            return
        if parsed.path == "/api/holdings":
            self.handle_holdings_save()
            return
        if parsed.path == "/api/portfolio":
            self.handle_portfolio_save()
            return
        self.send_error(404)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length)) if length else {}

    def session_user(self):
        cookie = self.headers.get("Cookie", "")
        token = next((part.split("=", 1)[1] for part in cookie.split("; ") if part.startswith("tradeideas_session=")), None)
        return (token, SESSIONS.get(token)) if token and token in SESSIONS else None

    def handle_auth(self, path):
        try:
            payload = self.read_json()
            username = str(payload.get("username", "")).strip().lower()
            password = str(payload.get("password", ""))
        except (ValueError, TypeError):
            self.send_json(400, {"error": "Invalid request"})
            return
        if not username or len(username) > 80 or len(password) < 8:
            self.send_json(400, {"error": "Use a username and a password of at least 8 characters"})
            return
        if path.endswith("register"):
            if username in USERS:
                self.send_json(409, {"error": "That username already exists"})
                return
            salt, digest = hash_password(password)
            USERS[username] = {"salt": salt, "password": digest, "portfolio": None, "holdings_accounts": []}
            save_users()
        else:
            record = USERS.get(username)
            if not record:
                self.send_json(401, {"error": "Invalid username or password"})
                return
            salt = base64.b64decode(record["salt"])
            _, digest = hash_password(password, salt)
            if not secrets.compare_digest(digest, record["password"]):
                self.send_json(401, {"error": "Invalid username or password"})
                return
        token = secrets.token_urlsafe(32)
        SESSIONS[token] = username
        self.send_json(200, {"username": username, "portfolio": USERS[username].get("portfolio")}, cookie=token)

    def handle_auth_me(self):
        session = self.session_user()
        if not session:
            self.send_json(401, {"error": "Not signed in"})
            return
        username = session[1]
        self.send_json(200, {"username": username, "portfolio": USERS[username].get("portfolio")})

    def handle_portfolio_get(self):
        session = self.session_user()
        if not session:
            self.send_json(401, {"error": "Sign in to sync your portfolio"})
            return
        self.send_json(200, {"portfolio": USERS[session[1]].get("portfolio")})

    def handle_portfolio_save(self):
        session = self.session_user()
        if not session:
            self.send_json(401, {"error": "Sign in to sync your portfolio"})
            return
        try:
            portfolio = self.read_json().get("portfolio")
        except (ValueError, TypeError):
            self.send_json(400, {"error": "Invalid portfolio data"})
            return
        if not isinstance(portfolio, list) or len(portfolio) > 100:
            self.send_json(400, {"error": "Invalid portfolio data"})
            return
        USERS[session[1]]["portfolio"] = portfolio
        save_users()
        self.send_json(200, {"ok": True})

    def handle_holdings_get(self):
        # Use default admin user for holdings (protected by password screen)
        username = "admin"
        if username not in USERS:
            USERS[username] = {"salt": "", "password": "", "portfolio": None, "holdings_accounts": []}
            save_users()
        holdings_accounts = USERS[username].get("holdings_accounts", [])
        self.send_json(200, {"holdings_accounts": holdings_accounts})

    def handle_holdings_save(self):
        # Use default admin user for holdings (protected by password screen)
        username = "admin"
        if username not in USERS:
            USERS[username] = {"salt": "", "password": "", "portfolio": None, "holdings_accounts": []}
        try:
            data = self.read_json()
            holdings_accounts = data.get("holdings_accounts", [])
        except (ValueError, TypeError):
            self.send_json(400, {"error": "Invalid holdings data"})
            return
        if not isinstance(holdings_accounts, list):
            self.send_json(400, {"error": "Invalid holdings data"})
            return
        USERS[username]["holdings_accounts"] = holdings_accounts
        save_users()
        self.send_json(200, {"ok": True})

    def handle_verify_password(self):
        # Verify password for default admin user
        username = "admin"
        try:
            payload = self.read_json()
            password = str(payload.get("password", ""))
        except (ValueError, TypeError):
            self.send_json(400, {"error": "Invalid request"})
            return
        
        # Initialize admin user if it doesn't exist
        if username not in USERS:
            USERS[username] = {"salt": "", "password": "", "portfolio": None, "holdings_accounts": []}
            save_users()
        
        record = USERS[username]
        
        # Migration: If no password is set, allow the legacy hardcoded password
        if not record.get("password"):
            if password == "tradeideas2025":
                # Initialize the admin account with this password
                new_salt, new_digest = hash_password(password)
                USERS[username]["salt"] = new_salt
                USERS[username]["password"] = new_digest
                save_users()
                self.send_json(200, {"ok": True})
                return
            else:
                self.send_json(401, {"error": "Invalid password"})
                return
        
        # Normal password verification
        salt = base64.b64decode(record["salt"])
        _, digest = hash_password(password, salt)
        if not secrets.compare_digest(digest, record["password"]):
            self.send_json(401, {"error": "Invalid password"})
            return
        
        self.send_json(200, {"ok": True})

    def handle_change_password(self):
        # Change password for default admin user (protected by password screen)
        username = "admin"
        try:
            payload = self.read_json()
            current_password = str(payload.get("currentPassword", ""))
            new_password = str(payload.get("newPassword", ""))
        except (ValueError, TypeError):
            self.send_json(400, {"error": "Invalid request"})
            return
        if len(new_password) < 8:
            self.send_json(400, {"error": "New password must be at least 8 characters"})
            return
        
        # Initialize admin user if it doesn't exist
        if username not in USERS:
            USERS[username] = {"salt": "", "password": "", "portfolio": None, "holdings_accounts": []}
            save_users()
        
        record = USERS[username]
        # If password not set yet (first time), skip current password check
        if record.get("password"):
            salt = base64.b64decode(record["salt"])
            _, digest = hash_password(current_password, salt)
            if not secrets.compare_digest(digest, record["password"]):
                self.send_json(401, {"error": "Current password is incorrect"})
                return
        
        new_salt, new_digest = hash_password(new_password)
        USERS[username]["salt"] = new_salt
        USERS[username]["password"] = new_digest
        save_users()
        self.send_json(200, {"ok": True})

    def handle_symbol_search(self, parsed):
        query = urllib.parse.parse_qs(parsed.query)
        term = query.get("symbol", [""])[0].strip().upper()
        api_key = os.environ.get("TWELVE_DATA_API_KEY")
        if not api_key:
            self.send_json(503, {"error": "TWELVE_DATA_API_KEY is not configured"})
            return
        if len(term) < 1 or len(term) > 20:
            self.send_json(400, {"error": "Enter at least one symbol character"})
            return
        cached = SYMBOL_SEARCH_CACHE.get(term)
        if cached and time.time() - cached["created"] < 600:
            self.send_json(200, cached["payload"])
            return
        params = urllib.parse.urlencode({"symbol": term, "apikey": api_key})
        try:
            with urllib.request.urlopen(
                f"https://api.twelvedata.com/symbol_search?{params}", timeout=15
            ) as response:
                provider_payload = json.loads(response.read())
        except (OSError, ValueError) as error:
            self.send_json(502, {"error": f"Unable to search symbols: {error}"})
            return
        if provider_payload.get("status") == "error":
            self.send_json(502, {"error": provider_payload.get("message", "Symbol search failed")})
            return
        results = []
        for item in provider_payload.get("data", []):
            exchange = item.get("exchange", "")
            exchange_code = "TSX" if "Toronto" in exchange or exchange.upper() == "TSX" else "NYSE" if "New York" in exchange or exchange.upper() == "NYSE" else "NASDAQ" if "Nasdaq" in exchange or exchange.upper() == "NASDAQ" else "CBOE" if "Cboe" in exchange or exchange.upper() == "CBOE" else ""
            if not exchange_code:
                continue
            raw_symbol = item.get("symbol", "")
            provider_symbol = raw_symbol
            if exchange_code == "TSX" and ":" not in provider_symbol:
                provider_symbol = f"{provider_symbol}:TSX"
            results.append({
                "symbol": provider_symbol,
                "display_symbol": f"{raw_symbol}.{exchange_code}" if exchange_code else raw_symbol,
                "name": item.get("instrument_name") or item.get("name") or raw_symbol,
                "exchange": exchange_code or exchange,
                "type": item.get("instrument_type", "Equity"),
                "currency": item.get("currency", ""),
            })
        payload = {"source": "Twelve Data", "results": results[:12]}
        SYMBOL_SEARCH_CACHE[term] = {"created": time.time(), "payload": payload}
        self.send_json(200, payload)

    def handle_scan(self, parsed):
        query = urllib.parse.parse_qs(parsed.query)
        symbols = sorted(set(filter(None, query.get("symbols", [""])[0].split(","))))
        api_key = os.environ.get("TWELVE_DATA_API_KEY")
        if not api_key:
            self.send_json(503, {"error": "TWELVE_DATA_API_KEY is not configured"})
            return
        if not symbols or len(symbols) > 250:
            self.send_json(400, {"error": "Provide between 1 and 250 symbols"})
            return
        cache_key = ",".join(symbols)
        cached = SCAN_CACHE.get(cache_key)
        if cached and time.time() - cached["created"] < SCAN_CACHE_TTL:
            self.send_json(200, {**cached["payload"], "cached": True})
            return
        rows = []
        errors = []
        with ThreadPoolExecutor(max_workers=6) as executor:
            futures = {executor.submit(scan_symbol, symbol, api_key): symbol for symbol in symbols}
            for future in as_completed(futures):
                symbol = futures[future]
                try:
                    rows.append(future.result())
                except Exception as error:
                    print(f"ERROR scanning {symbol}: {type(error).__name__}: {error}")
                    errors.append({"symbol": symbol, "error": str(error)})
        if not rows:
            self.send_json(502, {"error": "No symbols could be scanned", "details": errors[:10]})
            return
        payload = {"source": "Twelve Data", "rows": rows, "errors": errors, "cached": False}
        SCAN_CACHE[cache_key] = {"created": time.time(), "payload": payload}
        self.send_json(200, payload)

    def send_json(self, status, payload, cookie=None, clear_cookie=False):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        if cookie:
            self.send_header("Set-Cookie", f"tradeideas_session={cookie}; HttpOnly; SameSite=Lax; Path=/")
        if clear_cookie:
            self.send_header("Set-Cookie", "tradeideas_session=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 4173))
    host = os.environ.get("HOST", "127.0.0.1")
    print(f"TradeIdeas server running at http://{host}:{port}")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
