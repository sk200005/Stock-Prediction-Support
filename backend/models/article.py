from typing import List, Optional

from pydantic import BaseModel, Field


class PriceData(BaseModel):
    current_price: Optional[float] = None
    percent_change: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None


class ArticleAnalysis(BaseModel):
    company: str = "Unknown"
    sentiment: str = "neutral"
    impact: str = "Neutral"
    signal_score: float = 0.0
    sentiment_score: float = 0.0
    event_score: float = 0.0
    price_movement_score: float = 0.0
    confidence: float = 0.0
    summary: str = ""
    summary_source: Optional[str] = "fallback"


class Article(BaseModel):
    title: str
    description: str = ""
    link: str = ""
    url: str = ""
    published_at: str = ""
    source: str = "Unknown"
    image: str = ""
    tickers: List[str] = Field(default_factory=list)
    companies: List[str] = Field(default_factory=list)
    company: str = "Unknown"
    summary: str = ""
    sentiment: str = "neutral"
    impact: str = "Neutral"
    signal_score: float = 0.0
    current_price: Optional[float] = None
    price_change_percent: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    price_data: PriceData = Field(default_factory=PriceData)
    analysis: ArticleAnalysis = Field(default_factory=ArticleAnalysis)


class ArticlesResponse(BaseModel):
    articles: List[Article]


class CompanySignal(BaseModel):
    company: str
    signal_strength: float


class CompanySignalsResponse(BaseModel):
    company_signals: List[CompanySignal]


class CompanyMention(BaseModel):
    company: str
    mentions: int


class CompanyMentionsResponse(BaseModel):
    mentions: List[CompanyMention]
