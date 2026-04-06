import json
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.error import URLError
from urllib.request import Request, urlopen

import feedparser


TOTAL_ARTICLES = 5
CANDIDATE_ARTICLES = 30
REQUEST_TIMEOUT_SECONDS = 6
MAX_WORKERS = 8
REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; MarketSignalBot/1.0; +https://example.com/bot)"
}

RSS_FEEDS = {
    "Economic Times": [
        "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
        "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms",
    ],
    "Moneycontrol": [
        "https://www.moneycontrol.com/rss/latestnews.xml",
        "https://www.moneycontrol.com/rss/marketreports.xml",
        "https://www.moneycontrol.com/rss/stockmarkets.xml",
    ],
    "Business Standard": [
        "https://www.business-standard.com/rss/markets-106.rss",
        "https://www.business-standard.com/rss/companies-101.rss",
    ],
    "CNBC TV18 India": [
        "https://www.cnbctv18.com/market/rss.xml",
        "https://www.cnbctv18.com/economy/rss.xml",
    ],
    "Financial Express": [
        "https://www.financialexpress.com/market/feed/",
        "https://www.financialexpress.com/industry/feed/",
    ],
    "The Hindu BusinessLine": [
        "https://www.thehindubusinessline.com/markets/?service=rss",
        "https://www.thehindubusinessline.com/companies/?service=rss",
    ],
    "NSE India": [
        "https://www.nseindia.com/rss-feed",
    ],
}

WORKING_SOURCES = {
    "Economic Times",
    "The Hindu BusinessLine",
}


def normalize_title(title):
    return " ".join((title or "").strip().lower().split())


def parse_feed_entries(source, url):
    started_at = time.perf_counter()
    request = Request(url, headers=REQUEST_HEADERS)

    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            feed_bytes = response.read()
        feed = feedparser.parse(feed_bytes)
    except (TimeoutError, URLError, OSError) as error:
        elapsed = time.perf_counter() - started_at
        print(f"  - Skipped {url} after {elapsed:.1f}s ({error})")
        return source, url, deque()

    entries = []

    for entry in getattr(feed, "entries", []):
        title = entry.get("title", "").strip()
        entries.append(
            {
                "title": title,
                "description": entry.get("summary", "").strip(),
                "link": entry.get("link", ""),
                "published_at": entry.get("published", ""),
                "source": source,
                "feed_url": url,
                "_normalized_title": normalize_title(title),
            }
        )

    elapsed = time.perf_counter() - started_at
    print(f"  - {url} -> {len(entries)} entries in {elapsed:.1f}s")
    return source, url, deque(entries)


def build_feed_queues():
    enabled_feeds = {
        source: urls
        for source, urls in RSS_FEEDS.items()
        if source in WORKING_SOURCES
    }
    queues = {source: deque() for source in enabled_feeds}

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_map = {}
        for source, urls in enabled_feeds.items():
            print(f"Fetching {source}...")
            for url in urls:
                future = executor.submit(parse_feed_entries, source, url)
                future_map[future] = (source, url)

        for future in as_completed(future_map):
            source, url = future_map[future]
            try:
                result_source, result_url, queue = future.result()
            except Exception as error:
                print(f"  - Skipped {url} ({error})")
                continue

            if queue:
                queues[result_source].append({"url": result_url, "entries": queue})

    return {source: feed_queues for source, feed_queues in queues.items() if feed_queues}


def select_articles_round_robin():
    source_queues = build_feed_queues()
    articles = []
    seen_titles = set()

    if not source_queues:
        return articles

    active_sources = deque(source_queues.keys())

    while active_sources and len(articles) < CANDIDATE_ARTICLES:
        source = active_sources.popleft()
        feeds = source_queues.get(source)

        if not feeds:
            continue

        selected_article = None
        feed_rotations = len(feeds)

        for _ in range(feed_rotations):
            feed_bucket = feeds.popleft()
            entries = feed_bucket["entries"]

            while entries:
                candidate = entries.popleft()
                title_key = candidate["_normalized_title"]
                if not title_key or title_key in seen_titles:
                    continue

                seen_titles.add(title_key)
                selected_article = candidate
                break

            if entries:
                feeds.append(feed_bucket)

            if selected_article:
                break

        if feeds:
            active_sources.append(source)

        if selected_article:
            selected_article.pop("_normalized_title", None)
            articles.append(selected_article)

    return articles


articles = select_articles_round_robin()

print(f"Total articles ingested: {len(articles)}")

with open("data/raw_news.json", "w", encoding="utf-8") as file:
    json.dump(articles, file, indent=2)
