"""
Status Router — Service health and info.
GET /status/       — Overall service status
GET /status/health — Health check (for load balancers)
"""

import platform
import sys
from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/")
async def get_status(request: Request):
    """Get comprehensive service status."""
    yolo = request.app.state.yolo
    model_info = yolo.get_model_info()

    return {
        "service": "WildGuard AI Engine",
        "version": "2.0.0",
        "status": "online",
        "python": sys.version.split(" ")[0],
        "platform": platform.system(),
        "model": model_info,
    }


@router.get("/health")
async def health_check():
    """Simple health check for monitoring."""
    return {"status": "ok"}
