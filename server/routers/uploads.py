from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from database import get_db
from models import Inspection

router = APIRouter(prefix="/api/v1/uploads", tags=["Image Uploads"])

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}


@router.post("/image", status_code=status.HTTP_201_CREATED)
async def upload_image(
    file: UploadFile = File(..., description="Label photo file"),
    db: Session = Depends(get_db),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. An image file is required.",
        )

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded image file is empty.",
        )

    extension = Path(file.filename or "").suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        extension = ".jpg"

    stored_filename = f"{uuid4()}{extension}"
    stored_path = UPLOAD_DIR / stored_filename
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    stored_path.write_bytes(image_bytes)

    inspection = Inspection(
        image_path=f"uploads/{stored_filename}",
        status="PENDING",
    )

    try:
        db.add(inspection)
        db.commit()
        db.refresh(inspection)
    except Exception:
        db.rollback()
        stored_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create the scan record.",
        )

    return {
        "scan_id": inspection.id,
        "filename": stored_filename,
        "status": inspection.status,
    }