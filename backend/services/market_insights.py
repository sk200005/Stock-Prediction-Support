import json
import os
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from statistics import stdev
from typing import Callable, Dict, List, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from pymongo.errors import PyMongoError

from backend.services.data_loader import PROCESSED_ARTICLES_PATH, load_articles
from backend.services.env_loader import load_project_env
from backend.services.mongo_client import get_database, mongo_is_available

load_project_env()

FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY", "")
FINNHUB_BASE_URL = "https://finnhub.io/api/v1"
MARKET_INSIGHTS_COLLECTION = os.getenv("MONGODB_MARKET_INSIGHTS_COLLECTION", "market_insights")
CACHE_TTL_MINUTES = 30
MAX_TICKERS = 12
MAX_WORKERS = 4


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _isoformat(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_iso_datetime(value: str) -> Optional[datetime]:
    if not value:
        return None

    normalized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def _fetch_finnhub_json(endpoint: str, params: Dict[str, object]) -> Dict[str, object] | List[object]:
    if not FINNHUB_API_KEY:
        raise RuntimeError("FINNHUB_API_KEY is missing. Market insights require Finnhub access.")

    query = urlencode({**params, "token": FINNHUB_API_KEY})
    url = f"{FINNHUB_BASE_URL}{endpoint}?{query}"

    try:
        with urlopen(url, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(
            f"Finnhub request failed for {endpoint} with status {error.code}: {body or error.reason}"
        ) from error
    except URLError as error:
        raise RuntimeError(f"Finnhub request failed for {endpoint}: {error.reason}") from error


def _extract_candidate_tickers(articles: List[dict]) -> List[str]:
    mentions = Counter()

    for article in articles:
        tickers = article.get("tickers") or article.get("companies") or []
        normalized_tickers = [
            str(ticker).strip().upper()
            for ticker in tickers
            if str(ticker).strip()
        ]

        if not normalized_tickers and article.get("company") and article.get("company") != "Unknown":
            normalized_tickers = [str(article.get("company")).strip().upper()]

        for ticker in normalized_tickers:
            mentions[ticker] += 1

    return [ticker for ticker, _ in mentions.most_common(MAX_TICKERS)]


def _read_processed_articles_from_file() -> List[dict]:
    if not PROCESSED_ARTICLES_PATH.exists():
        return []

    with PROCESSED_ARTICLES_PATH.open("r", encoding="utf-8") as file:
        payload = json.load(file)

    if isinstance(payload, dict):
        articles = payload.get("articles", [])
        return articles if isinstance(articles, list) else []

    return payload if isinstance(payload, list) else []


def _load_articles_for_market_insights() -> List[dict]:
    primary_articles = load_articles()
    if _extract_candidate_tickers(primary_articles):
        return primary_articles

    fallback_articles = _read_processed_articles_from_file()
    if _extract_candidate_tickers(fallback_articles):
        return fallback_articles

    return primary_articles


def _group_articles_by_ticker(articles: List[dict]) -> Dict[str, List[dict]]:
    grouped = defaultdict(list)

    for article in articles:
        tickers = article.get("tickers") or article.get("companies") or []
        normalized_tickers = [
            str(ticker).strip().upper()
            for ticker in tickers
            if str(ticker).strip()
        ]

        if not normalized_tickers and article.get("company") and article.get("company") != "Unknown":
            normalized_tickers = [str(article.get("company")).strip().upper()]

        for ticker in normalized_tickers:
            grouped[ticker].append(article)

    return grouped


def _compute_average_sentiment(article_group: List[dict]) -> float:
    scores = []

    for article in article_group:
        analysis = article.get("analysis", {})
        score = analysis.get("sentiment_score")
        if score is None:
            signal_score = analysis.get("signal_score")
            try:
                score = float(signal_score)
            except (TypeError, ValueError):
                score = None

        if score is not None:
            try:
                scores.append(float(score))
            except (TypeError, ValueError):
                continue

    if not scores:
        return 0.0

    return round(sum(scores) / len(scores), 4)


def _compute_price_change_percent(quote: Dict[str, object]) -> float:
    current_price = float(quote.get("c") or 0)
    previous_close = float(quote.get("pc") or 0)
    if previous_close == 0:
        return 0.0
    return round(((current_price - previous_close) / previous_close) * 100, 4)


def _extract_stored_price_change_percent(article_group: List[dict]) -> Optional[float]:
    for article in article_group:
        price_data = article.get("price_data") or {}
        candidates = [
            article.get("price_change_percent"),
            price_data.get("percent_change"),
        ]

        for candidate in candidates:
            try:
                if candidate is not None:
                    return round(float(candidate), 4)
            except (TypeError, ValueError):
                continue

    return None


def _parallel_collect_by_ticker(
    tickers: List[str],
    builder: Callable[[str], Optional[dict]],
    diagnostics: List[str],
    failure_message: str,
) -> List[dict]:
    insights: List[dict] = []

    with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, max(1, len(tickers)))) as executor:
        future_map = {executor.submit(builder, ticker): ticker for ticker in tickers}

        for future in as_completed(future_map):
            ticker = future_map[future]
            try:
                result = future.result()
            except RuntimeError:
                diagnostics.append(failure_message.format(ticker=ticker))
                continue
            except Exception:
                diagnostics.append(failure_message.format(ticker=ticker))
                continue

            if result:
                insights.append(result)

    return sorted(insights, key=lambda item: item.get("ticker", ""))


