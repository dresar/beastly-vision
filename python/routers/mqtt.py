"""
MQTT Router — configuration and runtime control for MQTT bridge + Telegram alerts.
"""

from typing import Optional, List

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


class MQTTConfigPatch(BaseModel):
    enabled: Optional[bool] = None
    host: Optional[str] = None
    port: Optional[int] = Field(default=None, ge=1, le=65535)
    username: Optional[str] = None
    password: Optional[str] = None
    device_id: Optional[str] = None
    topic_prefix: Optional[str] = None
    telegram_enabled: Optional[bool] = None
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    alert_min_confidence: Optional[float] = Field(default=None, ge=0, le=1)
    alert_threat_only: Optional[bool] = None
    threat_labels: Optional[List[str]] = None


class TelegramTestBody(BaseModel):
    text: str = "Test pesan dari WildGuard MQTT Bridge"


@router.get("/status")
async def mqtt_status(request: Request):
    svc = getattr(request.app.state, "mqtt", None)
    if svc is None:
        return {"enabled": False, "status": "not_initialized"}
    return svc.get_status()


@router.get("/config")
async def get_mqtt_config(request: Request):
    svc = getattr(request.app.state, "mqtt", None)
    if svc is None:
        raise HTTPException(503, "MQTT service belum siap")
    return svc.get_config_safe()


@router.put("/config")
async def update_mqtt_config(request: Request, body: MQTTConfigPatch):
    svc = getattr(request.app.state, "mqtt", None)
    if svc is None:
        raise HTTPException(503, "MQTT service belum siap")

    patch = body.model_dump(exclude_none=True)
    await svc.update_config(patch)
    return {"success": True, "config": svc.get_config_safe()}


@router.post("/telegram/test")
async def telegram_test(request: Request, body: TelegramTestBody):
    svc = getattr(request.app.state, "mqtt", None)
    if svc is None:
        raise HTTPException(503, "MQTT service belum siap")
    try:
        await svc.send_telegram_message(body.text)
        return {"success": True}
    except Exception as exc:
        raise HTTPException(400, f"Gagal kirim Telegram: {exc}")
