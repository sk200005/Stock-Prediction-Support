from collections import Counter, defaultdict
from typing import Dict, List


def _normalize_impact(value: str) -> str:
    normalized = str(value or "Neutral").strip().capitalize()
    if normalized not in {"Bullish", "Bearish", "Neutral"}:
        return "Neutral"
    return normalized


def compute_stats(articles: List[dict]) -> Dict[str, int]:
    bullish_count = 0
    bearish_count = 0
    neutral_count = 0
    unique_companies = set()

    for article in articles:
        analysis = article.get("analysis", {})
        impact = _normalize_impact(analysis.get("impact"))
        company = analysis.get("company", "Unknown")

        if impact == "Bullish":
            bullish_count += 1
        elif impact == "Bearish":
            bearish_count += 1
        else:
            neutral_count += 1

        if company and company != "Unknown":
            unique_companies.add(company)

    return {
        "total_articles": len(articles),
        "bullish_count": bullish_count,
        "bearish_count": bearish_count,
        "neutral_count": neutral_count,
        "unique_companies": len(unique_companies),
    }


def compute_company_signals(articles: List[dict]) -> List[Dict[str, int]]:
    signal_totals = defaultdict(int)

    for article in articles:
        analysis = article.get("analysis", {})
        company = analysis.get("company", "Unknown")
        if not company or company == "Unknown":
            continue

        signal_totals[company] += int(analysis.get("signal_score", 0) or 0)

    return sorted(
        (
            {"company": company, "signal_strength": signal_strength}
            for company, signal_strength in signal_totals.items()
        ),
        key=lambda item: item["signal_strength"],
        reverse=True,
    )


def compute_mentions(articles: List[dict]) -> List[Dict[str, int]]:
    mention_counter = Counter()

    for article in articles:
        company = article.get("analysis", {}).get("company", "Unknown")
        if company and company != "Unknown":
            mention_counter[company] += 1

    return [
        {"company": company, "mentions": mentions}
        for company, mentions in mention_counter.most_common()
    ]


def compute_impact_distribution(articles: List[dict]) -> Dict[str, int]:
    distribution = {"bullish": 0, "bearish": 0, "neutral": 0}

    for article in articles:
        impact = _normalize_impact(article.get("analysis", {}).get("impact"))
        distribution[impact.lower()] += 1

    return distribution

