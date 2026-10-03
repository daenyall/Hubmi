from fastapi import APIRouter
from app.api.endpoints import health, example

api_router = APIRouter()

api_router.include_router(health.router, tags=["Health"])
api_router.include_router(example.router, prefix="/example", tags=["Example"])
