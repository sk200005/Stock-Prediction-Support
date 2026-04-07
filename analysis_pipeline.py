import json
import os
import sys
from collections import Counter, defaultdict

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None


FINBERT_MODEL_NAME = "ProsusAI/finbert"
SENTIMENT_LABELS = ["negative", "neutral", "positive"]
SUMMARY_ENABLED = os.getenv("USE_GEMINI_SUMMARY", "false").lower() == "true"
SUMMARY_MODEL = os.getenv("GEMINI_SUMMARY_MODEL", "gemini-2.0-flash")
POSITIVE_EVENT_PATTERNS = {
    "contract_award": {
        "weight": 1.0,
        "terms": {
            "agreement",
            "contract",
            "deal",
            "multi-year",
            "order",
            "signed",
            "signs",
            "supply agreement",
            "supply deal",
            "wins contract",
        },
    },
    "partnership": {
        "weight": 0.95,
        "terms": {
            "collaboration",
            "joint venture",
            "partnership",
            "partnered",
            "partners with",
            "strategic alliance",
        },
    },
    "product_and_expansion": {
        "weight": 0.8,
        "terms": {
            "accelerator",
            "expands",
            "exclusive",
            "infrastructure agreement",
            "launch",
            "launches",
            "next generation",
            "rollout",
            "scale up",
            "upgrade",
        },
    },
    "financial_strength": {
        "weight": 1.0,
        "terms": {
            "acquisition",
            "beat estimates",
            "beats estimates",
            "buyback",
            "dividend increase",
            "growth",
            "guidance raise",
            "margin expansion",
            "profit",
            "record revenue",
            "surge",
        },
    },
}
NEGATIVE_EVENT_PATTERNS = {
    "legal_and_regulatory": {
        "weight": -1.0,
        "terms": {
            "antitrust",
            "fine",
            "fraud",
            "investigation",
            "lawsuit",
            "probe",
            "regulatory scrutiny",
            "settlement",
        },
    },
    "financial_weakness": {
        "weight": -1.0,
        "terms": {
            "bankruptcy",
            "cuts guidance",
            "decline",
            "downgrade",
            "loss",
            "misses estimates",
            "miss estimate",
            "profit warning",
            "slump",
            "warning",
        },
    },
    "operations_risk": {
        "weight": -0.9,
        "terms": {
            "layoff",
            "layoffs",
            "plunge",
            "recall",
            "shutdown",
            "strike",
            "supply disruption",
        },
    },
}
CONTEXTUAL_POSITIVE_PHRASES = {
    "ai deal",
    "custom chip",
    "customer win",
    "deepen partnership",
    "long-term agreement",
    "through 2031",
}
CONTEXTUAL_NEGATIVE_PHRASES = {
    "community opposition",
    "cost overrun",
    "demand slowdown",
    "shareholder pressure",
}
MISLEADING_NEGATIVE_TERMS = {
    "reliance",
    "dependency",
    "concern",
}


print("Loading NLP models...", file=sys.stderr)
TOKENIZER = AutoTokenizer.from_pretrained(FINBERT_MODEL_NAME)
FINBERT_MODEL = AutoModelForSequenceClassification.from_pretrained(FINBERT_MODEL_NAME)


def clean_text(value):
    if value is None:
        return ""
    return str(value).replace("\n", " ").strip()


def extract_company(article_tickers):
    return article_tickers[0] if article_tickers else "Unknown"


def predict_sentiment(text):
    inputs = TOKENIZER(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=512
    )
    with torch.no_grad():
        outputs = FINBERT_MODEL(**inputs)
        probabilities = torch.nn.functional.softmax(outputs.logits, dim=-1)[0]

    predicted_class = int(torch.argmax(probabilities).item())
    confidence = float(probabilities[predicted_class].item())
    return SENTIMENT_LABELS[predicted_class], confidence


def classify_impact(weighted_signal_score):
    if weighted_signal_score >= 0.25:
        return "Bullish"
    if weighted_signal_score <= -0.25:
        return "Bearish"
    return "Neutral"


def compute_sentiment_score(sentiment, confidence):
    polarity = {
        "positive": 1.0,
        "neutral": 0.0,
        "negative": -1.0
    }.get(sentiment, 0.0)
    return polarity * confidence


