"""
Train Router — YOLOv8 training job management.
POST /train/start   — Start a training job
GET  /train/jobs    — List all jobs
GET  /train/{id}    — Get job status
POST /train/{id}/cancel — Cancel a job
WS   /train/{id}/ws — WebSocket for real-time updates
"""

import asyncio
from fastapi import APIRouter, Request, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from typing import Optional
from services.training_service import TrainingService

router = APIRouter()

# Shared training service (initialized on first use, referenced by app)
_training_service: Optional[TrainingService] = None


def get_training_service() -> TrainingService:
    global _training_service
    if _training_service is None:
        _training_service = TrainingService()
    return _training_service


# ─── Schema ────────────────────────────────────────────────────────────────────

class StartTrainingRequest(BaseModel):
    dataset_name: str
    model_variant: str = "yolov8n.pt"
    epochs: int = 10
    batch_size: int = 16
    imgsz: int = 640
    learning_rate: float = 0.01
    job_id: Optional[str] = None


# ─── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/start")
async def start_training(body: StartTrainingRequest):
    """Start a YOLO training job (simplified: always uses yolov8n.pt)."""
    svc = get_training_service()

    # Check for already running job on same dataset
    for job in svc.jobs.values():
        if job.config.get("dataset_name") == body.dataset_name and job.status == "running":
            raise HTTPException(409, f"A training job is already running for dataset '{body.dataset_name}'")

    job_id = await svc.start_training(
        dataset_name=body.dataset_name,
        model_variant="yolov8n.pt",
        epochs=body.epochs,
        batch_size=body.batch_size,
        imgsz=body.imgsz,
        learning_rate=body.learning_rate,
        job_id=body.job_id,
    )

    return {"success": True, "job_id": job_id, "message": "Training started"}


@router.get("/jobs")
async def list_jobs():
    """List all training jobs."""
    svc = get_training_service()
    return {"jobs": svc.list_jobs()}


@router.get("/{job_id}")
async def get_job_status(job_id: str):
    """Get the status of a specific training job."""
    svc = get_training_service()
    job = await svc.get_job(job_id)
    if not job:
        raise HTTPException(404, f"Job '{job_id}' not found")
    return svc.get_job_state(job)


@router.post("/{job_id}/cancel")
async def cancel_job(job_id: str):
    """Cancel a running training job."""
    svc = get_training_service()
    ok = await svc.cancel_job(job_id)
    if not ok:
        raise HTTPException(404, f"Job '{job_id}' not found")
    return {"success": True, "message": "Cancellation requested"}


@router.websocket("/{job_id}/ws")
async def training_websocket(websocket: WebSocket, job_id: str):
    """
    WebSocket endpoint for real-time training progress.
    Sends updates every second while job is running.
    """
    await websocket.accept()
    svc = get_training_service()

    try:
        while True:
            job = await svc.get_job(job_id)
            if not job:
                await websocket.send_json({"error": f"Job {job_id} not found"})
                break

            state = svc.get_job_state(job)
            await websocket.send_json(state)

            if job.status in ("completed", "failed", "cancelled"):
                break

            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"error": str(e)})
        except:
            pass
