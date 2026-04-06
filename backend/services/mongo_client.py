import os

from pymongo import MongoClient
from pymongo.errors import PyMongoError


MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://127.0.0.1:27017")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "market_signals")
MONGODB_ARTICLES_COLLECTION = os.getenv("MONGODB_ARTICLES_COLLECTION", "articles")
MONGODB_METADATA_COLLECTION = os.getenv("MONGODB_METADATA_COLLECTION", "metadata")

_client = None


def get_mongo_client() -> MongoClient:
    global _client
    if _client is None:
        _client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=3000)
    return _client


def get_database():
    client = get_mongo_client()
    return client[MONGODB_DATABASE]


def mongo_is_available() -> bool:
    try:
        client = get_mongo_client()
        client.admin.command("ping")
        return True
    except PyMongoError:
        return False
