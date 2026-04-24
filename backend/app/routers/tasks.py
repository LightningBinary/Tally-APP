from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime

from ..database import get_db
from ..models import Task
from ..schemas import TaskCreate, TaskUpdate, TaskOut

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("/", response_model=List[TaskOut])
def list_tasks(
    date: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    member_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Task).options(joinedload(Task.member))
    if date:
        q = q.filter(Task.date == date)
    if status:
        q = q.filter(Task.status == status)
    if member_id:
        q = q.filter(Task.member_id == member_id)
    return q.order_by(Task.created_at).all()


@router.post("/", response_model=TaskOut)
def create_task(body: TaskCreate, db: Session = Depends(get_db)):
    task = Task(**body.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    # reload with member
    return db.query(Task).options(joinedload(Task.member)).filter(Task.id == task.id).first()


@router.get("/{task_id}", response_model=TaskOut)
def get_task(task_id: int, db: Session = Depends(get_db)):
    t = db.query(Task).options(joinedload(Task.member)).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    return t


@router.put("/{task_id}", response_model=TaskOut)
def update_task(task_id: int, body: TaskUpdate, db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")

    updates = body.model_dump(exclude_unset=True)

    # Auto timestamps on status change
    if "status" in updates:
        if updates["status"] == "in_progress" and not t.start_time:
            updates["start_time"] = datetime.utcnow()
        elif updates["status"] == "done":
            # Set end_time if not already set
            if not t.end_time:
                updates["end_time"] = datetime.utcnow()
            # Calculate duration: use start_time or fallback to now
            start = t.start_time or datetime.utcnow()
            end = updates.get("end_time") or t.end_time or datetime.utcnow()
            updates["duration_min"] = int((end - start).total_seconds() / 60)

    for k, v in updates.items():
        setattr(t, k, v)

    t.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(t)
    return db.query(Task).options(joinedload(Task.member)).filter(Task.id == task_id).first()


@router.delete("/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(t)
    db.commit()
    return {"ok": True}


@router.post("/{task_id}/pause", response_model=TaskOut)
def pause_task(task_id: int, db: Session = Depends(get_db)):
    """Pause an in-progress task — freezes duration counting."""
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    if t.status != "in_progress":
        raise HTTPException(status_code=400, detail="Only in_progress tasks can be paused")
    if t.is_paused:
        raise HTTPException(status_code=400, detail="Task is already paused")

    t.is_paused = True
    t.paused_at = datetime.utcnow()
    t.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(t)
    return db.query(Task).options(joinedload(Task.member)).filter(Task.id == task_id).first()


@router.post("/{task_id}/resume", response_model=TaskOut)
def resume_task(task_id: int, db: Session = Depends(get_db)):
    """Resume a paused task — duration counting continues from where it froze."""
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    if not t.is_paused:
        raise HTTPException(status_code=400, detail="Task is not paused")

    t.is_paused = False
    t.paused_at = None
    t.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(t)
    return db.query(Task).options(joinedload(Task.member)).filter(Task.id == task_id).first()
