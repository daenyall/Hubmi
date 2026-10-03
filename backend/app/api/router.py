from fastapi import APIRouter
from app.api.endpoints import health, example, match, middleman

api_router = APIRouter()

api_router.include_router(health.router, tags=["Health"])
api_router.include_router(match.router, tags=["Matchmaking"])
api_router.include_router(middleman.router, tags=["Middleman AI"])
api_router.include_router(example.router, prefix="/example", tags=["Example"])
