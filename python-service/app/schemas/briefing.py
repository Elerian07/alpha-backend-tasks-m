from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator



class MetricCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    value: str = Field(min_length=1, max_length=100)


class MetricRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    value: str


class PointRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    point_type: str
    content: str
    display_order: int



class BriefingCreate(BaseModel):
    companyName: str = Field(min_length=1, max_length=200)
    ticker: str = Field(min_length=1, max_length=20)
    sector: str = Field(min_length=1, max_length=100)
    analystName: str = Field(min_length=1, max_length=150)
    summary: str = Field(min_length=1)
    recommendation: str = Field(min_length=1)
    keyPoints: list[str] = Field(min_length=2)
    risks: list[str] = Field(min_length=1)
    metrics: list[MetricCreate] = Field(default_factory=list)

    @field_validator("ticker")
    @classmethod
    def normalize_ticker(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("keyPoints")
    @classmethod
    def validate_key_points(cls, v: list[str]) -> list[str]:
        if len(v) < 2:
            raise ValueError("At least 2 key points are required")
        return [p.strip() for p in v if p.strip()]

    @field_validator("risks")
    @classmethod
    def validate_risks(cls, v: list[str]) -> list[str]:
        if len(v) < 1:
            raise ValueError("At least 1 risk is required")
        return [r.strip() for r in v if r.strip()]

    @model_validator(mode="after")
    def validate_unique_metric_names(self) -> "BriefingCreate":
        names = [m.name.strip().lower() for m in self.metrics]
        if len(names) != len(set(names)):
            raise ValueError("Metric names must be unique within the same briefing")
        return self


class BriefingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_name: str
    ticker: str
    sector: str
    analyst_name: str
    summary: str
    recommendation: str
    generated_at: datetime | None
    created_at: datetime
    points: list[PointRead]
    metrics: list[MetricRead]


class BriefingGenerateResponse(BaseModel):
    id: int
    generated_at: datetime
    message: str