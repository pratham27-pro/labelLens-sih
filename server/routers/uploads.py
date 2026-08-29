import logging
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from database import SessionLocal, get_db
from models import Inspection, Violation
from services.compliance_evaluator import evaluate_label_compliance
from services.cloudinary_service import upload_image as upload_image_to_cloudinary
from services.ocr_service import get_ocr_service
from services.rule_loader import load_rules_from_file

logger = logging.getLogger("uploads")

router = APIRouter(prefix="/api/v1/uploads", tags=["Image Uploads"])

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}


def _process_scan(inspection_id: str, image_bytes: bytes, db: Session | None = None):
    own_session = db is None
    db = db or SessionLocal()

    try:
        inspection = db.get(Inspection, inspection_id)
        if inspection is None:
            return

        try:
            inspection.status = "PROCESSING"
            db.commit()

            ocr_result = get_ocr_service().extract_text(
                image_bytes,
                enhance=True,
                include_annotated_image=True,
            )
            if not ocr_result.success:
                raise RuntimeError(ocr_result.error or "OCR extraction failed")

            ruleset = load_rules_from_file()
            compliance_result = evaluate_label_compliance(
                ocr_result,
                ruleset=ruleset,
            )

            structured_result = compliance_result.structured_result or {
                "compliance_score": compliance_result.compliance_score,
                "extracted_declarations": [],
                "violation_list": [],
                "final_status": "COMPLIANT" if compliance_result.overall_result == "PASS" else "NON_COMPLIANT",
            }
            if hasattr(structured_result, "model_dump"):
                structured_result = structured_result.model_dump()

            inspection.raw_ocr_output = ocr_result.model_dump()
            if inspection.extracted_declarations is None:
                inspection.extracted_declarations = [
                    declaration.model_dump()
                    for declaration in compliance_result.summary.what_was_found
                ]
            inspection.compliance_score = compliance_result.compliance_score
            if inspection.status == "PROCESSING":
                inspection.status = (
                    "COMPLIANT"
                    if compliance_result.overall_result == "PASS"
                    else "NON_COMPLIANT"
                )

            # Store structured compliance payload alongside the DB row for consistent UI/API consumption.
            inspection.raw_ocr_output = {
                **(inspection.raw_ocr_output or {}),
                "structured_compliance": structured_result,
            }

            for violation in compliance_result.summary.whats_wrong:
                db.add(
                    Violation(
                        inspection_id=inspection.id,
                        rule_code=violation.rule_id,
                        severity=violation.severity,
                        title=f"{violation.field_name} - {violation.violation_type.upper()}",
                        description=violation.description,
                        evidence_bbox=(
                            violation.evidence_bbox.model_dump()
                            if violation.evidence_bbox
                            else None
                        ),
                    )
                )

            db.commit()
        except Exception:
            logger.exception("Scan processing failed for inspection_id=%s", inspection_id)
            db.rollback()
            inspection = db.get(Inspection, inspection_id)
            if inspection is not None:
                inspection.status = "FAILED"
                db.commit()
    finally:
        if own_session:
            db.close()


@router.post("/image", status_code=status.HTTP_202_ACCEPTED)
async def upload_image(
    background_tasks: BackgroundTasks,
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

    filename = file.filename or "label.jpg"
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported image extension.",
        )

    inspection = Inspection(status="PROCESSING")

    try:
        db.add(inspection)
        db.commit()
        db.refresh(inspection)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create the scan record.",
        )

    try:
        cloudinary_image = upload_image_to_cloudinary(
            image_bytes,
            filename,
            public_id=f"scan_{inspection.id}",
        )
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not upload image to Cloudinary: {exc}",
        ) from exc

    inspection.image_path = cloudinary_image["secure_url"]
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update the scan record with the Cloudinary URL.",
        )

    background_tasks.add_task(_process_scan, inspection.id, image_bytes)

    return {
        "scan_id": inspection.id,
        "filename": filename,
        "image_url": cloudinary_image["secure_url"],
        "cloudinary_public_id": cloudinary_image["public_id"],
        "status": inspection.status,
    }


@router.get("/{scan_id}")
def get_scan_result(scan_id: str, db: Session = Depends(get_db)):
    inspection = db.get(Inspection, scan_id)
    if inspection is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found.",
        )

    violations = [
        {
            "id": violation.id,
            "rule_code": violation.rule_code,
            "severity": violation.severity,
            "title": violation.title,
            "description": violation.description,
            "evidence_bbox": violation.evidence_bbox,
        }
        for violation in inspection.violations
    ]

    return {
        "scan_id": inspection.id,
        "status": inspection.status,
        "image_path": inspection.image_path,
        "created_at": inspection.created_at,
        "compliance_score": inspection.compliance_score,
        "ocr_result": inspection.raw_ocr_output,
        "extracted_declarations": inspection.extracted_declarations,
        "violations": violations,
    }