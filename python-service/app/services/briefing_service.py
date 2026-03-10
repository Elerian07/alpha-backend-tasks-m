from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.briefing import Briefing, BriefingMetric, BriefingPoint
from app.schemas.briefing import BriefingCreate


def _load_briefing(db: Session, briefing_id: int) -> Briefing | None:
    query = (
        select(Briefing)
        .where(Briefing.id == briefing_id)
        .options(selectinload(Briefing.points), selectinload(Briefing.metrics))
    )
    return db.scalars(query).first()


def create_briefing(db: Session, payload: BriefingCreate) -> Briefing:
    briefing = Briefing(
        company_name=payload.companyName.strip(),
        ticker=payload.ticker,
        sector=payload.sector.strip(),
        analyst_name=payload.analystName.strip(),
        summary=payload.summary.strip(),
        recommendation=payload.recommendation.strip(),
    )
    db.add(briefing)
    db.flush()

    for order, content in enumerate(payload.keyPoints):
        db.add(BriefingPoint(briefing_id=briefing.id, point_type="key_point", content=content, display_order=order))

    for order, content in enumerate(payload.risks):
        db.add(BriefingPoint(briefing_id=briefing.id, point_type="risk", content=content, display_order=order))

    for metric in payload.metrics:
        db.add(BriefingMetric(briefing_id=briefing.id, name=metric.name.strip(), value=metric.value.strip()))

    db.commit()
    db.refresh(briefing)
    return _load_briefing(db, briefing.id) 


def get_briefing(db: Session, briefing_id: int) -> Briefing | None:
    return _load_briefing(db, briefing_id)


def mark_as_generated(db: Session, briefing: Briefing) -> Briefing:
    briefing.generated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(briefing)
    return _load_briefing(db, briefing.id) 