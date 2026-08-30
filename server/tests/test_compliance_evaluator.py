import sys
import os
import io
import pytest
from PIL import Image, ImageDraw
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app
from database import Base, get_db
from services.ocr_service import extract_text_from_image
from services.compliance_evaluator import evaluate_label_compliance, ComplianceEvaluator
from services.rule_loader import get_rules_from_db

TEST_SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine_test = create_engine(TEST_SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_database():
    Base.metadata.create_all(bind=engine_test)
    # Seed rules into memory DB
    db = TestingSessionLocal()
    from services.rule_loader import sync_rules_to_db
    sync_rules_to_db(db=db)
    db.close()
    yield
    Base.metadata.drop_all(bind=engine_test)

def create_compliant_label_image() -> bytes:
    img = Image.new("RGB", (600, 400), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.text((30, 30), "MRP Rs 250.00 (INCL. OF ALL TAXES)", fill=(0, 0, 0))
    draw.text((30, 80), "NET QTY: 440 g", fill=(0, 0, 0))
    draw.text((30, 130), "MFG DATE: 08/2026", fill=(0, 0, 0))
    draw.text((30, 180), "Mfd by: Acme Foods Pvt Ltd, Industrial Area - 110020", fill=(0, 0, 0))
    draw.text((30, 230), "Consumer Care: 0120-2400286, help@acmefoods.com", fill=(0, 0, 0))
    draw.text((30, 280), "PRODUCT OF INDIA", fill=(0, 0, 0))

    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()

def create_non_compliant_label_image() -> bytes:
    img = Image.new("RGB", (600, 400), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    # Missing tax clause in MRP and non-standard unit gms
    draw.text((30, 30), "MRP Rs 250.00", fill=(0, 0, 0))
    draw.text((30, 80), "NET QTY: 500 gms", fill=(0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_compliance_evaluator_compliant_label():
    """Test Task #6 Compliance Evaluator on a fully compliant product label."""
    img_bytes = create_compliant_label_image()
    ocr_res = extract_text_from_image(img_bytes)
    
    db = TestingSessionLocal()
    ruleset = get_rules_from_db(db=db)
    comp_res = evaluate_label_compliance(ocr_res, ruleset=ruleset, db=db)
    db.close()

    assert comp_res.total_declarations_required > 0
    assert len(comp_res.summary.what_was_found) > 0
    assert comp_res.overall_result in ["PASS", "FAIL"]


def test_compliance_evaluator_non_compliant_label():
    """Test Task #6 Compliance Evaluator flags missing declarations and format errors."""
    img_bytes = create_non_compliant_label_image()
    ocr_res = extract_text_from_image(img_bytes)
    
    db = TestingSessionLocal()
    ruleset = get_rules_from_db(db=db)
    comp_res = evaluate_label_compliance(ocr_res, ruleset=ruleset, db=db)
    db.close()

    # Should detect violations (missing tax clause, illegal unit 'gms', missing mfg date)
    assert len(comp_res.summary.whats_wrong) > 0
    assert comp_res.overall_result == "FAIL"


def test_evaluate_image_api_endpoint():
    """Test POST /api/v1/compliance/evaluate-image REST API endpoint."""
    img_bytes = create_compliant_label_image()
    
    response = client.post(
        "/api/v1/compliance/evaluate-image",
        files={"file": ("label.jpg", img_bytes, "image/jpeg")}
    )

    assert response.status_code == 200
    data = response.json()
    assert "overall_result" in data
    assert "compliance_score" in data
    assert "summary" in data
    assert "what_was_found" in data["summary"]
    assert "whats_missing" in data["summary"]
    assert "whats_wrong" in data["summary"]

