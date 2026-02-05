streamlit run ui/app.py
node index.js
ollama serve 
python ingestion/rss_ingestion.py


    "Moneycontrol": [
        "https://www.moneycontrol.com/rss/latestnews.xml",
        "https://www.moneycontrol.com/rss/marketreports.xml",
        "https://www.moneycontrol.com/rss/stockmarkets.xml"
    ],
    "Economic Times": [
        "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
        "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms"
    ],
    "Reuters": [
        "https://feeds.reuters.com/reuters/INbusinessNews",
        "https://feeds.reuters.com/reuters/INmarketsNews"
    ],
    "Livemint": [
        "https://www.livemint.com/rss/markets",
        "https://www.livemint.com/rss/companies"
    ]
}