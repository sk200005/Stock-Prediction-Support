from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from pymongo.errors import PyMongoError

from backend.services.data_loader import load_articles
from backend.services.mongo_client import (
    MONGODB_ARTICLES_COLLECTION,
    get_database,
    mongo_is_available,
)


CACHE_COLLECTION = "sentiment_analytics_cache"
CACHE_KEY = "market_sentiment_analytics"
CACHE_TTL_MINUTES = 15
REQUIRED_CACHE_FIELDS = {
    "sentiment_trend",
    "news_impact",
    "company_sentiment",
    "company_sentiment_trend",
    "generated_at",
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _isoformat(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _ensure_utc_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _numeric_field(field_name: str) -> Dict[str, Any]:
    return {
        "$convert": {
            "input": {
                "$ifNull": [
                    f"${field_name}",
                    f"$analysis.{field_name}",
                ]
            },
            "to": "double",
            "onError": None,
            "onNull": None,
        }
    }


def _published_at_field() -> Dict[str, Any]:
    return {
        "$dateFromString": {
            "dateString": "$published_at",
            "onError": None,
            "onNull": None,
        }
    }


def _load_cached_payload() -> Dict[str, Any] | None:
    if not mongo_is_available():
        return None

    try:
        database = get_database()
        cached = database[CACHE_COLLECTION].find_one({"cache_key": CACHE_KEY}, {"_id": 0})
    except PyMongoError as error:
        raise RuntimeError(f"Unable to read sentiment analytics cache: {error}") from error

    if not cached:
        return None

    payload = cached.get("payload")
    if not isinstance(payload, dict) or not REQUIRED_CACHE_FIELDS.issubset(payload.keys()):
        return None

    expires_at = _ensure_utc_datetime(cached.get("expires_at"))
    if isinstance(expires_at, datetime) and expires_at > _utcnow():
        return payload

    return None


def _write_cached_payload(payload: Dict[str, Any]) -> None:
    database = get_database()
    now = _utcnow()
    expires_at = now + timedelta(minutes=CACHE_TTL_MINUTES)
    database[CACHE_COLLECTION].update_one(
        {"cache_key": CACHE_KEY},
        {
            "$set": {
                "cache_key": CACHE_KEY,
                "payload": payload,
                "generated_at": now,
                "expires_at": expires_at,
            }
        },
        upsert=True,
    )


def _parse_iso_datetime(value: str) -> datetime | None:
    if not value:
        return None

    normalized = str(value).replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _compute_sentiment_trend(database) -> List[Dict[str, Any]]:
    pipeline = [
        {
            "$project": {
                "published_hour": _published_at_field(),
                "sentiment_score": _numeric_field("sentiment_score"),
            }
        },
        {
            "$match": {
                "published_hour": {"$ne": None},
                "sentiment_score": {"$ne": None},
            }
        },
        {
            "$group": {
                "_id": {
                    "$dateToString": {
                        "format": "%Y-%m-%dT%H:00:00Z",
                        "date": "$published_hour",
                        "timezone": "UTC",
                    }
                },
                "avg_sentiment": {"$avg": "$sentiment_score"},
            }
        },
        {"$sort": {"_id": 1}},
    ]

    results = database[MONGODB_ARTICLES_COLLECTION].aggregate(pipeline)
    return [
        {
            "time": item["_id"],
            "avg_sentiment": round(float(item.get("avg_sentiment", 0.0) or 0.0), 4),
        }
        for item in results
    ]


def _compute_news_impact(database) -> List[Dict[str, Any]]:
    pipeline = [
        {
            "$project": {
                "company": {
                    "$ifNull": [
                        "$company",
                        "$analysis.company",
                    ]
                },
                "published_at": "$published_at",
                "sentiment_score": _numeric_field("sentiment_score"),
                "price_change_percent": _numeric_field("price_change_percent"),
            }
        },
        {
            "$match": {
                "company": {"$nin": [None, "", "Unknown"]},
                "sentiment_score": {"$ne": None},
                "price_change_percent": {"$ne": None},
            }
        },
        {
            "$addFields": {
                "impact_score": {
                    "$multiply": [
                        "$sentiment_score",
                        "$price_change_percent",
                    ]
                }
            }
        },
        {"$sort": {"published_at": -1}},
    ]

    results = database[MONGODB_ARTICLES_COLLECTION].aggregate(pipeline)
    return [
        {
            "company": str(item.get("company") or "Unknown"),
            "sentiment_score": round(float(item.get("sentiment_score", 0.0) or 0.0), 4),
            "price_change_percent": round(float(item.get("price_change_percent", 0.0) or 0.0), 4),
            "impact_score": round(float(item.get("impact_score", 0.0) or 0.0), 4),
            "published_at": item.get("published_at", ""),
        }
        for item in results
    ]


def _compute_company_sentiment(database) -> List[Dict[str, Any]]:
    pipeline = [
        {
            "$project": {
                "company": {
                    "$ifNull": [
                        "$company",
                        "$analysis.company",
                    ]
                },
                "sentiment_score": _numeric_field("sentiment_score"),
            }
        },
        {
            "$match": {
                "company": {"$nin": [None, "", "Unknown"]},
                "sentiment_score": {"$ne": None},
            }
        },
        {
            "$group": {
                "_id": "$company",
                "avg_sentiment": {"$avg": "$sentiment_score"},
                "articles": {"$sum": 1},
            }
        },
        {"$sort": {"avg_sentiment": -1, "articles": -1, "_id": 1}},
    ]

    results = database[MONGODB_ARTICLES_COLLECTION].aggregate(pipeline)
    return [
        {
            "company": str(item.get("_id") or "Unknown"),
            "avg_sentiment": round(float(item.get("avg_sentiment", 0.0) or 0.0), 4),
            "articles": int(item.get("articles", 0) or 0),
        }
        for item in results
    ]


def _compute_company_sentiment_trend(database) -> List[Dict[str, Any]]:
    top_companies_pipeline = [
        {
            "$project": {
                "company": {
                    "$ifNull": [
                        "$company",
                        "$analysis.company",
                    ]
                },
                "sentiment_score": _numeric_field("sentiment_score"),
            }
        },
        {
            "$match": {
                "company": {"$nin": [None, "", "Unknown"]},
                "sentiment_score": {"$ne": None},
            }
        },
        {
            "$group": {
                "_id": "$company",
                "articles": {"$sum": 1},
            }
        },
        {"$sort": {"articles": -1, "_id": 1}},
        {"$limit": 10},
    ]
    top_companies = [
        str(item.get("_id"))
        for item in database[MONGODB_ARTICLES_COLLECTION].aggregate(top_companies_pipeline)
        if item.get("_id")
    ]
    if not top_companies:
        return []

    trend_pipeline = [
        {
            "$project": {
                "company": {
                    "$ifNull": [
                        "$company",
                        "$analysis.company",
                    ]
                },
                "published_hour": _published_at_field(),
                "sentiment_score": _numeric_field("sentiment_score"),
            }
        },
        {
            "$match": {
                "company": {"$in": top_companies},
                "published_hour": {"$ne": None},
                "sentiment_score": {"$ne": None},
            }
        },
        {
            "$group": {
                "_id": {
                    "company": "$company",
                    "time": {
                        "$dateToString": {
                            "format": "%Y-%m-%dT%H:00:00Z",
                            "date": "$published_hour",
                            "timezone": "UTC",
                        }
                    },
                },
                "avg_sentiment": {"$avg": "$sentiment_score"},
            }
        },
        {"$sort": {"_id.time": 1, "_id.company": 1}},
    ]
    results = database[MONGODB_ARTICLES_COLLECTION].aggregate(trend_pipeline)
    return [
        {
            "company": str(item["_id"]["company"]),
            "time": str(item["_id"]["time"]),
            "avg_sentiment": round(float(item.get("avg_sentiment", 0.0) or 0.0), 4),
        }
        for item in results
    ]


def _extract_numeric(article: Dict[str, Any], field_name: str) -> float | None:
    candidates = [
        article.get(field_name),
        (article.get("analysis") or {}).get(field_name),
    ]

    for candidate in candidates:
        try:
            if candidate is not None:
                return float(candidate)
        except (TypeError, ValueError):
            continue

    return None


def _extract_company(article: Dict[str, Any]) -> str:
    company = article.get("company") or (article.get("analysis") or {}).get("company") or "Unknown"
    company = str(company).strip()
    return company or "Unknown"


def _compute_sentiment_trend_from_articles(articles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    buckets: Dict[str, List[float]] = defaultdict(list)

    for article in articles:
        published_at = _parse_iso_datetime(article.get("published_at", ""))
        sentiment_score = _extract_numeric(article, "sentiment_score")
        if published_at is None or sentiment_score is None:
            continue

        bucket = published_at.replace(minute=0, second=0, microsecond=0)
        buckets[_isoformat(bucket)].append(sentiment_score)

    return [
        {
            "time": bucket,
            "avg_sentiment": round(sum(scores) / len(scores), 4),
        }
        for bucket, scores in sorted(buckets.items())
    ]


def _compute_news_impact_from_articles(articles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    impact_rows = []

    for article in articles:
        company = _extract_company(article)
        sentiment_score = _extract_numeric(article, "sentiment_score")
        price_change_percent = _extract_numeric(article, "price_change_percent")
        if company == "Unknown" or sentiment_score is None or price_change_percent is None:
            continue

        impact_rows.append(
            {
                "company": company,
                "sentiment_score": round(sentiment_score, 4),
                "price_change_percent": round(price_change_percent, 4),
                "impact_score": round(sentiment_score * price_change_percent, 4),
                "published_at": article.get("published_at", ""),
            }
        )

    return sorted(impact_rows, key=lambda item: item.get("published_at", ""), reverse=True)


def _compute_company_sentiment_from_articles(articles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    grouped_scores: Dict[str, List[float]] = defaultdict(list)

    for article in articles:
        company = _extract_company(article)
        sentiment_score = _extract_numeric(article, "sentiment_score")
        if company == "Unknown" or sentiment_score is None:
            continue
        grouped_scores[company].append(sentiment_score)

    company_rows = [
        {
            "company": company,
            "avg_sentiment": round(sum(scores) / len(scores), 4),
            "articles": len(scores),
        }
        for company, scores in grouped_scores.items()
    ]
    return sorted(
        company_rows,
        key=lambda item: (-item["avg_sentiment"], -item["articles"], item["company"]),
    )


def _compute_company_sentiment_trend_from_articles(articles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    article_counts: Dict[str, int] = defaultdict(int)
    for article in articles:
        company = _extract_company(article)
        sentiment_score = _extract_numeric(article, "sentiment_score")
        if company == "Unknown" or sentiment_score is None:
            continue
        article_counts[company] += 1

    top_companies = [
        company
        for company, _ in sorted(article_counts.items(), key=lambda item: (-item[1], item[0]))[:10]
    ]
    if not top_companies:
        return []

    grouped_scores: Dict[tuple[str, str], List[float]] = defaultdict(list)
    for article in articles:
        company = _extract_company(article)
        if company not in top_companies:
            continue

        published_at = _parse_iso_datetime(article.get("published_at", ""))
        sentiment_score = _extract_numeric(article, "sentiment_score")
        if published_at is None or sentiment_score is None:
            continue

        bucket = published_at.replace(minute=0, second=0, microsecond=0)
        grouped_scores[(company, _isoformat(bucket))].append(sentiment_score)

    trend_rows = [
        {
            "company": company,
            "time": time_bucket,
            "avg_sentiment": round(sum(scores) / len(scores), 4),
        }
        for (company, time_bucket), scores in grouped_scores.items()
    ]
    return sorted(trend_rows, key=lambda item: (item["time"], item["company"]))


def _compute_payload_from_articles(articles: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "sentiment_trend": _compute_sentiment_trend_from_articles(articles),
        "news_impact": _compute_news_impact_from_articles(articles),
        "company_sentiment": _compute_company_sentiment_from_articles(articles),
        "company_sentiment_trend": _compute_company_sentiment_trend_from_articles(articles),
        "generated_at": _isoformat(_utcnow()),
    }


def get_sentiment_analytics() -> Dict[str, Any]:
    if not mongo_is_available():
        return _compute_payload_from_articles(load_articles())

    cached_payload = _load_cached_payload()
    if cached_payload:
        return cached_payload

    try:
        database = get_database()
        payload = {
            "sentiment_trend": _compute_sentiment_trend(database),
            "news_impact": _compute_news_impact(database),
            "company_sentiment": _compute_company_sentiment(database),
            "company_sentiment_trend": _compute_company_sentiment_trend(database),
            "generated_at": _isoformat(_utcnow()),
        }
        _write_cached_payload(payload)
        return payload
    except PyMongoError as error:
        raise RuntimeError(f"Unable to compute sentiment analytics: {error}") from error
