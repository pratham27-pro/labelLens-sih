import base64
import logging
from typing import Optional, Dict, Any
from fastapi import APIRouter, File, UploadFile, Query, Depends, HTTPException, status
from sqlalchemy.orm import Session

from schemas.compliance import ComplianceResult
from schemas.ocr import OCRScanResult
from services.ocr_service import get_ocr_service
from services.compliance_evaluator import evaluate_label_compliance
from services.rule_loader import load_rules_from_file, sync_rules_to_db, get_rules_from_db
from database import get_db
from models import Inspection, Violation, Product

logger = logging.getLogger("compliance_router")

router = APIRouter(prefix="/api/v1/compliance", tags=["Compliance Evaluation Engine"])

@router.get(
    "/rules",
    summary="Get active Legal Metrology mandatory declarations ruleset",
    description="Returns active rules list dynamically loaded from database compliance_rules table."
)
def get_active_rules(db: Session = Depends(get_db)):
    rules_data = get_rules_from_db(db=db)
    return rules_data


@router.post(
    "/evaluate-image",
    response_model=ComplianceResult,
    summary="End-to-end Legal Metrology compliance evaluation from label photo upload",
    description="Runs OCR extraction, evaluates active Legal Metrology DB rules, logs inspection in DB, and returns structured result."
)
async def evaluate_image_compliance(
    file: UploadFile = File(..., description="Packaged product label photo"),
    enhance: bool = Query(default=True, description="Apply contrast enhancement preprocessing"),
    min_confidence: float = Query(default=0.3, ge=0.0, le=1.0, description="Minimum OCR confidence threshold"),
    db: Session = Depends(get_db)
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type '{file.content_type}'. Must be an image file."
        )

    try:
        image_bytes = await file.read()
        if len(image_bytes) == 0:
            raise HTTPException(status_code=400, detail="Uploaded image is empty.")

        # Step 1: Run Task #4 OCR Extraction Engine
        ocr_service = get_ocr_service()
        ocr_result = ocr_service.extract_text(
            image_bytes,
            enhance=enhance,
            min_confidence=min_confidence,
            include_annotated_image=True
        )

        if not ocr_result.success:
            raise HTTPException(status_code=500, detail=f"OCR Extraction failed: {ocr_result.error}")

        # Step 2: Run Compliance Evaluator Engine with DB-driven rules
        ruleset = get_rules_from_db(db=db)
        compliance_result = evaluate_label_compliance(ocr_result, ruleset=ruleset, db=db)

        # Step 3: Persist Inspection Record and Violations to PostgreSQL / SQLite Database
        try:
            # Create Inspection Log
            inspection_log = Inspection(
                raw_ocr_output=ocr_result.model_dump(),
                extracted_declarations=[d.model_dump() for d in compliance_result.summary.what_was_found],
                compliance_score=compliance_result.compliance_score,
                status="COMPLIANT" if compliance_result.overall_result == "PASS" else "NON_COMPLIANT"
            )
            db.add(inspection_log)
            db.commit()
            db.refresh(inspection_log)

            # Create Violation Records
            for v in compliance_result.summary.whats_wrong:
                viol_obj = Violation(
                    inspection_id=inspection_log.id,
                    rule_code=v.rule_id,
                    severity=v.severity,
                    title=f"{v.field_name} - {v.violation_type.upper()}",
                    description=v.description,
                    evidence_bbox=v.evidence_bbox.model_dump() if v.evidence_bbox else None
                )
                db.add(viol_obj)
            db.commit()

        except Exception as db_err:
            logger.exception(
                "Failed to persist inspection/violations for compliance evaluation: %s", db_err
            )
            db.rollback()

        return compliance_result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred during compliance evaluation: {str(e)}"
        )


@router.post(
    "/evaluate-ocr",
    response_model=ComplianceResult,
    summary="Evaluate Legal Metrology compliance from pre-computed OCR JSON output",
    description="Takes raw OCRScanResult JSON output and evaluates against Legal Metrology DB ruleset."
)
def evaluate_ocr_payload(ocr_result: OCRScanResult, db: Session = Depends(get_db)):
    ruleset = get_rules_from_db(db=db)
    result = evaluate_label_compliance(ocr_result, ruleset=ruleset, db=db)
    return result
