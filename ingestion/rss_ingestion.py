import feedparser
import json

ARTICLES_PER_SOURCE = 10

RSS_FEEDS = {
    "Livemint": [
        "https://www.livemint.com/rss/companies",
        "https://www.livemint.com/rss/industry",
        "https://www.livemint.com/rss/markets"
    ],
    
    "Moneycontrol": [
        "https://www.moneycontrol.com/rss/latestnews.xml",
        "https://www.moneycontrol.com/rss/marketreports.xml",
        "https://www.moneycontrol.com/rss/stockmarkets.xml"
    ],
    "Economic Times": [
        "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
        "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms"
    ]
    
}

articles = []

for source, urls in RSS_FEEDS.items():
    count = 0

    for url in urls:
        if count >= ARTICLES_PER_SOURCE:
            break

        feed = feedparser.parse(url)

        for entry in feed.entries:
            if count >= ARTICLES_PER_SOURCE:
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