def _build_sentiment_price_reaction(
    tickers: List[str],
    grouped_articles: Dict[str, List[dict]],
    diagnostics: List[str],
) -> List[dict]:
    def build_item(ticker: str) -> Optional[dict]:
        article_group = grouped_articles.get(ticker, [])
        sentiment_score = _compute_average_sentiment(article_group)

        try:
            quote = _fetch_finnhub_json("/quote", {"symbol": ticker})
            price_change_percent = _compute_price_change_percent(quote)
        except RuntimeError:
            stored_price_change = _extract_stored_price_change_percent(article_group)
            if stored_price_change is None:
                raise RuntimeError("quote unavailable")
            price_change_percent = stored_price_change

        reaction_score = round(sentiment_score * price_change_percent, 4)

        return {
            "ticker": ticker,
            "sentiment": sentiment_score,
            "price_change_percent": price_change_percent,
            "reaction_score": reaction_score,
            "article_count": len(article_group),
        }

    return _parallel_collect_by_ticker(
        tickers,
        build_item,
        diagnostics,
        "Quote data unavailable for {ticker}; news reaction fallback could not be computed.",
    )


def _build_earnings_surprise(tickers: List[str], diagnostics: List[str]) -> List[dict]:
    def build_item(ticker: str) -> Optional[dict]:
        payload = _fetch_finnhub_json("/stock/earnings", {"symbol": ticker})

        if not isinstance(payload, list) or not payload:
            return None

        latest = payload[0]
        actual_eps = latest.get("actual")
        expected_eps = latest.get("estimate")

        try:
            actual_value = float(actual_eps)
            expected_value = float(expected_eps)
        except (TypeError, ValueError):
            return None

        if expected_value == 0:
            return None

        earnings_surprise = round((actual_value - expected_value) / expected_value, 4)
        return {
            "ticker": ticker,
            "actual_eps": actual_value,
            "expected_eps": expected_value,
            "earnings_surprise": earnings_surprise,
            "period": latest.get("period", ""),
        }

    return _parallel_collect_by_ticker(
        tickers,
        build_item,
        diagnostics,
        "Earnings surprise data unavailable for {ticker}.",
    )


def _normalize_transaction_shares(entry: dict) -> float:
    for key in ("share", "shares", "change", "transactionShare"):
        value = entry.get(key)
        if value is None:
            continue

        try:
            return abs(float(value))
        except (TypeError, ValueError):
            continue

    return 0.0


def _is_buy_transaction(transaction_type: str) -> bool:
    normalized = str(transaction_type or "").lower()
    return any(keyword in normalized for keyword in ["buy", "purchase", "award", "grant", "acquire"])


def _is_sell_transaction(transaction_type: str) -> bool:
    normalized = str(transaction_type or "").lower()
    return any(keyword in normalized for keyword in ["sell", "sale", "dispose"])


def _build_insider_trading_signal(tickers: List[str], diagnostics: List[str]) -> List[dict]:
    def build_item(ticker: str) -> Optional[dict]:
        payload = _fetch_finnhub_json("/stock/insider-transactions", {"symbol": ticker})

        entries = payload.get("data", []) if isinstance(payload, dict) else []
        shares_bought = 0.0
        shares_sold = 0.0

        for entry in entries[:50]:
            transaction_type = entry.get("transactionType", "")
            shares = _normalize_transaction_shares(entry)
            if shares == 0:
                continue

            if _is_buy_transaction(transaction_type):
                shares_bought += shares
            elif _is_sell_transaction(transaction_type):
                shares_sold += shares

        total_shares = shares_bought + shares_sold
        insider_signal = round((shares_bought - shares_sold) / total_shares, 4) if total_shares else 0.0
        return {
            "ticker": ticker,
            "shares_bought": round(shares_bought, 2),
            "shares_sold": round(shares_sold, 2),
            "insider_signal": insider_signal,
        }

    return _parallel_collect_by_ticker(
        tickers,
        build_item,
        diagnostics,
        "Insider transaction data unavailable for {ticker}.",
    )