def _pattern_score(text, pattern_groups):
    matched_groups = []
    score = 0.0

    for group_name, config in pattern_groups.items():
        matches = [term for term in config["terms"] if term in text]
        if not matches:
            continue
        score += config["weight"] * min(1.0, 0.35 * len(matches) + 0.35)
        matched_groups.append({"name": group_name, "terms": matches})

    return score, matched_groups


def compute_event_score(text):
    lowered = text.lower()
    positive_score, positive_matches = _pattern_score(lowered, POSITIVE_EVENT_PATTERNS)
    negative_score, negative_matches = _pattern_score(lowered, NEGATIVE_EVENT_PATTERNS)

    contextual_positive = [term for term in CONTEXTUAL_POSITIVE_PHRASES if term in lowered]
    contextual_negative = [term for term in CONTEXTUAL_NEGATIVE_PHRASES if term in lowered]

    raw_score = positive_score + negative_score
    if contextual_positive:
        raw_score += 0.25
    if contextual_negative:
        raw_score -= 0.25

    return max(-1.0, min(1.0, raw_score)), {
        "positive_matches": positive_matches,
        "negative_matches": negative_matches,
        "contextual_positive": contextual_positive,
        "contextual_negative": contextual_negative,
    }


def compute_price_movement_score(price_change_percent):
    if price_change_percent is None:
        return 0.0

    try:
        change = float(price_change_percent)
    except (TypeError, ValueError):
        return 0.0

    if change > 5:
        return 1.0
    if change < -5:
        return -1.0
    return max(-1.0, min(1.0, change / 5.0))


def adjust_sentiment_score(sentiment, confidence, event_score, text):
    sentiment_score = compute_sentiment_score(sentiment, confidence)
    lowered = text.lower()
    misleading_negative_count = sum(term in lowered for term in MISLEADING_NEGATIVE_TERMS)

    # If FinBERT is negative but the article is clearly a positive business event,
    # reduce the penalty so deal/partnership headlines do not flip bearish.
    if sentiment == "negative" and event_score >= 0.65:
        sentiment_score = max(sentiment_score, -0.12)

    # Strong negative events should also cap accidental positive model drift.
    if sentiment == "positive" and event_score <= -0.65:
        sentiment_score = min(sentiment_score, 0.12)

    if misleading_negative_count and event_score > 0:
        sentiment_score += min(0.08 * misleading_negative_count, 0.16)

    return max(-1.0, min(1.0, sentiment_score))


def derive_display_sentiment(sentiment_score, event_score):
    if event_score >= 0.7 and sentiment_score > -0.2:
        return "positive"
    if event_score <= -0.7 and sentiment_score < 0.2:
        return "negative"
    if sentiment_score >= 0.2:
        return "positive"
    if sentiment_score <= -0.2:
        return "negative"
    return "neutral"


def compute_signal_score(sentiment_score, event_score, price_score):
    weighted_score = 0.25 * sentiment_score + 0.65 * event_score + 0.1 * price_score
    return round(weighted_score, 4)


def summarize_text(text):
    if not SUMMARY_ENABLED:
        return ""

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or OpenAI is None:
        return ""

    try:
        client = OpenAI(
            api_key=api_key,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
        )
        response = client.responses.create(
            model=SUMMARY_MODEL,
            input=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": (
                                "Summarize this financial news article in 1-2 concise sentences. "
                                "Focus on the company and market implication.\n\n"
                                f"{text[:3000]}"
                            )
                        }
                    ]
                }
            ]
        )
        return clean_text(response.output_text)
    except Exception:
        return ""


