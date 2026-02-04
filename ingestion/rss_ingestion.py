import feedparser
import json
from datetime import datetime

RSS_FEEDS = [
    "https://www.moneycontrol.com/rss/latestnews.xml",
    "https://economictimes.indiatimes.com/rssfeedsdefault.cms"
]

articles = []

for url in RSS_FEEDS:
    feed = feedparser.parse(url)
    for entry in feed.entries:
        articles.append({
            "title": entry.get("title", ""),
            "description": entry.get("summary", ""),
            "link": entry.get("link", ""),
            "published_at": entry.get("published", ""),
            "source": feed.feed.get("title", "")
        })

with open("data/raw_news.json", "w", encoding="utf-8") as f:
    json.dump(articles, f, indent=2)

print(f"Saved {len(articles)} articles")