def _standard_deviation(values: List[float]) -> float:
    if len(values) < 2:
        return 0.0
    return float(stdev(values))


def _build_volatility_metrics(tickers: List[str], diagnostics: List[str]) -> List[dict]:
    to_date = _utcnow().date()
    from_date = to_date - timedelta(days=90)

    def build_item(ticker: str) -> Optional[dict]:
        payload = _fetch_finnhub_json(
            "/stock/candle",
            {
                "symbol": ticker,
                "resolution": "D",
                "from": int(datetime.combine(from_date, datetime.min.time(), tzinfo=timezone.utc).timestamp()),
                "to": int(datetime.combine(to_date, datetime.min.time(), tzinfo=timezone.utc).timestamp()),
            },
        )

        closes = payload.get("c", []) if isinstance(payload, dict) else []
        timestamps = payload.get("t", []) if isinstance(payload, dict) else []
        if len(closes) < 2 or len(closes) != len(timestamps):
            return None

        returns = []
        for index in range(1, len(closes)):
            previous_close = closes[index - 1]
            current_close = closes[index]
            if not previous_close:
                continue
            returns.append((current_close - previous_close) / previous_close)

        trailing_returns = returns[-30:]
        volatility_30d = round(_standard_deviation(trailing_returns), 4) if trailing_returns else 0.0

        history = []
        for index in range(29, len(returns)):
            window = returns[index - 29:index + 1]
            history.append(
                {
                    "date": datetime.fromtimestamp(timestamps[index + 1], tz=timezone.utc).date().isoformat(),
                    "volatility": round(_standard_deviation(window), 4),
                }
            )

        return {
            "ticker": ticker,
            "volatility_30d": volatility_30d,
            "history": history[-20:],
        }

    return _parallel_collect_by_ticker(
        tickers,
        build_item,
        diagnostics,
        "Volatility candle data unavailable for {ticker}.",
    )


def _load_cached_market_insights() -> Optional[dict]:
    if not mongo_is_available():
        return None

    try:
        document = get_database()[MARKET_INSIGHTS_COLLECTION].find_one(
            {"type": "market_insights"},
            {"_id": 0},
        )
    except PyMongoError:
        return None

    if not document:
        return None

    generated_at = _parse_iso_datetime(document.get("generated_at", ""))
    if not generated_at:
        return None

    if _utcnow() - generated_at > timedelta(minutes=CACHE_TTL_MINUTES):
        return None

    payload = document.get("payload")
    if not isinstance(payload, dict):
        return None

    has_any_data = any(
        isinstance(payload.get(key), list) and len(payload.get(key, [])) > 0
        for key in (
            "sentiment_price_reaction",
            "earnings_surprise",
            "insider_trading_signal",
            "volatility_metrics",
        )
    )

    return payload if has_any_data else None


def _store_cached_market_insights(payload: dict) -> None:
    if not mongo_is_available():
        return

    try:
        get_database()[MARKET_INSIGHTS_COLLECTION].update_one(
            {"type": "market_insights"},
            {
                "$set": {
                    "type": "market_insights",
                    "generated_at": _isoformat(_utcnow()),
                    "payload": payload,
                }
            },
            upsert=True,
        )
    except PyMongoError:
        return


def get_market_insights(force_refresh: bool = False) -> dict:
    if not FINNHUB_API_KEY:
        raise RuntimeError(
            "FINNHUB_API_KEY is missing for the FastAPI backend. Add it to .env and restart the backend."
        )

    if not force_refresh:
        cached_payload = _load_cached_market_insights()
        if cached_payload:
            return cached_payload

    articles = _load_articles_for_market_insights()
    tickers = _extract_candidate_tickers(articles)
    grouped_articles = _group_articles_by_ticker(articles)
    diagnostics: List[str] = []

    payload = {
        "sentiment_price_reaction": _build_sentiment_price_reaction(tickers, grouped_articles, diagnostics),
        "earnings_surprise": _build_earnings_surprise(tickers, diagnostics),
        "insider_trading_signal": _build_insider_trading_signal(tickers, diagnostics),
        "volatility_metrics": _build_volatility_metrics(tickers, diagnostics),
        "diagnostics": diagnostics,
        "generated_at": _isoformat(_utcnow()),
    }

    _store_cached_market_insights(payload)
    return payload
