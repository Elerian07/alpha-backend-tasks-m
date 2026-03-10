from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.briefing import BriefingCreate, BriefingGenerateResponse, BriefingRead
from app.services.briefing_formatter import briefing_report_formatter
from app.services.briefing_service import create_briefing, get_briefing, mark_as_generated

router = APIRouter(prefix="/briefings", tags=["briefings"])

DbDep = Annotated[Session, Depends(get_db)]


def _get_or_404(db: Session, briefing_id: int):
    briefing = get_briefing(db, briefing_id)
    if briefing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Briefing not found")
    return briefing


@router.post("", response_model=BriefingRead, status_code=status.HTTP_201_CREATED)
def create(payload: BriefingCreate, db: DbDep):
    briefing = create_briefing(db, payload)
    return BriefingRead.model_validate(briefing)


@router.get("/{briefing_id}", response_model=BriefingRead)
def retrieve(briefing_id: int, db: DbDep):
    briefing = _get_or_404(db, briefing_id)
    return BriefingRead.model_validate(briefing)


@router.post("/{briefing_id}/generate", response_model=BriefingGenerateResponse)
def generate(briefing_id: int, db: DbDep):
    briefing = _get_or_404(db, briefing_id)
    briefing = mark_as_generated(db, briefing)
    return BriefingGenerateResponse(
        id=briefing.id,
        generated_at=briefing.generated_at,
        message="Report generated successfully",
    )


@router.get("/{briefing_id}/html")
def get_html(briefing_id: int, db: DbDep):
    briefing = _get_or_404(db, briefing_id)
    if briefing.generated_at is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Report has not been generated yet. Call POST /briefings/{id}/generate first.",
        )
    html = briefing_report_formatter.render(briefing)
    return Response(content=html, media_type="text/html")
