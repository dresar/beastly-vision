"""
YOLOService — Core YOLOv8 wrapper for inference and model management.
"""

import os
import time
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any
import asyncio

logger = logging.getLogger(__name__)

MODELS_DIR = Path("models")
DEFAULT_MODEL = "yolov8n.pt"


class YOLOService:
    """Singleton service wrapping Ultralytics YOLO for inference and management."""

    def __init__(self):
        self.model = None
        self.model_name: str = DEFAULT_MODEL
        self.active_model_path: Optional[str] = None
        self._lock = asyncio.Lock()

    async def initialize(self):
        """Load the single supported model for this simplified setup."""
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        await self.load_model(DEFAULT_MODEL)

    async def load_model(self, model_path: str):
        """Load YOLO model; simplified mode only allows yolov8n.pt."""
        async with self._lock:
            try:
                if Path(model_path).name != DEFAULT_MODEL:
                    raise ValueError(
                        f"Only {DEFAULT_MODEL} is supported in simplified ML mode"
                    )
                loop = asyncio.get_event_loop()
                model = await loop.run_in_executor(None, self._load_sync, DEFAULT_MODEL)
                self.model = model
                self.model_name = DEFAULT_MODEL
                self.active_model_path = DEFAULT_MODEL

                # Save active model reference
                (MODELS_DIR / "active_model.txt").write_text(DEFAULT_MODEL)
                logger.info(f"✅ Loaded model: {DEFAULT_MODEL}")
                return True
            except Exception as e:
                logger.error(f"❌ Failed to load model {model_path}: {e}")
                raise

    def _load_sync(self, model_path: str):
        """Synchronous YOLO model loading (run in thread pool)."""
        from ultralytics import YOLO
        return YOLO(model_path)

    async def predict(
        self,
        image_path: str,
        confidence: float = 0.25,
        iou: float = 0.45,
        classes: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """
        Run YOLO inference on an image.
        Returns normalized bounding boxes and detection info.
        """
        if self.model is None:
            raise RuntimeError("No model loaded")

        async with self._lock:
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(
                None,
                self._predict_sync,
                image_path, confidence, iou, classes,
            )
            return results

    def _predict_sync(
        self,
        image_path: str,
        confidence: float,
        iou: float,
        classes: Optional[List[int]],
    ) -> Dict[str, Any]:
        """Synchronous prediction (run in thread pool)."""
        from PIL import Image
        import numpy as np

        results = self.model.predict(
            source=image_path,
            conf=confidence,
            iou=iou,
            classes=classes,
            verbose=False,
        )

        detections = []
        result = results[0]
        img_h, img_w = result.orig_shape

        for box in result.boxes:
            # Convert to normalized xywh
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            conf = float(box.conf[0])
            cls_id = int(box.cls[0])
            label = result.names[cls_id]

            # Normalize
            cx = ((x1 + x2) / 2) / img_w
            cy = ((y1 + y2) / 2) / img_h
            w = (x2 - x1) / img_w
            h = (y2 - y1) / img_h
            # Convert center to top-left for frontend
            nx = cx - w / 2
            ny = cy - h / 2

            detections.append({
                "label": label,
                "class_id": cls_id,
                "confidence": round(conf, 4),
                "bbox": [round(nx, 4), round(ny, 4), round(w, 4), round(h, 4)],
                "bbox_px": [round(x1), round(y1), round(x2), round(y2)],
            })

        # Sort by confidence
        detections.sort(key=lambda x: x["confidence"], reverse=True)

        primary = detections[0] if detections else None

        return {
            "detections": detections,
            "count": len(detections),
            "primary_label": primary["label"] if primary else None,
            "max_confidence": primary["confidence"] if primary else 0.0,
            "model": self.model_name,
            "image_size": [img_w, img_h],
        }

    def get_model_info(self) -> Dict[str, Any]:
        """Return info about currently loaded model."""
        if self.model is None:
            return {"loaded": False}
        return {
            "loaded": True,
            "model_name": self.model_name,
            "model_path": self.active_model_path,
            "num_classes": len(self.model.names) if self.model else 0,
            "class_names": list(self.model.names.values()) if self.model else [],
        }

    def list_available_models(self) -> List[Dict[str, Any]]:
        """Return a single supported model for beginner-friendly operation."""
        return [{
            "name": DEFAULT_MODEL,
            "path": DEFAULT_MODEL,
            "type": "pretrained",
            "size_mb": None,
            "is_active": True,
        }]
