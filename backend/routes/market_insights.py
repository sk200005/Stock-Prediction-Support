from fastapi import APIRouter, HTTPException

from backend.services.market_insights import get_market_insights


router = APIRouter(tags=["market-insights"])


@router.get("/market-insights")
def read_market_insights() -> dict:
    try:
        return get_market_insights()
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
