"""
TrainingService — Manages YOLOv8 training jobs with real-time progress.
"""

import os
import asyncio
import time
import json
import logging
import uuid
from pathlib import Path
from typing import Dict, Any, Optional, Callable
from datetime import datetime

logger = logging.getLogger(__name__)

DATASETS_DIR = Path("datasets")
MODELS_DIR = Path("models")
RUNS_DIR = Path("runs")
DEFAULT_MODEL_VARIANT = "yolov8n.pt"


class TrainingJob:
    """Represents a single training job with state tracking."""

    def __init__(self, job_id: str, config: Dict[str, Any]):
        self.job_id = job_id
        self.config = config
        self.status: str = "pending"  # pending, running, completed, failed, cancelled
        self.progress: int = 0
        self.current_epoch: int = 0
        self.total_epochs: int = config.get("epochs", 10)
        self.metrics: Dict[str, Any] = {}
        self.log_lines: list = []
        self.error: Optional[str] = None
        self.model_path: Optional[str] = None
        self.started_at: Optional[str] = None
        self.finished_at: Optional[str] = None
        self.created_at: str = datetime.utcnow().isoformat()
        self._task: Optional[asyncio.Task] = None
        self._cancelled = False


class TrainingService:
    """Manages training jobs for YOLOv8 models."""

    def __init__(self):
        self.jobs: Dict[str, TrainingJob] = {}
        self._lock = asyncio.Lock()

    async def start_training(
        self,
        dataset_name: str,
        model_variant: str = DEFAULT_MODEL_VARIANT,
        epochs: int = 10,
        batch_size: int = 16,
        imgsz: int = 640,
        learning_rate: float = 0.01,
        job_id: Optional[str] = None,
    ) -> str:
        """Start a new training job and return the job_id."""
        if job_id is None:
            job_id = str(uuid.uuid4())

        config = {
            "dataset_name": dataset_name,
            # Simplified ML ops: always train from yolov8n.pt
            "model_variant": DEFAULT_MODEL_VARIANT,
            "epochs": epochs,
            "batch_size": batch_size,
            "imgsz": imgsz,
            "learning_rate": learning_rate,
        }

        job = TrainingJob(job_id=job_id, config=config)
        self.jobs[job_id] = job

        # Start training in background
        task = asyncio.create_task(self._run_training(job))
        job._task = task

        return job_id

    async def _run_training(self, job: TrainingJob):
        """Execute training asynchronously."""
        job.status = "running"
        job.started_at = datetime.utcnow().isoformat()
        job.log_lines.append(f"[{datetime.utcnow().strftime('%H:%M:%S')}] Training started")

        try:
            dataset_yaml = DATASETS_DIR / job.config["dataset_name"] / "dataset.yaml"
            if not dataset_yaml.exists():
                raise FileNotFoundError(f"Dataset YAML not found: {dataset_yaml}")

            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self._train_sync, job, dataset_yaml)

        except asyncio.CancelledError:
            job.status = "cancelled"
            job.log_lines.append(f"[{datetime.utcnow().strftime('%H:%M:%S')}] Training cancelled")
        except Exception as e:
            job.status = "failed"
            job.error = str(e)
            job.log_lines.append(f"[{datetime.utcnow().strftime('%H:%M:%S')}] ERROR: {e}")
            logger.error(f"Training job {job.job_id} failed: {e}")
        finally:
            job.finished_at = datetime.utcnow().isoformat()

    def _train_sync(self, job: TrainingJob, dataset_yaml: Path):
        """Synchronous training execution (runs in thread pool)."""
        from ultralytics import YOLO
        from ultralytics.utils.callbacks.base import add_integration_callbacks

        # Custom callback to track progress
        def on_train_epoch_end(trainer):
            if job._cancelled:
                trainer.stop = True
                return

            job.current_epoch = trainer.epoch + 1
            job.total_epochs = trainer.epochs
            job.progress = int((job.current_epoch / job.total_epochs) * 100)

            # Capture metrics
            if hasattr(trainer, 'metrics') and trainer.metrics:
                metrics = {}
                for k, v in trainer.metrics.items():
                    try:
                        metrics[k] = float(v)
                    except:
                        pass
                job.metrics = metrics

            # Log
            ts = datetime.utcnow().strftime('%H:%M:%S')
            box_loss = trainer.loss_items[0].item() if hasattr(trainer, 'loss_items') and trainer.loss_items is not None else 0
            cls_loss = trainer.loss_items[1].item() if hasattr(trainer, 'loss_items') and trainer.loss_items is not None and len(trainer.loss_items) > 1 else 0
            
            log = f"[{ts}] Epoch {job.current_epoch}/{job.total_epochs} — box_loss: {box_loss:.4f}, cls_loss: {cls_loss:.4f}"
            job.log_lines.append(log)
            job.log_lines = job.log_lines[-100:]  # Keep last 100 lines

        # Load base model
        model = YOLO(job.config["model_variant"])
        model.add_callback("on_train_epoch_end", on_train_epoch_end)

        # Run training
        results = model.train(
            data=str(dataset_yaml),
            epochs=job.config["epochs"],
            batch=job.config["batch_size"],
            imgsz=job.config["imgsz"],
            lr0=job.config["learning_rate"],
            project=str(RUNS_DIR),
            name=f"job_{job.job_id[:8]}",
            exist_ok=True,
            verbose=True,
        )

        if job._cancelled:
            return

        # Save best model to our models directory
        best_model_src = RUNS_DIR / f"job_{job.job_id[:8]}" / "weights" / "best.pt"
        if best_model_src.exists():
            model_name = f"custom_{job.config['dataset_name']}_{job.job_id[:8]}.pt"
            dest = MODELS_DIR / model_name
            MODELS_DIR.mkdir(parents=True, exist_ok=True)
            import shutil
            shutil.copy2(best_model_src, dest)
            job.model_path = str(dest)
            job.log_lines.append(f"[{datetime.utcnow().strftime('%H:%M:%S')}] ✅ Model saved: {model_name}")

        # Extract final metrics
        if results and hasattr(results, 'results_dict'):
            for k, v in results.results_dict.items():
                try:
                    job.metrics[k] = float(v)
                except:
                    pass

        job.status = "completed"
        job.progress = 100
        job.log_lines.append(f"[{datetime.utcnow().strftime('%H:%M:%S')}] ✅ Training completed!")

    async def get_job(self, job_id: str) -> Optional[TrainingJob]:
        return self.jobs.get(job_id)

    async def cancel_job(self, job_id: str) -> bool:
        job = self.jobs.get(job_id)
        if not job:
            return False
        job._cancelled = True
        if job._task and not job._task.done():
            job._task.cancel()
        return True

    def get_job_state(self, job: TrainingJob) -> Dict[str, Any]:
        return {
            "job_id": job.job_id,
            "status": job.status,
            "progress": job.progress,
            "current_epoch": job.current_epoch,
            "total_epochs": job.total_epochs,
            "metrics": job.metrics,
            "log_lines": job.log_lines[-30:],  # Last 30 lines
            "error": job.error,
            "model_path": job.model_path,
            "config": job.config,
            "started_at": job.started_at,
            "finished_at": job.finished_at,
            "created_at": job.created_at,
        }

    def list_jobs(self) -> list:
        return [self.get_job_state(job) for job in reversed(list(self.jobs.values()))]
