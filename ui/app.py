import streamlit as st
import json
from datetime import datetime
from pathlib import Path

# ---------------- Page config ----------------
st.set_page_config(
    page_title="Stock News Intelligence",
    layout="wide"
)

st.title("📈 Stock News Intelligence")

# ---------------- Load data ----------------
BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR.parent / "output" / "processedArticles.json"

if not DATA_PATH.exists():
    st.error(f"File not found: {DATA_PATH}")
    st.stop()

with open(DATA_PATH, "r", encoding="utf-8") as f:
    articles = json.load(f)

if not articles:
    st.info("No articles available.")
    st.stop()

# ---------------- Filter stock-related ----------------
stock_articles = [
    a for a in articles
    if str(a.get("analysis", {}).get("is_stock_related")).lower() == "true"
]

if not stock_articles:
    st.warning("No stock-related news found.")
    st.stop()

# ---------------- Sort by date (latest first) ----------------
def parse_date(date_str):
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except:
        return datetime.min

stock_articles.sort(
    key=lambda x: parse_date(x.get("published_at", "")),
    reverse=True
)

# ---------------- Display articles ----------------
for article in stock_articles:
    analysis = article.get("analysis", {})

    with st.container():
        # Title
        st.subheader(article.get("title", "No title"))

        # Meta
        st.caption(
            f"{article.get('source', 'Unknown source')} | "
            f"{article.get('published_at', 'Unknown date')}"
        )

        # Sentiment & Impact
        col1, col2 = st.columns(2)
        with col1:
            st.markdown(f"**Sentiment:** {analysis.get('sentiment', 'N/A')}")
        with col2:
            st.markdown(f"**Impact:** {analysis.get('impact', 'N/A')}")

        # Summary
        st.write(analysis.get("summary", ""))

        # Article link
        st.markdown(f"[Read full article]({article.get('link', '#')})")

        st.divider()
