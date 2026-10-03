from typing import Optional, Any, Dict
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"
    app_name: str
    environment: str
    supabase_connected: bool


class MessageResponse(BaseModel):
    message: str
    data: Optional[Dict[str, Any]] = None
