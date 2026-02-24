import streamlit as st
import streamlit.components.v1 as components
import json
from datetime import datetime
from email.utils import parsedate_to_datetime
from html import escape
from pathlib import Path

st.set_page_config(
    page_title="Company Signals",
    layout="wide"
)

st.markdown(
    """
    <div style="
        text-align:center;
        font-family: 'Georgia', 'Times New Roman', serif;
        font-size:48px;
        font-weight:700;
        color:#ffffff;
        margin:10px 0 24px 0;
    ">
        Company Signals
    </div>
    """,
    unsafe_allow_html=True
)

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR.parent.parent / "output" / "processedArticles.json"

if not DATA_PATH.exists():
    st.error(f"processedArticles.json not found at {DATA_PATH}")
    st.stop()

with open(DATA_PATH, "r", encoding="utf-8") as f:
    articles = json.load(f)

if not articles:
    st.warning("No articles found.")
    st.stop()

def parse_date(date_str):
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except:
        try:
            return parsedate_to_datetime(date_str)
        except:
            return datetime.min

def normalize_impact(raw):
    if not raw:
        return "Neutral"
    return str(raw).strip().capitalize()

stock_articles = [
    a for a in articles
    if str(a.get("analysis", {}).get("is_stock_related")).lower() == "true"
]

if not stock_articles:
    st.warning("No stock-related news found.")
    st.stop()

stock_articles.sort(
    key=lambda x: parse_date(x.get("published_at", "")),
    reverse=True
)

def impact_styles(impact):
    if impact == "Bullish":
        return "▲", "#2ddf6e"
    if impact == "Bearish":
        return "▼", "#ff5c2a"
    return "●", "#c9c9c9"

for article in stock_articles:
    analysis = article.get("analysis", {})
    company = escape(analysis.get("company", "Unknown") or "Unknown")
    impact = normalize_impact(analysis.get("impact", "Neutral"))
    icon, color = impact_styles(impact)

    html = f"""
    <div style="
        max-width:880px;
        margin:0 auto 18px auto;
        background-color:#1f2c4e;
        padding:18px 24px;
        border-radius:20px;
        color:#efe7d8;
        font-family: 'Georgia', 'Times New Roman', serif;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:16px;
        box-sizing:border-box;
    ">
      <div style="
          font-size:22px;
          font-weight:700;
          color:#f4f1ea;
          text-align:left;
          flex:1;
      ">
        {company}
      </div>
      <div style="
          display:flex;
          align-items:center;
          gap:10px;
          font-size:22px;
          font-weight:700;
          color:{color};
          white-space:nowrap;
      ">
        <span style="font-size:26px; line-height:1;">{icon}</span>
        <span style="color:#f4f1ea;">{impact}</span>
      </div>
    </div>
    """

    components.html(html, height=80, scrolling=False)
