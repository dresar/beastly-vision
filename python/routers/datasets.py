"""
Datasets Router — Dataset upload and management.
POST /datasets/upload       — Upload images and labels
POST /datasets/create       — Create a new dataset folder + YAML
GET  /datasets/             — List all datasets
GET  /datasets/{name}       — Get dataset info
DELETE /datasets/{name}     — Delete a dataset
POST /datasets/{name}/yaml  — Generate dataset.yaml
"""

import os
import shutil
import uuid
import aiofiles
import yaml
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel

router = APIRouter()

DATASETS_DIR = Path("datasets")
ALLOWED_IMG_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
ALLOWED_LABEL_EXT = {".txt"}


# ─── Schema ────────────────────────────────────────────────────────────────────

class CreateDatasetRequest(BaseModel):
    name: str
    class_names: List[str]
    description: Optional[str] = ""


class GenerateYamlRequest(BaseModel):
    class_names: List[str]


# ─── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/create")
async def create_dataset(body: CreateDatasetRequest):
    """Create a new empty dataset with the proper YOLO directory structure."""
    name = body.name.strip().replace(" ", "_")
    if not name:
        raise HTTPException(400, "Dataset name is required")

    dataset_path = DATASETS_DIR / name
    if dataset_path.exists():
        raise HTTPException(409, f"Dataset '{name}' already exists")

    # Create directory structure
    for split in ["train", "val", "test"]:
        (dataset_path / split / "images").mkdir(parents=True, exist_ok=True)
        (dataset_path / split / "labels").mkdir(parents=True, exist_ok=True)

    # Generate dataset.yaml
    yaml_content = {
        "path": str(dataset_path.resolve()),
        "train": "train/images",
        "val": "val/images",
        "test": "test/images",
        "nc": len(body.class_names),
        "names": body.class_names,
    }
    with open(dataset_path / "dataset.yaml", "w") as f:
        yaml.dump(yaml_content, f, default_flow_style=False)

    # Save description
    if body.description:
        (dataset_path / "description.txt").write_text(body.description)

    return {
        "success": True,
        "name": name,
        "path": str(dataset_path),
        "class_names": body.class_names,
    }


@router.post("/upload")
async def upload_dataset_files(
    dataset_name: str = Form(...),
    split: str = Form("train"),
    images: List[UploadFile] = File(...),
    labels: Optional[List[UploadFile]] = File(None),
):
    """
    Upload images (and optionally their YOLO .txt labels) to a dataset split.
    Images and labels should be paired by filename (same base name, different ext).
    """
    dataset_path = DATASETS_DIR / dataset_name
    if not dataset_path.exists():
        raise HTTPException(404, f"Dataset '{dataset_name}' not found. Create it first.")

    if split not in ["train", "val", "test"]:
        raise HTTPException(400, "split must be one of: train, val, test")

    img_dir = dataset_path / split / "images"
    lbl_dir = dataset_path / split / "labels"
    img_dir.mkdir(parents=True, exist_ok=True)
    lbl_dir.mkdir(parents=True, exist_ok=True)

    saved_images = []
    saved_labels = []

    # Save images
    for img in images:
        ext = Path(img.filename or "").suffix.lower()
        if ext not in ALLOWED_IMG_EXT:
            continue
        dest = img_dir / img.filename
        async with aiofiles.open(dest, "wb") as f:
            await f.write(await img.read())
        saved_images.append(img.filename)

    # Save labels
    if labels:
        for lbl in labels:
            ext = Path(lbl.filename or "").suffix.lower()
            if ext not in ALLOWED_LABEL_EXT:
                continue
            dest = lbl_dir / lbl.filename
            async with aiofiles.open(dest, "wb") as f:
                await f.write(await lbl.read())
            saved_labels.append(lbl.filename)

    return {
        "success": True,
        "dataset": dataset_name,
        "split": split,
        "images_saved": len(saved_images),
        "labels_saved": len(saved_labels),
        "files": {"images": saved_images, "labels": saved_labels},
    }


