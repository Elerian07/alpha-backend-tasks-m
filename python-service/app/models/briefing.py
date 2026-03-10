from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Briefing(Base):
    __tablename__ = "briefings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_name: Mapped[str] = mapped_column(String(200), nullable=False)
    ticker: Mapped[str] = mapped_column(String(20), nullable=False)
    sector: Mapped[str] = mapped_column(String(100), nullable=False)
    analyst_name: Mapped[str] = mapped_column(String(150), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    recommendation: Mapped[str] = mapped_column(Text, nullable=False)
    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    points: Mapped[list["BriefingPoint"]] = relationship(
        "BriefingPoint", back_populates="briefing", cascade="all, delete-orphan", order_by="BriefingPoint.display_order"
    )
    metrics: Mapped[list["BriefingMetric"]] = relationship(
        "BriefingMetric", back_populates="briefing", cascade="all, delete-orphan"
    )


class BriefingPoint(Base):
    __tablename__ = "briefing_points"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    briefing_id: Mapped[int] = mapped_column(Integer, ForeignKey("briefings.id", ondelete="CASCADE"), nullable=False)
    point_type: Mapped[str] = mapped_column(String(10), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    briefing: Mapped["Briefing"] = relationship("Briefing", back_populates="points")


class BriefingMetric(Base):
    __tablename__ = "briefing_metrics"

    __table_args__ = (UniqueConstraint("briefing_id", "name", name="uq_briefing_metric_name"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    briefing_id: Mapped[int] = mapped_column(Integer, ForeignKey("briefings.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[str] = mapped_column(String(100), nullable=False)

    briefing: Mapped["Briefing"] = relationship("Briefing", back_populates="metrics")