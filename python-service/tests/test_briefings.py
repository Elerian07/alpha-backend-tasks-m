from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import SampleItem  # noqa: F401
from app.models.briefing import Briefing, BriefingMetric, BriefingPoint  # noqa: F401


VALID_PAYLOAD = {
    "companyName": "Acme Holdings",
    "ticker": "acme",
    "sector": "Industrial Technology",
    "analystName": "Jane Doe",
    "summary": "Acme is benefiting from strong enterprise demand.",
    "recommendation": "Monitor for margin expansion before increasing exposure.",
    "keyPoints": [
        "Revenue grew 18% year-over-year.",
        "Management raised full-year guidance.",
    ],
    "risks": [
        "Top two customers account for 41% of total revenue.",
    ],
    "metrics": [
        {"name": "Revenue Growth", "value": "18%"},
        {"name": "Operating Margin", "value": "22.4%"},
    ],
}


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    Base.metadata.create_all(bind=engine)

    def override_get_db() -> Generator[Session, None, None]:
        db = testing_session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def test_create_briefing_success(client: TestClient) -> None:
    res = client.post("/briefings", json=VALID_PAYLOAD)
    assert res.status_code == 201
    data = res.json()
    assert data["ticker"] == "ACME"
    assert data["company_name"] == "Acme Holdings"
    assert data["generated_at"] is None
    assert len([p for p in data["points"] if p["point_type"] == "key_point"]) == 2
    assert len([p for p in data["points"] if p["point_type"] == "risk"]) == 1
    assert len(data["metrics"]) == 2


def test_create_briefing_missing_company_name(client: TestClient) -> None:
    payload = {**VALID_PAYLOAD, "companyName": ""}
    res = client.post("/briefings", json=payload)
    assert res.status_code == 422


def test_create_briefing_too_few_key_points(client: TestClient) -> None:
    payload = {**VALID_PAYLOAD, "keyPoints": ["Only one point"]}
    res = client.post("/briefings", json=payload)
    assert res.status_code == 422


def test_create_briefing_no_risks(client: TestClient) -> None:
    payload = {**VALID_PAYLOAD, "risks": []}
    res = client.post("/briefings", json=payload)
    assert res.status_code == 422


def test_create_briefing_duplicate_metric_names(client: TestClient) -> None:
    payload = {
        **VALID_PAYLOAD,
        "metrics": [{"name": "Revenue", "value": "1M"}, {"name": "Revenue", "value": "2M"}],
    }
    res = client.post("/briefings", json=payload)
    assert res.status_code == 422


def test_create_briefing_no_metrics(client: TestClient) -> None:
    payload = {**VALID_PAYLOAD, "metrics": []}
    res = client.post("/briefings", json=payload)
    assert res.status_code == 201


def test_get_briefing(client: TestClient) -> None:
    created = client.post("/briefings", json=VALID_PAYLOAD).json()
    res = client.get(f"/briefings/{created['id']}")
    assert res.status_code == 200
    assert res.json()["id"] == created["id"]


def test_get_briefing_not_found(client: TestClient) -> None:
    res = client.get("/briefings/9999")
    assert res.status_code == 404


def test_generate_briefing(client: TestClient) -> None:
    created = client.post("/briefings", json=VALID_PAYLOAD).json()
    res = client.post(f"/briefings/{created['id']}/generate")
    assert res.status_code == 200
    data = res.json()
    assert data["generated_at"] is not None
    assert data["message"] == "Report generated successfully"


def test_get_html_before_generate_returns_400(client: TestClient) -> None:
    created = client.post("/briefings", json=VALID_PAYLOAD).json()
    res = client.get(f"/briefings/{created['id']}/html")
    assert res.status_code == 400


def test_get_html_after_generate(client: TestClient) -> None:
    created = client.post("/briefings", json=VALID_PAYLOAD).json()
    client.post(f"/briefings/{created['id']}/generate")
    res = client.get(f"/briefings/{created['id']}/html")
    assert res.status_code == 200
    assert "text/html" in res.headers["content-type"]
    assert "Acme Holdings" in res.text
    assert "ACME" in res.text
    assert "Revenue Growth" in res.text