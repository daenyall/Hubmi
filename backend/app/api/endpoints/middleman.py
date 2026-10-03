from fastapi import APIRouter, HTTPException
from app.models.schemas import AdaptRequest, AdaptResponse
from app.services.ai import generate_adaptation_plan

router = APIRouter()


@router.post("/adapt", response_model=AdaptResponse)
async def adapt_innovation(request: AdaptRequest):
    """
    Moduł Middleman Innowacji (Asystent AI):
    Dostosowuje wybraną innowację społeczną ROPS do lokalnych uwarunkowań,
    budżetu i zasobów zgłaszającej się gminy/instytucji.
    """
    if not request.municipality_context or len(request.municipality_context.strip()) < 5:
        raise HTTPException(
            status_code=400,
            detail="Podaj szerszy kontekst gminy/instytucji (min. 5 znaków)."
        )

    plan_result = generate_adaptation_plan(
        innovation_title=request.innovation_title,
        innovation_desc=request.innovation_description or "",
        context=request.municipality_context,
        municipality_type=request.municipality_type,
        budget_range=request.budget_range,
        time_horizon=request.time_horizon,
        key_partners=request.key_partners,
    )

    return AdaptResponse(
        innovation_title=request.innovation_title,
        adaptation_plan=plan_result["adaptation_plan"],
        estimated_budget_pln=plan_result.get("estimated_budget_pln"),
        recommended_grants=plan_result.get("recommended_grants"),
        key_kpis=plan_result.get("key_kpis"),
    )
