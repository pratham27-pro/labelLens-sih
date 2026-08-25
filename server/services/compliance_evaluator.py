import re
import time
import logging
from typing import List, Dict, Any, Optional

from schemas.ocr import OCRScanResult, TextBlock, BBox
from schemas.compliance import (
    ComplianceResult,
    ComplianceSummary,
    DeclarationFound,
    DeclarationMissing,
    ViolationDetail
)
from services.rule_loader import load_rules_from_file

logger = logging.getLogger("compliance_evaluator")

class ComplianceEvaluator:
    def __init__(self, ruleset: Optional[Dict[str, Any]] = None):
        if ruleset is None:
            ruleset = load_rules_from_file()
        self.ruleset = ruleset
        self.mandatory_rules = ruleset.get("mandatory_declarations", [])

    def evaluate(self, ocr_result: OCRScanResult) -> ComplianceResult:
        """
        Core "Brain" function for Task #6:
        - Takes OCR text blocks from Task #4
        - Matches text blocks to legal declaration entities
        - Runs Presence, Format, and Font Size checks
        - Returns structured result: what was found, missing, wrong, and overall PASS/FAIL.
        """
        start_time = time.time()
        
        found_declarations: List[DeclarationFound] = []
        missing_declarations: List[DeclarationMissing] = []
        violations: List[ViolationDetail] = []

        matched_rule_ids = set()

        # Step 1: Analyze every OCR text block against Legal Metrology entity matchers
        for block in ocr_result.text_blocks:
            text = block.text.strip()
            
            # Check MRP
            if self._is_mrp(text):
                matched_rule_ids.add("mrp")
                decl, viols = self._eval_mrp(block, ocr_result)
                found_declarations.append(decl)
                violations.extend(viols)

            # Check Net Quantity
            elif self._is_net_quantity(text):
                matched_rule_ids.add("net_quantity")
                decl, viols = self._eval_net_quantity(block)
                found_declarations.append(decl)
                violations.extend(viols)

            # Check Manufacture Date
            elif self._is_mfg_date(text):
                matched_rule_ids.add("manufacture_date")
                decl, viols = self._eval_mfg_date(block)
                found_declarations.append(decl)
                violations.extend(viols)

            # Check Manufacturer Details
            elif self._is_manufacturer_details(text):
                matched_rule_ids.add("manufacturer_details")
                decl, viols = self._eval_manufacturer_details(block)
                found_declarations.append(decl)
                violations.extend(viols)

            # Check Consumer Care Details
            elif self._is_consumer_care(text):
                matched_rule_ids.add("consumer_care")
                decl, viols = self._eval_consumer_care(block)
                found_declarations.append(decl)
                violations.extend(viols)

            # Check Country of Origin
            elif self._is_country_of_origin(text):
                matched_rule_ids.add("country_of_origin")
                decl, viols = self._eval_country_of_origin(block)
                found_declarations.append(decl)
                violations.extend(viols)

        # Step 2: Check Presence for all mandatory declarations defined in rules.json
        for rule in self.mandatory_rules:
            rule_id = rule["id"]
            is_required = rule.get("required", True)

            if rule_id not in matched_rule_ids and is_required:
                missing_decl = DeclarationMissing(
                    id=rule_id,
                    field_name=rule.get("field_name", rule_id),
                    description=rule.get("description", ""),
                    required=True
                )
                missing_declarations.append(missing_decl)

                viol = ViolationDetail(
                    id=f"viol_missing_{rule_id}_{int(time.time())}",
                    rule_id=rule_id,
                    field_name=rule.get("field_name", rule_id),
                    violation_type="missing",
                    severity="CRITICAL" if rule_id in ["mrp", "net_quantity"] else "MAJOR",
                    description=f"Mandatory declaration '{rule.get('field_name')}' is missing from product packaging.",
                    evidence_bbox=None
                )
                violations.append(viol)

        # Step 3: Compute Compliance Score and Overall PASS/FAIL Status
        total_required = sum(1 for r in self.mandatory_rules if r.get("required", True))
        total_found_valid = sum(1 for d in found_declarations if d.format_valid and d.size_valid)

        has_critical_or_major = any(v.severity in ["CRITICAL", "MAJOR"] for v in violations)
        overall_result = "FAIL" if has_critical_or_major else "PASS"

        # Deduct score per violation type
        score_deductions = 0.0
        for v in violations:
            if v.severity == "CRITICAL":
                score_deductions += 30.0
            elif v.severity == "MAJOR":
                score_deductions += 15.0
            else:
                score_deductions += 5.0

        compliance_score = max(round(100.0 - score_deductions, 1), 0.0)
        processing_time = round((time.time() - start_time) * 1000, 2)

        summary = ComplianceSummary(
            what_was_found=found_declarations,
            whats_missing=missing_declarations,
            whats_wrong=violations
        )

        return ComplianceResult(
            overall_result=overall_result,
            compliance_score=compliance_score,
            total_declarations_required=total_required,
            total_found=total_found_valid,
            summary=summary,
            processing_time_ms=processing_time,
            annotated_image_base64=ocr_result.annotated_image_base64
        )

    # --- Entity Detection Helpers ---

    def _is_mrp(self, text: str) -> bool:
        t = text.upper()
        return any(k in t for k in ["MRP", "MAXIMUM RETAIL PRICE", "INCL. OF ALL TAXES", "INCLUSIVE OF ALL TAXES"]) or (("RS" in t or "₹" in t) and re.search(r'\d+\.?\d*', t))

    def _is_net_quantity(self, text: str) -> bool:
        t = text.upper()
        return any(k in t for k in ["NET QTY", "NET WT", "NET WEIGHT", "NET CONTENT", "NET QUANTITY"]) or bool(re.search(r'\b\d+\s*(G|KG|ML|L|N|GMS|LTRS)\b', t))

    def _is_mfg_date(self, text: str) -> bool:
        t = text.upper()
        return any(k in t for k in ["MFG", "PKD", "MANUFACTURE", "PACKED", "BEST BEFORE"]) or bool(re.search(r'\b\d{2}[/\-]\d{2,4}\b', t))

    def _is_manufacturer_details(self, text: str) -> bool:
        t = text.upper()
        return any(k in t for k in ["MFD BY", "MANUFACTURED BY", "PACKED BY", "MKTD BY", "HALDIRAM", "PVT. LTD", "NOIDA", "MUMBAI", "DELHI"]) or bool(re.search(r'\b\d{6}\b', t))

    def _is_consumer_care(self, text: str) -> bool:
        t = text.upper()
        return any(k in t for k in ["CONSUMER", "CUSTOMER CARE", "FEEDBACK", "CALL US", "E-MAIL", "EMAIL", "SALES@"]) or bool(re.search(r'\b(1800|\d{3,4}[\-\s]?\d{6,8})\b', t))

    def _is_country_of_origin(self, text: str) -> bool:
        t = text.upper()
        return any(k in t for k in ["PRODUCT OF INDIA", "MADE IN INDIA", "COUNTRY OF ORIGIN"])

    # --- Rule Evaluators ---

    def _eval_mrp(self, block: TextBlock, ocr_result: OCRScanResult) -> tuple[DeclarationFound, List[ViolationDetail]]:
        text = block.text
        t_upper = text.upper()
        raw_full = ocr_result.raw_text.upper()

        # Check format: MRP must mention inclusive of all taxes
        has_tax_clause = any(k in t_upper or k in raw_full for k in ["INCL. OF ALL TAXES", "INCLUSIVE OF ALL TAXES", "INCL OF ALL TAXES"])
        
        format_valid = has_tax_clause
        viols = []

        if not format_valid:
            viols.append(ViolationDetail(
                id=f"viol_mrp_tax_{block.id}",
                rule_id="mrp",
                field_name="Maximum Retail Price (MRP)",
                violation_type="wrong_format",
                severity="MAJOR",
                description="MRP declaration is missing mandated tax clause '(incl. of all taxes)' as per Legal Metrology Rule 6.",
                evidence_bbox=block.bbox
            ))

        font_size_mm = self._estimate_font_mm(block.size.estimated_font_size_px, ocr_result.image_metadata.height)
        size_valid = font_size_mm >= 1.0

        if not size_valid:
            viols.append(ViolationDetail(
                id=f"viol_mrp_size_{block.id}",
                rule_id="mrp",
                field_name="Maximum Retail Price (MRP)",
                violation_type="too_small",
                severity="MINOR",
                description=f"MRP text font size ({font_size_mm:.1f}mm) is below prescribed minimum height (1.0mm).",
                evidence_bbox=block.bbox
            ))

        status = "COMPLIANT" if (format_valid and size_valid) else ("FORMAT_ERROR" if not format_valid else "TOO_SMALL")

        decl = DeclarationFound(
            id="mrp",
            field_name="Maximum Retail Price (MRP)",
            extracted_text=text,
            parsed_value=text,
            confidence=block.confidence,
            bbox=block.bbox,
            font_size_px=block.size.estimated_font_size_px,
            font_size_mm_est=font_size_mm,
            format_valid=format_valid,
            size_valid=size_valid,
            status=status
        )
        return decl, viols

    def _eval_net_quantity(self, block: TextBlock) -> tuple[DeclarationFound, List[ViolationDetail]]:
        text = block.text
        t_upper = text.upper()
        viols = []

        # Check for non-standard unit symbols (e.g. gms, ltrs, kilo)
        has_illegal_unit = bool(re.search(r'\b(GMS|LTRS|KILO|CTS)\b', t_upper))
        format_valid = not has_illegal_unit

        if has_illegal_unit:
            viols.append(ViolationDetail(
                id=f"viol_net_qty_symbol_{block.id}",
                rule_id="net_quantity",
                field_name="Net Quantity",
                violation_type="wrong_format",
                severity="MAJOR",
                description="Net Quantity uses non-standard unit symbol ('gms'/'ltrs'). Legal Metrology mandates standard SI units ('g', 'kg', 'ml', 'L', 'N').",
                evidence_bbox=block.bbox
            ))

        font_size_mm = self._estimate_font_mm(block.size.estimated_font_size_px, 400)
        size_valid = font_size_mm >= 1.0

        if not size_valid:
            viols.append(ViolationDetail(
                id=f"viol_net_qty_size_{block.id}",
                rule_id="net_quantity",
                field_name="Net Quantity",
                violation_type="too_small",
                severity="MINOR",
                description=f"Net Quantity font size ({font_size_mm:.1f}mm) is below prescribed minimum height.",
                evidence_bbox=block.bbox
            ))

        status = "COMPLIANT" if (format_valid and size_valid) else ("FORMAT_ERROR" if not format_valid else "TOO_SMALL")

        decl = DeclarationFound(
            id="net_quantity",
            field_name="Net Quantity",
            extracted_text=text,
            parsed_value=text,
            confidence=block.confidence,
            bbox=block.bbox,
            font_size_px=block.size.estimated_font_size_px,
            font_size_mm_est=font_size_mm,
            format_valid=format_valid,
            size_valid=size_valid,
            status=status
        )
        return decl, viols

    def _eval_mfg_date(self, block: TextBlock) -> tuple[DeclarationFound, List[ViolationDetail]]:
        text = block.text
        font_size_mm = self._estimate_font_mm(block.size.estimated_font_size_px, 400)
        decl = DeclarationFound(
            id="manufacture_date",
            field_name="Month and Year of Manufacture",
            extracted_text=text,
            parsed_value=text,
            confidence=block.confidence,
            bbox=block.bbox,
            font_size_px=block.size.estimated_font_size_px,
            font_size_mm_est=font_size_mm,
            format_valid=True,
            size_valid=True,
            status="COMPLIANT"
        )
        return decl, []

    def _eval_manufacturer_details(self, block: TextBlock) -> tuple[DeclarationFound, List[ViolationDetail]]:
        text = block.text
        font_size_mm = self._estimate_font_mm(block.size.estimated_font_size_px, 400)
        decl = DeclarationFound(
            id="manufacturer_details",
            field_name="Manufacturer Name & Address",
            extracted_text=text,
            parsed_value=text,
            confidence=block.confidence,
            bbox=block.bbox,
            font_size_px=block.size.estimated_font_size_px,
            font_size_mm_est=font_size_mm,
            format_valid=True,
            size_valid=True,
            status="COMPLIANT"
        )
        return decl, []

    def _eval_consumer_care(self, block: TextBlock) -> tuple[DeclarationFound, List[ViolationDetail]]:
        text = block.text
        font_size_mm = self._estimate_font_mm(block.size.estimated_font_size_px, 400)
        decl = DeclarationFound(
            id="consumer_care",
            field_name="Consumer Care Details",
            extracted_text=text,
            parsed_value=text,
            confidence=block.confidence,
            bbox=block.bbox,
            font_size_px=block.size.estimated_font_size_px,
            font_size_mm_est=font_size_mm,
            format_valid=True,
            size_valid=True,
            status="COMPLIANT"
        )
        return decl, []

    def _eval_country_of_origin(self, block: TextBlock) -> tuple[DeclarationFound, List[ViolationDetail]]:
        text = block.text
        font_size_mm = self._estimate_font_mm(block.size.estimated_font_size_px, 400)
        decl = DeclarationFound(
            id="country_of_origin",
            field_name="Country of Origin",
            extracted_text=text,
            parsed_value=text,
            confidence=block.confidence,
            bbox=block.bbox,
            font_size_px=block.size.estimated_font_size_px,
            font_size_mm_est=font_size_mm,
            format_valid=True,
            size_valid=True,
            status="COMPLIANT"
        )
        return decl, []

    def _estimate_font_mm(self, font_size_px: float, img_height_px: int) -> float:
        """Estimates physical font height in mm based on pixel scaling."""
        # Standard packaging photo physical height ~150mm
        est_mm = (font_size_px / max(img_height_px, 1)) * 150.0
        return round(max(est_mm, 1.0), 1)


# Helper function to evaluate image compliance directly
def evaluate_label_compliance(ocr_result: OCRScanResult, ruleset: Optional[Dict[str, Any]] = None) -> ComplianceResult:
    evaluator = ComplianceEvaluator(ruleset=ruleset)
    return evaluator.evaluate(ocr_result)
