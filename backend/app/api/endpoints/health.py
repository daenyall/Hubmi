from fastapi import APIRouter
from app.core.config import settings
from app.db.supabase import get_supabase_client
from app.models.schemas import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    supabase = get_supabase_client()
    return HealthResponse(
        status="ok",
        app_name=settings.APP_NAME,
        environment=settings.ENVIRONMENT,
        supabase_connected=supabase is not None,
    )
