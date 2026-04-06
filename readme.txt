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





import streamlit as st
import json
import os

# Function to load the processed articles
def load_data():
    file_path = 'output/processedArticles.json'
    if os.path.exists(file_path):
        with open(file_path, 'r') as f:
            return json.load(f)
    return []

# App Configuration
st.set_page_config(page_title="Company Signals", layout="wide")

st.title("🗞️ Company Signals & Sentiment Analysis")
st.markdown("---")

data = load_data()

if not data:
    st.warning("No processed articles found. Please run 'node index.js' first.")
else:
    for article in data:
        # Create a container with a border for each news "box"
        with st.container(border=True):
            # Create two columns: col1 for the image, col2 for the text content
            # Ratio [1, 4] ensures the image stays small and relevant
            col1, col2 = st.columns([1, 4])
            
            with col1:
                # Use the breaking news image from the URL provided
                # Streamlit automatically handles the resizing to fit the column width
                st.image(
                    "https://img.freepik.com/free-vector/breaking-news-concept_23-2148514216.jpg", 
                    use_container_width=True
                )
            
            with col2:
                # Title and Link
                st.subheader(article.get('title', 'No Title'))
                
                # Metadata row: Sentiment and Ticker
                sentiment = article.get('sentiment', 0)
                ticker = article.get('ticker', 'N/A')
                
                # Dynamic sentiment coloring
                if sentiment > 0.2:
                    sentiment_display = f":green[Positive ({sentiment})]"
                elif sentiment < -0.2:
                    sentiment_display = f":red[Negative ({sentiment})]"
                else:
                    sentiment_display = f":gray[Neutral ({sentiment})]"
                
                st.markdown(f"**Ticker:** `{ticker}` | **Sentiment:** {sentiment_display}")
                
                # Impact analysis description
                impact = article.get('impact', 'No impact analysis available.')
                st.write(impact)
                
                # Link to original article
                if 'link' in article:
                    st.link_button("Read Full Article", article['link'])

        # Add a small space between containers
        st.write("")

# Sidebar for filters or stats
st.sidebar.header("Dashboard Controls")
if data:
    st.sidebar.write(f"Total Articles Processed: {len(data)}")
    if st.sidebar.button("Clear Cache"):
        st.cache_data.clear()