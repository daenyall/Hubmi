from fastapi import APIRouter, HTTPException
from app.db.supabase import get_supabase_client
from app.models.schemas import MessageResponse

router = APIRouter()


@router.get("/hello", response_model=MessageResponse)
async def hello():
    return MessageResponse(
        message="Hello from Splot FastAPI Backend!",
        data={"version": "1.0.0", "hackathon": "HackYeah 2026"}
    )


@router.get("/supabase-test")
async def test_supabase():
    client = get_supabase_client()
    if not client:
        return {
            "status": "not_configured",
            "message": "Supabase credentials are not set in .env. Please configure SUPABASE_URL and SUPABASE_KEY."
        }
    
    return {
        "status": "configured",
        "message": "Supabase client is configured and ready."
    }
