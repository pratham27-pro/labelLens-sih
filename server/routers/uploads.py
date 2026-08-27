from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from database import get_db
from models import Inspection, Violation
from services.compliance_evaluator import evaluate_label_compliance
from services.ocr_service import get_ocr_service
from services.rule_loader import load_rules_from_file

router = APIRouter(prefix="/api/v1/uploads", tags=["Image Uploads"])

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}


def _process_scan(db: Session, inspection_id: str, image_path: str):
    inspection = db.get(Inspection, inspection_id)
    if inspection is None:
        return

    try:
        inspection.status = "PROCESSING"
        db.commit()

        ocr_result = get_ocr_service().extract_text(
            image_path,
            enhance=True,
            include_annotated_image=True,
        )
        if not ocr_result.success:
            raise RuntimeError(ocr_result.error or "OCR extraction failed")

        compliance_result = evaluate_label_compliance(
            ocr_result,
            ruleset=load_rules_from_file(),
        )

        inspection.raw_ocr_output = ocr_result.model_dump()
        inspection.extracted_declarations = [
            declaration.model_dump()
            for declaration in compliance_result.summary.what_was_found
        ]
        inspection.compliance_score = compliance_result.compliance_score
        inspection.status = (
            "COMPLIANT"
            if compliance_result.overall_result == "PASS"
            else "NON_COMPLIANT"
        )

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
        db.rollback()
        inspection = db.get(Inspection, inspection_id)
        if inspection is not None:
            inspection.status = "FAILED"
            db.commit()


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

    extension = Path(file.filename or "").suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        extension = ".jpg"

    stored_filename = f"{uuid4()}{extension}"
    stored_path = UPLOAD_DIR / stored_filename
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    stored_path.write_bytes(image_bytes)

    inspection = Inspection(
        image_path=f"uploads/{stored_filename}",
        status="PROCESSING",
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

    background_tasks.add_task(_process_scan, db, inspection.id, str(stored_path))

    return {
        "scan_id": inspection.id,
        "filename": stored_filename,
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