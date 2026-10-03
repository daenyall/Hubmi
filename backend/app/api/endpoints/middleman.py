from fastapi import APIRouter, HTTPException
import logging
from app.models.schemas import AdaptRequest, AdaptResponse
from app.services.ai import generate_adaptation_plan
from app.utils.sanitize import sanitize_text, safe_error_message

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/adapt", response_model=AdaptResponse)
async def adapt_innovation(request: AdaptRequest):
    """
    Moduł Middleman Innowacji (Asystent AI):
    Dostosowuje wybraną innowację społeczną ROPS do lokalnych uwarunkowań,
    budżetu i zasobów zgłaszającej się gminy/instytucji.
    """
    cleaned_context = sanitize_text(request.municipality_context) if request.municipality_context else ""
    if len(cleaned_context) < 5:
        raise HTTPException(
            status_code=400,
            detail="Podaj szerszy kontekst gminy/instytucji (min. 5 znaków)."
        )

    cleaned_title = sanitize_text(request.innovation_title) if request.innovation_title else ""
    cleaned_desc = sanitize_text(request.innovation_description) if request.innovation_description else ""

    try:
        plan_result = generate_adaptation_plan(
            innovation_title=cleaned_title,
            innovation_desc=cleaned_desc,
            context=cleaned_context,
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
            is_ai_generated=plan_result.get("is_ai_generated", False),
            generation_source=plan_result.get("generation_source", "template_fallback"),
            disclaimer=plan_result.get("disclaimer"),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Błąd generowania planu adaptacji: %s", e)
        raise HTTPException(
            status_code=500,
            detail=safe_error_message("plan adaptacji")
        )