@router.get("/")
async def list_datasets():
    """List all datasets."""
    DATASETS_DIR.mkdir(parents=True, exist_ok=True)
    datasets = []

    for d in DATASETS_DIR.iterdir():
        if not d.is_dir():
            continue

        # Count images across all splits
        total_images = 0
        total_labels = 0
        for split in ["train", "val", "test"]:
            img_dir = d / split / "images"
            lbl_dir = d / split / "labels"
            if img_dir.exists():
                total_images += len(list(img_dir.glob("*")))
            if lbl_dir.exists():
                total_labels += len(list(lbl_dir.glob("*.txt")))

        # Read YAML for class info
        yaml_path = d / "dataset.yaml"
        classes = []
        if yaml_path.exists():
            with open(yaml_path) as f:
                data = yaml.safe_load(f)
                classes = data.get("names", [])

        desc = ""
        desc_file = d / "description.txt"
        if desc_file.exists():
            desc = desc_file.read_text()

        datasets.append({
            "name": d.name,
            "path": str(d),
            "total_images": total_images,
            "total_labels": total_labels,
            "class_names": classes,
            "description": desc,
            "has_yaml": yaml_path.exists(),
        })

    return {"datasets": datasets}


@router.get("/storage-info")
async def get_storage_info():
    """Show where dataset files are stored on disk."""
    DATASETS_DIR.mkdir(parents=True, exist_ok=True)
    return {
        "dataset_root": str(DATASETS_DIR.resolve()),
        "notes": [
            "Setiap dataset ada di folder: datasets/{dataset_name}",
            "Format YOLO: images + labels (.txt) pada split train/val/test",
            "File konfigurasi training: dataset.yaml di dalam folder dataset",
        ],
    }


@router.get("/{dataset_name}")
async def get_dataset(dataset_name: str):
    """Get detailed info about a specific dataset."""
    dataset_path = DATASETS_DIR / dataset_name
    if not dataset_path.exists():
        raise HTTPException(404, f"Dataset '{dataset_name}' not found")

    splits = {}
    for split in ["train", "val", "test"]:
        img_dir = dataset_path / split / "images"
        lbl_dir = dataset_path / split / "labels"
        images = list(img_dir.glob("*")) if img_dir.exists() else []
        labels = list(lbl_dir.glob("*.txt")) if lbl_dir.exists() else []
        splits[split] = {
            "images": len(images),
            "labels": len(labels),
            "image_files": [f.name for f in images[:20]],  # First 20
        }

    yaml_path = dataset_path / "dataset.yaml"
    classes = []
    if yaml_path.exists():
        with open(yaml_path) as f:
            data = yaml.safe_load(f)
            classes = data.get("names", [])

    return {
        "name": dataset_name,
        "splits": splits,
        "class_names": classes,
        "has_yaml": yaml_path.exists(),
    }


@router.post("/{dataset_name}/yaml")
async def generate_yaml(dataset_name: str, body: GenerateYamlRequest):
    """(Re)generate the dataset.yaml file."""
    dataset_path = DATASETS_DIR / dataset_name
    if not dataset_path.exists():
        raise HTTPException(404, f"Dataset '{dataset_name}' not found")

    yaml_content = {
        "path": str(dataset_path.resolve()),
        "train": "train/images",
        "val": "val/images",
        "test": "test/images",
        "nc": len(body.class_names),
        "names": body.class_names,
    }
    with open(dataset_path / "dataset.yaml", "w") as f:
        yaml.dump(yaml_content, f, default_flow_style=False)

    return {"success": True, "class_names": body.class_names}


@router.delete("/{dataset_name}")
async def delete_dataset(dataset_name: str):
    """Delete an entire dataset."""
    dataset_path = DATASETS_DIR / dataset_name
    if not dataset_path.exists():
        raise HTTPException(404, f"Dataset '{dataset_name}' not found")

    shutil.rmtree(dataset_path)
    return {"success": True, "message": f"Dataset '{dataset_name}' deleted"}
