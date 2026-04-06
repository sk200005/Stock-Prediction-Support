from typing import List, Optional

from pydantic import BaseModel, Field


class ArticleAnalysis(BaseModel):
    company: str = "Unknown"
    sentiment: str = "neutral"
    impact: str = "Neutral"
    signal_score: int = 0
    confidence: float = 0.0
    summary: str = ""
    summary_source: Optional[str] = "fallback"


class Article(BaseModel):
    title: str
    description: str = ""
    link: str = ""
    published_at: str = ""
    source: str = "Unknown"
    analysis: ArticleAnalysis = Field(default_factory=ArticleAnalysis)


class ArticlesResponse(BaseModel):
    articles: List[Article]


class CompanySignal(BaseModel):
    company: str
    signal_strength: int


class CompanySignalsResponse(BaseModel):
    company_signals: List[CompanySignal]


class CompanyMention(BaseModel):
    company: str
    mentions: int


class CompanyMentionsResponse(BaseModel):
    mentions: List[CompanyMention]

