import streamlit as st
import streamlit.components.v1 as components
import json
from datetime import datetime
from email.utils import parsedate_to_datetime
from html import escape
from pathlib import Path

# ---------------- PAGE CONFIG ----------------
st.set_page_config(
    page_title="Stock News Intelligence",
    layout="wide"
)

st.markdown(
    """
    <div style="
        text-align:center;
        font-family: 'Georgia', 'Times New Roman', serif;
        font-size:54px;
        font-weight:700;
        color:#ffffff;
        margin:10px 0 24px 0;
    ">
        Stock News Intelligence
    </div>
    """,
    unsafe_allow_html=True
)

# ---------------- LOAD DATA ----------------
BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR.parent / "output" / "processedArticles.json"

if not DATA_PATH.exists():
    st.error(f"processedArticles.json not found at {DATA_PATH}")
    st.stop()

with open(DATA_PATH, "r", encoding="utf-8") as f:
    articles = json.load(f)

if not articles:
    st.warning("No articles found.")
    st.stop()

# ---------------- FILTER STOCK NEWS ----------------
stock_articles = [
    a for a in articles
    if str(a.get("analysis", {}).get("is_stock_related")).lower() == "true"
]

if not stock_articles:
    st.warning("No stock-related news found.")
    st.stop()

# ---------------- SORT BY DATE (LATEST FIRST) ----------------
def parse_date(date_str):
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except:
        try:
            return parsedate_to_datetime(date_str)
        except:
            return datetime.min

stock_articles.sort(
    key=lambda x: parse_date(x.get("published_at", "")),
    reverse=True
)

# ---------------- HELPERS ----------------
def format_date(date_str):
    parsed = parse_date(date_str)
    if parsed == datetime.min:
        return date_str or "Unknown date"
    return parsed.strftime("%b %d, %Y %H:%M UTC")


def normalize_impact(raw):
    if not raw:
        return "Neutral"
    return str(raw).strip().capitalize()

# ---------------- SIDEBAR FILTERS ----------------
available_impacts = ["Bullish", "Bearish", "Neutral"]

with st.sidebar:
    st.header("Filters")
    st.markdown(
        """
        <style>
          section[data-testid="stSidebar"] * {
            font-size: 20px !important;
          }
        </style>
        """,
        unsafe_allow_html=True
    )
    impact_filter = st.selectbox(
        "Impact",
        options=["All"] + available_impacts,
        index=1
    )

def passes_filters(article):
    analysis = article.get("analysis", {})
    impact = normalize_impact(analysis.get("impact", "Neutral"))

    if impact_filter != "All" and impact != impact_filter:
        return False
    return True

stock_articles = [a for a in stock_articles if passes_filters(a)]

if not stock_articles:
    st.warning("No news found for the selected filters.")
    st.stop()

def estimate_card_height(text, base=300, per_120_chars=40, max_height=900):
    length = len(text or "")
    extra = (length // 120) * per_120_chars
    return min(base + extra, max_height)

# ---------------- RENDER NEWS CARDS ----------------
for idx, article in enumerate(stock_articles):
    analysis = article.get("analysis", {})

    title = escape(article.get("title", "") or "Untitled")
    source = escape(article.get("source", "Unknown") or "Unknown")
    published_at = format_date(article.get("published_at", ""))
    summary = escape(analysis.get("summary", "") or "No summary available.")
    impact = normalize_impact(analysis.get("impact", "Neutral"))
    link = article.get("link", "#") or "#"
    safe_link = link if str(link).startswith(("http://", "https://")) else "#"

    # Impact indicator
    if impact == "Bullish":
        impact_icon = "▲"
        impact_color = "#2ddf6e"
    elif impact == "Bearish":
        impact_icon = "▼"
        impact_color = "#ff5c2a"
    else:
        impact_icon = "●"
        impact_color = "#c9c9c9"

    html = f"""
    <div style="
        background-color:#1f2c4e;
        padding:36px 42px;
        border-radius:48px;
        margin-bottom:28px;
        color:#efe7d8;
        box-sizing:border-box;
        font-family: 'Georgia', 'Times New Roman', serif;
        overflow:hidden;
    ">
      <div style="
          display:flex;
          justify-content:space-between;
          gap:32px;
          align-items:stretch;
      ">

              <!-- LEFT CONTENT -->
              <div style="width:74%;">
                  <h2 style="
                      margin:0 0 18px 0;
                      font-size:40px;
                      line-height:1.2;
                      font-weight:700;
                  ">
                      {title}
                  </h2>

                  <p style="
                      opacity:0.7;
                      font-size:18px;
                      margin:0 0 28px 0;
                      font-family: 'Georgia', 'Times New Roman', serif;
                  ">
                      {source} | {published_at}
                  </p>

                  <p style="
                      font-size:22px;
                      margin:0;
                      line-height:1.55;
                      color:#d9c4a3;
                  ">
                      <span style="font-weight:700;">Summary :</span> {summary}
                  </p>
              </div>

              <!-- RIGHT INDICATORS -->
              <div style="
                  width:22%;
                  display:flex;
                  flex-direction:column;
                  justify-content:center;
                  align-items:center;
                  font-size:30px;
                  font-weight:700;
                  text-align:center;
                  gap:26px;
              ">
                  <div style="
                      display:flex;
                      align-items:center;
                      gap:12px;
                      color:{impact_color};
                      font-size:34px;
                  ">
                      <span style="font-size:40px; line-height:1;">{impact_icon}</span>
                      <span style="color:#f4f1ea; font-size:30px;">{impact}</span>
                  </div>

                  <a href="{safe_link}"
                     target="_blank"
                     style="
                          color:#7aa4ff;
                          text-decoration:underline;
                          font-size:26px;
                          font-family: 'Courier New', Courier, monospace;
                     ">
                     Open Article
                  </a>
              </div>

      </div>
    </div>
    """

    card_height = estimate_card_height(summary)
    components.html(html, height=card_height, scrolling=True)
