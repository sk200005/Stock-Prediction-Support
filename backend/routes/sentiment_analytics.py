from fastapi import APIRouter, HTTPException

from backend.models.stats import SentimentAnalyticsResponse
from backend.services.sentiment_analytics import get_sentiment_analytics


router = APIRouter(tags=["sentiment-analytics"])


@router.get("/sentiment-analytics", response_model=SentimentAnalyticsResponse)
def read_sentiment_analytics() -> SentimentAnalyticsResponse:
    try:
        return SentimentAnalyticsResponse(**get_sentiment_analytics())
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