def analyze_article(article):
    title = clean_text(article.get("title"))
    description = clean_text(article.get("description"))
    article_tickers = [
        clean_text(ticker).upper()
        for ticker in article.get("tickers", [])
        if clean_text(ticker)
    ]
    combined_text = " ".join(part for part in [title, description] if part).strip()

    if not combined_text:
        return {
            "company": extract_company(article_tickers),
            "sentiment": "neutral",
            "impact": "Neutral",
            "signal_score": 0.0,
            "sentiment_score": 0.0,
            "event_score": 0.0,
            "price_movement_score": 0.0,
            "confidence": 0.0,
            "summary": "",
            "summary_source": "fallback"
        }

    company = extract_company(article_tickers)
    sentiment, confidence = predict_sentiment(combined_text)
    event_score, event_details = compute_event_score(combined_text)
    sentiment_score = adjust_sentiment_score(sentiment, confidence, event_score, combined_text)
    display_sentiment = derive_display_sentiment(sentiment_score, event_score)
    price_score = compute_price_movement_score(article.get("price_change_percent"))
    signal_score = compute_signal_score(sentiment_score, event_score, price_score)
    impact = classify_impact(signal_score)
    summary = summarize_text(combined_text)
    summary_source = "gemini" if summary else "fallback"

    if not summary:
        fallback_source = description or title
        summary = " ".join(fallback_source.split()[:40])
        summary_source = "fallback"

    return {
        "company": company,
        "sentiment": display_sentiment,
        "impact": impact,
        "signal_score": signal_score,
        "sentiment_score": round(sentiment_score, 4),
        "event_score": round(event_score, 4),
        "price_movement_score": round(price_score, 4),
        "confidence": round(confidence, 4),
        "model_sentiment": sentiment,
        "event_details": event_details,
        "summary": summary,
        "summary_source": summary_source
    }


def compute_aggregates(articles):
    mention_counter = Counter()
    signal_strength = defaultdict(float)
    impact_distribution = {
        "bullish": 0,
        "bearish": 0,
        "neutral": 0
    }

    for article in articles:
        analysis = article.get("analysis", {})
        company = article.get("company") or analysis.get("company", "Unknown")
        impact = str(analysis.get("impact", "Neutral")).lower()
        score = float(analysis.get("signal_score", 0) or 0)

        if company and company != "Unknown":
            mention_counter[company] += 1
            signal_strength[company] += score

        if impact in impact_distribution:
            impact_distribution[impact] += 1
        else:
            impact_distribution["neutral"] += 1

    company_mentions = [
        {"company": company, "mentions": mentions}
        for company, mentions in mention_counter.most_common()
    ]

    company_signal_strength = sorted(
        (
            {"company": company, "signal_strength": round(strength, 4)}
            for company, strength in signal_strength.items()
        ),
        key=lambda item: item["signal_strength"],
        reverse=True
    )

    return {
        "company_mentions": company_mentions,
        "company_signal_strength": company_signal_strength,
        "impact_distribution": impact_distribution
    }


def build_response(raw_articles):
    enriched_articles = []
    for article in raw_articles:
        analysis = analyze_article(article)
        tickers = article.get("tickers", [])
        price_data = article.get("price_data") or {
            "current_price": article.get("current_price"),
            "percent_change": article.get("price_change_percent"),
            "high": article.get("high"),
            "low": article.get("low"),
        }

        enriched_articles.append(
            {
                "title": article.get("title", ""),
                "description": article.get("description", ""),
                "source": article.get("source", "Unknown"),
                "published_at": article.get("published_at", ""),
                "tickers": tickers,
                "company": analysis.get("company", "Unknown"),
                "summary": analysis.get("summary") or article.get("description", ""),
                "sentiment": analysis.get("sentiment", "neutral"),
                "impact": analysis.get("impact", "Neutral"),
                "signal_score": analysis.get("signal_score", 0.0),
                "price_change_percent": price_data.get("percent_change"),
                "price_data": price_data,
                "image": article.get("image", ""),
                "url": article.get("url") or article.get("link", ""),
                "link": article.get("link") or article.get("url", ""),
                "analysis": analysis
            }
        )

    return {
        "articles": enriched_articles,
        "aggregates": compute_aggregates(enriched_articles)
    }


def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        raw_articles = payload.get("articles", [])
        result = build_response(raw_articles)
        sys.stdout.write(json.dumps(result))
    except Exception as exc:  # pragma: no cover - command line error path
        error_payload = {
            "error": str(exc)
        }
        sys.stdout.write(json.dumps(error_payload))
        sys.exit(1)


if __name__ == "__main__":
    main()
