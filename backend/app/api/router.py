from fastapi import APIRouter
from app.api.endpoints import (
    health,
    example,
    match,
    middleman,
    innovations,
    admin,
    submissions,
    testing,
    needs,
    grant_applications,
    knowledge_resources,
)

api_router = APIRouter()

api_router.include_router(health.router, tags=["Health"])
api_router.include_router(match.router, tags=["Matchmaking"])
api_router.include_router(innovations.router, tags=["Innovations"])
api_router.include_router(middleman.router, tags=["Middleman AI"])
api_router.include_router(admin.router, tags=["Admin ROPS"])
api_router.include_router(submissions.router, tags=["Submissions"])
api_router.include_router(testing.router, tags=["Innovation Testing"])
api_router.include_router(needs.router, tags=["Community Needs"])
api_router.include_router(needs.admin_router, tags=["Admin ROPS Needs"])
api_router.include_router(grant_applications.calls_router, tags=["Grant Calls"])
api_router.include_router(grant_applications.applications_router, tags=["Grant Applications"])
api_router.include_router(grant_applications.admin_grant_router, tags=["Admin Grant Applications"])
api_router.include_router(grant_applications.admin_calls_router, tags=["Admin Grant Calls"])
api_router.include_router(knowledge_resources.router, tags=["Knowledge Resources"])
api_router.include_router(knowledge_resources.admin_router, tags=["Admin Knowledge Resources"])
api_router.include_router(example.router, prefix="/example", tags=["Example"])



