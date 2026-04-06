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
