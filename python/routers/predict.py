"""
Predict Router — YOLOv8 inference endpoints.
POST /predict/image  — Upload an image and get detections
POST /predict/url    — Provide a URL and get detections
"""

import os
import uuid
import time
import aiofiles
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, UploadFile, File, Form, Request, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, HttpUrl

router = APIRouter()

UPLOADS_DIR = Path("uploads")
RESULTS_DIR = Path("results")
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


# ─── Schema ────────────────────────────────────────────────────────────────────

class UrlPredictRequest(BaseModel):
    url: str
    confidence: float = 0.25
    iou: float = 0.45


# ─── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/image")
async def predict_image(
    request: Request,
    file: UploadFile = File(...),
    confidence: float = Form(0.25),
    iou: float = Form(0.45),
):
    """
    Upload an image and run YOLO inference.
    Returns bounding boxes, labels, and confidence scores.
    """
    yolo = request.app.state.yolo

    # Validate file type
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"Unsupported file type: {ext}. Use: {ALLOWED_EXT}")

    # Save uploaded file
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4()}{ext}"
    filepath = UPLOADS_DIR / filename

    try:
        async with aiofiles.open(filepath, "wb") as f:
            content = await file.read()
            await f.write(content)
    except Exception as e:
        raise HTTPException(500, f"Failed to save file: {e}")

    # Run inference
    try:
        t0 = time.time()
        result = await yolo.predict(
            image_path=str(filepath),
            confidence=confidence,
            iou=iou,
        )
        elapsed = round((time.time() - t0) * 1000, 1)

        return {
            "success": True,
            "image_url": f"/uploads/{filename}",
            "inference_ms": elapsed,
            **result,
        }
    except Exception as e:
        raise HTTPException(500, f"Inference failed: {e}")


@router.post("/url")
async def predict_url(request: Request, body: UrlPredictRequest):
    """
    Download an image from URL and run YOLO inference.
    Useful for ESP32-CAM or any IP camera feed.
    """
    import httpx
    yolo = request.app.state.yolo

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4()}.jpg"
    filepath = UPLOADS_DIR / filename

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(body.url)
            resp.raise_for_status()
        async with aiofiles.open(filepath, "wb") as f:
            await f.write(resp.content)
    except Exception as e:
        raise HTTPException(400, f"Failed to fetch image from URL: {e}")

    try:
        t0 = time.time()
        result = await yolo.predict(
            image_path=str(filepath),
            confidence=body.confidence,
            iou=body.iou,
        )
        elapsed = round((time.time() - t0) * 1000, 1)

        return {
            "success": True,
            "image_url": f"/uploads/{filename}",
            "source_url": body.url,
            "inference_ms": elapsed,
            **result,
        }
    except Exception as e:
        raise HTTPException(500, f"Inference failed: {e}")


@router.post("/base64")
async def predict_base64(request: Request):
    """
    Accept a base64 encoded image for inference.
    Useful from web frontend direct upload.
    """
    import base64
    yolo = request.app.state.yolo

    body = await request.json()
    b64_data = body.get("image", "")
    confidence = body.get("confidence", 0.25)
    iou = body.get("iou", 0.45)

    # Strip data URL prefix if present
    if "," in b64_data:
        b64_data = b64_data.split(",", 1)[1]

    try:
        img_bytes = base64.b64decode(b64_data)
    except Exception:
        raise HTTPException(400, "Invalid base64 image data")

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4()}.jpg"
    filepath = UPLOADS_DIR / filename

    async with aiofiles.open(filepath, "wb") as f:
        await f.write(img_bytes)

    try:
        t0 = time.time()
        result = await yolo.predict(
            image_path=str(filepath),
            confidence=confidence,
            iou=iou,
        )
        elapsed = round((time.time() - t0) * 1000, 1)
        return {"success": True, "image_url": f"/uploads/{filename}", "inference_ms": elapsed, **result}
    except Exception as e:
        raise HTTPException(500, f"Inference failed: {e}")
