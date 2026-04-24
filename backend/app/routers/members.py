from datetime import date as date_type
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Member, Schedule
from ..schemas import MemberCreate, MemberUpdate, MemberOut, ScheduleCreate, ScheduleUpdate, ScheduleOut

router = APIRouter(prefix="/api/members", tags=["members"])


@router.get("/", response_model=List[MemberOut])
def list_members(db: Session = Depends(get_db)):
    return db.query(Member).order_by(Member.id).all()


@router.get("/working-today", response_model=List[MemberOut])
def get_working_today(
    date: Optional[str] = Query(None, description="YYYY-MM-DD; defaults to today"),
    db: Session = Depends(get_db),
):
    """
    Return all members scheduled to work on a given date.
    Uses Schedule.is_off=False and matching day_of_week (0=Mon … 6=Sun).
    Members who have no schedule row for that day are assumed to be working.
    """
    if date:
        try:
            target = date_type.fromisoformat(date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")
    else:
        target = date_type.today()

    dow = target.weekday()  # 0=Mon … 6=Sun (matches Schedule.day_of_week)

    # Get IDs of members who are explicitly marked as OFF on this day
    off_ids = {
        row.member_id
        for row in db.query(Schedule.member_id)
        .filter(Schedule.day_of_week == dow, Schedule.is_off == True)  # noqa: E712
        .all()
    }

    members = (
        db.query(Member)
        .filter(Member.id.notin_(off_ids))
        .order_by(Member.id)
        .all()
    )
    return members


@router.post("/", response_model=MemberOut)
def create_member(body: MemberCreate, db: Session = Depends(get_db)):
    member = Member(**body.model_dump())
    db.add(member)
    db.commit()
    db.refresh(member)
    # Auto-create 7 default schedule rows
    for day in range(7):
        sched = Schedule(member_id=member.id, day_of_week=day)
        db.add(sched)
    db.commit()
    return member


@router.get("/{member_id}", response_model=MemberOut)
def get_member(member_id: int, db: Session = Depends(get_db)):
    m = db.query(Member).filter(Member.id == member_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    return m


@router.put("/{member_id}", response_model=MemberOut)
def update_member(member_id: int, body: MemberUpdate, db: Session = Depends(get_db)):
    m = db.query(Member).filter(Member.id == member_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    db.commit()
    db.refresh(m)
    return m


@router.delete("/{member_id}")
def delete_member(member_id: int, db: Session = Depends(get_db)):
    m = db.query(Member).filter(Member.id == member_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    db.delete(m)
    db.commit()
    return {"ok": True}


# ─── Schedules ────────────────────────────────────────────────────────────────
@router.get("/{member_id}/schedules", response_model=List[ScheduleOut])
def get_schedules(member_id: int, db: Session = Depends(get_db)):
    return db.query(Schedule).filter(Schedule.member_id == member_id).order_by(Schedule.day_of_week).all()


@router.put("/{member_id}/schedules/{day}", response_model=ScheduleOut)
def update_schedule(member_id: int, day: int, body: ScheduleUpdate, db: Session = Depends(get_db)):
    sched = db.query(Schedule).filter(
        Schedule.member_id == member_id, Schedule.day_of_week == day
    ).first()
    if not sched:
        raise HTTPException(status_code=404, detail="Schedule not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(sched, k, v)
    db.commit()
    db.refresh(sched)
    return sched
