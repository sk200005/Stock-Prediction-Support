from pydantic import BaseModel


class StatsResponse(BaseModel):
    total_articles: int
    bullish_count: int
    bearish_count: int
    neutral_count: int
    unique_companies: int


class ImpactDistributionResponse(BaseModel):
    bullish: int
    bearish: int
    neutral: int


class PipelineLog(BaseModel):
    command: str
    stdout: str = ""
    stderr: str = ""
    returncode: int


class PipelineRunResponse(BaseModel):
    success: bool
    logs: list[PipelineLog]
    new_articles_added: int = 0
    total_articles: int = 0
    message: str = ""


class SentimentTrendPoint(BaseModel):
    time: str
    avg_sentiment: float


class NewsImpactPoint(BaseModel):
    company: str
    sentiment_score: float
    price_change_percent: float
    impact_score: float
    published_at: str = ""


class CompanySentimentPoint(BaseModel):
    company: str
    avg_sentiment: float
    articles: int


class CompanySentimentTrendPoint(BaseModel):
    company: str
    time: str
    avg_sentiment: float


class SentimentAnalyticsResponse(BaseModel):
    sentiment_trend: list[SentimentTrendPoint]
    news_impact: list[NewsImpactPoint]
    company_sentiment: list[CompanySentimentPoint]
    company_sentiment_trend: list[CompanySentimentTrendPoint]
    generated_at: str = ""
