"""
WildGuard AI Engine — FastAPI Python Service
============================================
Handles YOLOv8 inference, training, model management, and dataset operations.
Runs as a standalone service at port 8000.
"""

import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import predict, train, models, datasets, status, mqtt
from services.yolo_service import YOLOService
from services.mqtt_service import MQTTBridgeService

# ─── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize YOLO service on startup."""
    print("🚀 WildGuard AI Engine starting...")
    yolo = YOLOService()
    await yolo.initialize()
    app.state.yolo = yolo
    app.state.mqtt = MQTTBridgeService(yolo, asyncio.get_running_loop())
    await app.state.mqtt.start()
    print("✅ YOLO Engine ready!")
    yield
    await app.state.mqtt.stop()
    print("🛑 AI Engine shutting down...")

# ─── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="WildGuard AI Engine",
    description="YOLOv8-powered object detection & training service",
    version="2.0.0",
    lifespan=lifespan,
)

# ─── CORS ──────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Static Files (uploaded images, results) ──────────────────────────────────

os.makedirs("uploads", exist_ok=True)
os.makedirs("results", exist_ok=True)
os.makedirs("models", exist_ok=True)
os.makedirs("datasets", exist_ok=True)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.mount("/results", StaticFiles(directory="results"), name="results")

# ─── Routers ───────────────────────────────────────────────────────────────────

app.include_router(predict.router, prefix="/predict", tags=["Detection"])
app.include_router(train.router, prefix="/train", tags=["Training"])
app.include_router(models.router, prefix="/models", tags=["Models"])
app.include_router(datasets.router, prefix="/datasets", tags=["Datasets"])
app.include_router(status.router, prefix="/status", tags=["Status"])
app.include_router(mqtt.router, prefix="/mqtt", tags=["MQTT"])

# ─── Root ──────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "service": "WildGuard AI Engine",
        "version": "2.0.0",
        "status": "online",
        "docs": "/docs",
    }

# ─── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
