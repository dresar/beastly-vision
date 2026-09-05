"""
Models Router — Simplified single-model endpoints.
GET  /models/       — Show supported model (yolov8n.pt)
POST /models/switch — Kept for compatibility, only accepts yolov8n.pt
GET  /models/active — Get active model info
"""

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

router = APIRouter()


class SwitchModelRequest(BaseModel):
    model_path: str  # Simplified mode supports only "yolov8n.pt"


@router.get("/")
async def list_models(request: Request):
    """List supported model in simplified mode."""
    yolo = request.app.state.yolo
    models = yolo.list_available_models()
    return {"models": models, "active": yolo.model_name}


@router.get("/active")
async def get_active_model(request: Request):
    """Get information about the currently active model."""
    yolo = request.app.state.yolo
    return yolo.get_model_info()


@router.post("/switch")
async def switch_model(request: Request, body: SwitchModelRequest):
    """Compatibility endpoint; only yolov8n.pt is allowed."""
    yolo = request.app.state.yolo
    try:
        if body.model_path != "yolov8n.pt":
            raise HTTPException(400, "Only yolov8n.pt is allowed in simplified mode")
        await yolo.load_model(body.model_path)
        return {
            "success": True,
            "message": f"Switched to model: {body.model_path}",
            "model_info": yolo.get_model_info(),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to switch model: {e}")
