from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models import Setting
from ..schemas import SettingUpsert, SettingOut

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/", response_model=List[SettingOut])
def list_settings(db: Session = Depends(get_db)):
    return db.query(Setting).all()


@router.get("/{key}", response_model=SettingOut)
def get_setting(key: str, db: Session = Depends(get_db)):
    s = db.query(Setting).filter(Setting.key == key).first()
    if not s:
        return {"key": key, "value": ""}
    return s


@router.put("/{key}", response_model=SettingOut)
def upsert_setting(key: str, body: SettingUpsert, db: Session = Depends(get_db)):
    s = db.query(Setting).filter(Setting.key == key).first()
    if s:
        s.value = body.value
    else:
        s = Setting(key=key, value=body.value)
        db.add(s)
    db.commit()
    db.refresh(s)
    return s
