import json
from pathlib import Path
from typing import Any, Dict, List

from pymongo.errors import PyMongoError

from backend.services.mongo_client import (
    MONGODB_ARTICLES_COLLECTION,
    MONGODB_METADATA_COLLECTION,
    get_database,
    mongo_is_available,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PROCESSED_ARTICLES_PATH = PROJECT_ROOT / "output" / "processedArticles.json"


def _normalize_payload(payload: Any) -> Dict[str, Any]:
    if isinstance(payload, list):
        return {"articles": payload, "aggregates": {}}

    if isinstance(payload, dict):
        payload.setdefault("articles", [])
        payload.setdefault("aggregates", {})
        return payload

    return {"articles": [], "aggregates": {}}


def load_processed_payload() -> Dict[str, Any]:
    mongo_payload = load_processed_payload_from_mongo()
    if mongo_payload["articles"] or mongo_payload["aggregates"]:
        return mongo_payload

    if not PROCESSED_ARTICLES_PATH.exists():
        return {"articles": [], "aggregates": {}}

    with PROCESSED_ARTICLES_PATH.open("r", encoding="utf-8") as file:
        payload = json.load(file)

    return _normalize_payload(payload)


def load_articles() -> List[Dict[str, Any]]:
    payload = load_processed_payload()
    return payload.get("articles", [])


def load_processed_payload_from_mongo() -> Dict[str, Any]:
    if not mongo_is_available():
        return {"articles": [], "aggregates": {}}

    try:
        database = get_database()
        articles = list(
            database[MONGODB_ARTICLES_COLLECTION].find({}, {"_id": 0})
        )
        metadata = database[MONGODB_METADATA_COLLECTION].find_one(
            {"type": "processed_payload"},
            {"_id": 0, "aggregates": 1},
        ) or {}
        return {
            "articles": articles,
            "aggregates": metadata.get("aggregates", {}),
        }
    except PyMongoError:
        return {"articles": [], "aggregates": {}}
