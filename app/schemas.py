import uuid
from datetime import datetime
from typing import Optional, Any

from pydantic import BaseModel, EmailStr, Field

from app.models import UserRole, DatasetStatus, AnalysisType


# ---------- Auth / Users ----------

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: Optional[str]
    role: UserRole
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---------- Datasets ----------

class DatasetOut(BaseModel):
    id: uuid.UUID
    filename: str
    file_type: str
    file_size_bytes: int
    rows: Optional[int]
    columns: Optional[int]
    status: DatasetStatus
    data_quality_score: Optional[float]
    uploaded_at: datetime

    class Config:
        from_attributes = True


class DatasetProfileOut(BaseModel):
    id: uuid.UUID
    profile_summary: Optional[dict[str, Any]]
    data_quality_score: Optional[float]

    class Config:
        from_attributes = True


# ---------- Cleaning ----------

class CleaningResultOut(BaseModel):
    id: uuid.UUID
    status: DatasetStatus
    cleaning_summary: Optional[dict[str, Any]]

    class Config:
        from_attributes = True


# ---------- Analyses ----------

class AnalysisOut(BaseModel):
    id: uuid.UUID
    dataset_id: uuid.UUID
    analysis_type: AnalysisType
    result_json: Optional[dict[str, Any]]
    insight_text: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
