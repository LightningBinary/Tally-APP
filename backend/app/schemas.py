from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ─── Member ───────────────────────────────────────────────────────────────────
class MemberBase(BaseModel):
    name: str
    role: str = "Worker"
    avatar_color: str = "#6366f1"
    phone: str = ""
    note: str = ""


class MemberCreate(MemberBase):
    pass


class MemberUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    avatar_color: Optional[str] = None
    phone: Optional[str] = None
    note: Optional[str] = None


class MemberOut(MemberBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Task ─────────────────────────────────────────────────────────────────────
class TaskBase(BaseModel):
    title: str
    task_type: str = "General"
    status: str = "todo"
    wms_code: str = ""
    units: int = 0
    duration_min: int = 0
    detail: str = ""
    date: str = ""
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    member_id: Optional[int] = None
    is_paused: bool = False
    paused_at: Optional[datetime] = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    task_type: Optional[str] = None
    status: Optional[str] = None
    wms_code: Optional[str] = None
    units: Optional[int] = None
    duration_min: Optional[int] = None
    detail: Optional[str] = None
    date: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    member_id: Optional[int] = None
    is_paused: Optional[bool] = None
    paused_at: Optional[datetime] = None


class TaskOut(TaskBase):
    id: int
    created_at: datetime
    updated_at: datetime
    member: Optional[MemberOut] = None

    model_config = {"from_attributes": True}


# ─── Schedule ─────────────────────────────────────────────────────────────────
class ScheduleBase(BaseModel):
    day_of_week: int
    shift_start: str = "08:00"
    shift_end: str = "17:00"
    is_off: bool = False


class ScheduleCreate(ScheduleBase):
    member_id: int


class ScheduleUpdate(BaseModel):
    shift_start: Optional[str] = None
    shift_end: Optional[str] = None
    is_off: Optional[bool] = None


class ScheduleOut(ScheduleBase):
    id: int
    member_id: int

    model_config = {"from_attributes": True}


# ─── Setting ──────────────────────────────────────────────────────────────────
class SettingUpsert(BaseModel):
    key: str
    value: str


class SettingOut(BaseModel):
    key: str
    value: str

    model_config = {"from_attributes": True}


# ─── Chat ─────────────────────────────────────────────────────────────────────
class ChatMessage(BaseModel):
    """A single message in the conversation."""
    role: str          # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []   # last N messages for multi-turn context


class ChatResponse(BaseModel):
    reply: str          # markdown-formatted text
    intent: str         # detected intent: "query_db" | "general"
    query: Optional[str] = None   # SQL query if intent == "query_db"
