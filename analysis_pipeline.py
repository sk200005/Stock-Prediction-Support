import json
import os
import sys
from collections import Counter, defaultdict

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

try:
    import spacy
except ImportError as exc:  # pragma: no cover - dependency error path
    raise RuntimeError(
        "spaCy is required for analysis_pipeline.py. Install it with: pip install spacy"
    ) from exc

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None


FINBERT_MODEL_NAME = "ProsusAI/finbert"
SENTIMENT_LABELS = ["negative", "neutral", "positive"]
SUMMARY_ENABLED = os.getenv("USE_GEMINI_SUMMARY", "false").lower() == "true"
SUMMARY_MODEL = os.getenv("GEMINI_SUMMARY_MODEL", "gemini-2.0-flash")


def load_spacy_model():
    try:
        return spacy.load("en_core_web_sm")
    except OSError as exc:  # pragma: no cover - dependency error path
        raise RuntimeError(
            "spaCy model 'en_core_web_sm' is missing. Run: python -m spacy download en_core_web_sm"
        ) from exc


print("Loading NLP models...", file=sys.stderr)
TOKENIZER = AutoTokenizer.from_pretrained(FINBERT_MODEL_NAME)
FINBERT_MODEL = AutoModelForSequenceClassification.from_pretrained(FINBERT_MODEL_NAME)
NLP = load_spacy_model()


def clean_text(value):
    if value is None:
        return ""
    return str(value).replace("\n", " ").strip()


def extract_company(text):
    doc = NLP(text)
    companies = [ent.text.strip() for ent in doc.ents if ent.label_ == "ORG"]
    if companies:
        return companies[0]
    return "Unknown"


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


def classify_impact(sentiment):
    if sentiment == "positive":
        return "Bullish"
    if sentiment == "negative":
        return "Bearish"
    return "Neutral"


def compute_signal_score(sentiment, impact):
    if impact == "Bullish" and sentiment == "positive":
        return 3
    if impact == "Bullish":
        return 2
    if impact == "Neutral":
        return 0
    if impact == "Bearish" and sentiment == "negative":
        return -3
    return -2


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
    combined_text = " ".join(part for part in [title, description] if part).strip()

    if not combined_text:
        return {
            "company": "Unknown",
            "sentiment": "neutral",
            "impact": "Neutral",
            "signal_score": 0,
            "confidence": 0.0,
            "summary": ""
        }

    company = extract_company(combined_text)
    sentiment, confidence = predict_sentiment(combined_text)
    impact = classify_impact(sentiment)
    signal_score = compute_signal_score(sentiment, impact)
    summary = summarize_text(combined_text)
    summary_source = "gemini" if summary else "fallback"

    if not summary:
        summary_source = description or title
        summary = " ".join(summary_source.split()[:40])
        summary_source = "fallback"

    return {
        "company": company,
        "sentiment": sentiment,
        "impact": impact,
        "signal_score": signal_score,
        "confidence": round(confidence, 4),
        "summary": summary,
        "summary_source": summary_source
    }


def compute_aggregates(articles):
    mention_counter = Counter()
    signal_strength = defaultdict(int)
    impact_distribution = {
        "bullish": 0,
        "bearish": 0,
        "neutral": 0
    }

    for article in articles:
        analysis = article.get("analysis", {})
        company = analysis.get("company", "Unknown")
        impact = str(analysis.get("impact", "Neutral")).lower()
        score = int(analysis.get("signal_score", 0) or 0)

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
            {"company": company, "signal_strength": strength}
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
        enriched_articles.append({**article, "analysis": analysis})

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
