import sys
import os
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

# Ensure server root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app
from database import Base, get_db
from models import User, UserRole, Product, Inspection, Violation

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
    """Create fresh isolated tables before each test."""
    Base.metadata.create_all(bind=engine_test)
    yield
    Base.metadata.drop_all(bind=engine_test)

def test_db_health_endpoint():
    """Test GET /health/db endpoint."""
    response = client.get("/health/db")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["database_connected"] is True


def test_create_and_retrieve_inspection_record():
    """Test creating a full inspection record with JSON OCR data."""
    db = TestingSessionLocal()
    try:
        user = User(
            full_name="Inspector Sharma",
            email="sharma@doca.gov.in",
            role=UserRole.FIELD_INSPECTOR.value,
            district="Noida"
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        product = Product(
            barcode="8904063214393",
            brand_name="Haldiram's",
            commodity_name="Aloo Bhujia"
        )
        db.add(product)
        db.commit()
        db.refresh(product)

        sample_ocr_json = {
            "total_text_blocks": 2,
            "text_blocks": [
                {"id": 1, "text": "MRP Rs 250.00 (INCL. OF ALL TAXES)"},
                {"id": 2, "text": "NET QTY: 440g"}
            ]
        }
        
        inspection = Inspection(
            product_id=product.id,
            inspector_id=user.id,
            raw_ocr_output=sample_ocr_json,
            compliance_score=100.0,
            status="COMPLIANT"
        )
        db.add(inspection)
        db.commit()
        db.refresh(inspection)

        fetched = db.query(Inspection).filter(Inspection.id == inspection.id).first()
        assert fetched is not None
        assert fetched.compliance_score == 100.0
        assert fetched.raw_ocr_output["total_text_blocks"] == 2
        assert fetched.raw_ocr_output["text_blocks"][0]["text"] == "MRP Rs 250.00 (INCL. OF ALL TAXES)"

    finally:
        db.close()
