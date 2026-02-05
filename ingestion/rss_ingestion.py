import feedparser
import json

ARTICLES_PER_SOURCE = {
    "Economic Times": 14,
    "Moneycontrol": 15
}

RSS_FEEDS = {

    
    "Economic Times": [
        "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
        "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms"
    ],

    "Moneycontrol": [
        "https://www.moneycontrol.com/rss/latestnews.xml",
        "https://www.moneycontrol.com/rss/marketreports.xml",
        "https://www.moneycontrol.com/rss/stockmarkets.xml"
    ]
    
}

articles = []

for source, urls in RSS_FEEDS.items():
    count = 0
    source_limit = ARTICLES_PER_SOURCE.get(source, 0)

    for url in urls:
        if count >= source_limit:
            break

        feed = feedparser.parse(url)

        for entry in feed.entries:
            if count >= source_limit:
                break

            articles.append({
                "title": entry.get("title", "").strip(),
                "description": entry.get("summary", "").strip(),
                "link": entry.get("link", ""),
                "published_at": entry.get("published", ""),
                "source": source
            })

            count += 1

print(f"Total articles ingested: {len(articles)}")

with open("data/raw_news.json", "w", encoding="utf-8") as f:
    json.dump(articles, f, indent=2)
