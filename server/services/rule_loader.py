import os
import json
import logging
from typing import Dict, Any
from sqlalchemy.orm import Session

from models.rule import ComplianceRule
from database import SessionLocal

logger = logging.getLogger("rule_loader")

RULES_FILE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "rules.json")

def load_rules_from_file() -> Dict[str, Any]:
    """Reads rules.json created for Task #5."""
    if not os.path.exists(RULES_FILE_PATH):
        logger.warning(f"rules.json not found at {RULES_FILE_PATH}. Using fallback defaults.")
        return get_default_ruleset()
    
    try:
        with open(RULES_FILE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to parse rules.json: {e}")
        return get_default_ruleset()


def get_default_ruleset() -> Dict[str, Any]:
    return {
        "ruleset_version": "1.0",
        "country_scope": "India",
        "mandatory_declarations": [
            {
                "id": "manufacturer_details",
                "field_name": "Manufacturer Name & Address",
                "description": "Name and complete address of the manufacturer or packer.",
                "required": True,
                "expected_format": "Text containing company name, city, state, and 6-digit pincode.",
                "min_font_size_mm": 1.0
            },
            {
                "id": "net_quantity",
                "field_name": "Net Quantity",
                "description": "Net quantity in standard SI units of weight, volume, or number.",
                "required": True,
                "expected_format": "Numeric value followed by standard unit (g, kg, ml, L, N).",
                "min_font_size_mm": 1.5
            },
            {
                "id": "mrp",
                "field_name": "Maximum Retail Price (MRP)",
                "description": "Maximum Retail Price inclusive of all taxes.",
                "required": True,
                "expected_format": "MRP Rs X.XX (incl. of all taxes) or ₹ X.XX",
                "min_font_size_mm": 1.0
            },
            {
                "id": "manufacture_date",
                "field_name": "Month and Year of Manufacture",
                "description": "Date or month/year when product was manufactured/packed.",
                "required": True,
                "expected_format": "MM/YYYY, MM-YYYY, or 'Mfg Date: DD/MM/YYYY'",
                "min_font_size_mm": 1.0
            },
            {
                "id": "consumer_care",
                "field_name": "Consumer Care Details",
                "description": "Name, address, telephone number, or email for customer complaints.",
                "required": True,
                "expected_format": "Phone number, email ID, and postal address.",
                "min_font_size_mm": 1.0
            },
            {
                "id": "country_of_origin",
                "field_name": "Country of Origin",
                "description": "Country where the product was produced or manufactured.",
                "required": False,
                "expected_format": "Country name (e.g. 'Made in India' or 'Country of Origin: India')",
                "min_font_size_mm": 1.0
            }
        ]
    }

def sync_rules_to_db(db: Session = None):
    """
    Seeds rules from rules.json into database table ONCE.
    Skipped if rules are already present in DB.
    """
    close_db_on_exit = False
    if db is None:
        db = SessionLocal()
        close_db_on_exit = True

    try:
        # Check if rules are already seeded in DB
        existing_count = db.query(ComplianceRule).count()
        if existing_count > 0:
            logger.info(f"Compliance rules already seeded ({existing_count} rules found in DB). Skipping re-seeding.")
            return

        rules_data = load_rules_from_file()
        declarations = rules_data.get("mandatory_declarations", [])

        for item in declarations:
            rule_id = item["id"]
            rule_obj = ComplianceRule(
                id=rule_id,
                field_name=item.get("field_name", rule_id),
                description=item.get("description", ""),
                required=item.get("required", True),
                expected_format=item.get("expected_format", ""),
                min_font_size_mm=item.get("min_font_size_mm", 1.0)
            )
            db.add(rule_obj)

        db.commit()
        logger.info("Compliance rules seeded to database successfully.")
    except Exception as e:
        logger.error(f"Error seeding rules to DB: {e}")
        db.rollback()
    finally:
        if close_db_on_exit:
            db.close()
