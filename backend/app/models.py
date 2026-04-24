from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base


class Member(Base):
    __tablename__ = "members"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    role = Column(String(50), nullable=False, default="Worker")  # Manager / Lead / Worker
    avatar_color = Column(String(20), default="#6366f1")  # hex color per role
    phone = Column(String(30), default="")
    note = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    tasks = relationship("Task", back_populates="member")
    schedules = relationship("Schedule", back_populates="member")


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("members.id"), nullable=True)
    title = Column(String(200), nullable=False)
    task_type = Column(String(100), default="General")  # Stock Check / Re-Count / Value-Add / Count SKUs / General
    status = Column(String(20), default="todo")  # todo / in_progress / done
    is_paused = Column(Boolean, default=False)   # whether the task is paused
    paused_at = Column(DateTime, nullable=True)  # UTC timestamp when paused
    wms_code = Column(String(50), default="")     # e.g. WMS_205
    units = Column(Integer, default=0)
    duration_min = Column(Integer, default=0)     # estimated minutes
    detail = Column(Text, default="")
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    date = Column(String(20), default="")         # YYYY-MM-DD for the work day
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    member = relationship("Member", back_populates="tasks")


class Schedule(Base):
    __tablename__ = "schedules"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("members.id"), nullable=False)
    day_of_week = Column(Integer, nullable=False)   # 0=Mon, 6=Sun
    shift_start = Column(String(10), default="08:00")
    shift_end = Column(String(10), default="17:00")
    is_off = Column(Boolean, default=False)

    member = relationship("Member", back_populates="schedules")


class Setting(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(Text, default="")
