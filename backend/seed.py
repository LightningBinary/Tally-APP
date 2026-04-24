"""Seed the database with sample members and tasks."""
import sys
sys.path.insert(0, '.')

from datetime import datetime, timedelta
from app.database import SessionLocal, engine, Base
from app.models import Member, Task, Schedule

# Create tables
Base.metadata.create_all(bind=engine)

db = SessionLocal()

# Check if already seeded
if db.query(Member).count() > 0:
    print("Database already has data, skipping seed.")
    db.close()
    exit(0)

today = datetime.now().strftime('%Y-%m-%d')

# Create members - each with a distinct color
members_data = [
    {"name": "Alex Chen",     "role": "Lead",    "avatar_color": "#6366f1"},  # indigo
    {"name": "Maria Garcia", "role": "Worker",  "avatar_color": "#ec4899"},  # pink
    {"name": "James Wilson", "role": "Worker",  "avatar_color": "#f97316"},  # orange
    {"name": "Sophie Brown", "role": "Manager", "avatar_color": "#a855f7"},  # violet
    {"name": "Liam Johnson", "role": "Worker",  "avatar_color": "#14b8a6"},  # teal
]

for md in members_data:
    m = Member(**md)
    db.add(m)
    db.commit()
    db.refresh(m)
    # Default schedules Mon-Fri 08:00-17:00, Sat-Sun off
    for day in range(7):
        sched = Schedule(
            member_id=m.id,
            day_of_week=day,
            shift_start="08:00",
            shift_end="17:00",
            is_off=(day >= 5)
        )
        db.add(sched)
    db.commit()
    print(f"  Created member: {m.name} (id={m.id})")

# Create some sample tasks
tasks_data = [
    # TO DO tasks (no timestamps yet)
    {"title": "Counting",     "task_type": "Counting",      "status": "todo",        "member_id": 1, "wms_code": "", "units": 350,  "duration_min": 0,   "detail": "Full inventory count for Zone A, report discrepancies.", "date": today},
    {"title": "Return",        "task_type": "Return",         "status": "todo",        "member_id": 2, "wms_code": "", "units": 120,  "duration_min": 0,   "detail": "Verify returned items match RMA records.", "date": today},
    {"title": "Counting",     "task_type": "Counting",       "status": "todo",        "member_id": 3, "wms_code": "", "units": 200,  "duration_min": 0,   "detail": "Cycle count - high-value SKUs only.", "date": today},
    {"title": "Abnormal",     "task_type": "Abnormal",       "status": "todo",        "member_id": 5, "wms_code": "", "units": 280,  "duration_min": 0,   "detail": "", "date": today},
    {"title": "Turnover",    "task_type": "Turnover",       "status": "todo",        "member_id": None, "wms_code": "", "units": 0,    "duration_min": 0,  "detail": "Driver waiting at dock 3 - urgent.", "date": today},
    {"title": "Other",       "task_type": "Other",           "status": "todo",        "member_id": None, "wms_code": "", "units": 0,    "duration_min": 0,  "detail": "Transfer from receiving bay to staging area.", "date": today},
    # IN PROGRESS tasks (with start_time)
    {"title": "Value-Added",  "task_type": "Value-Added",   "status": "in_progress", "member_id": 2, "wms_code": "", "units": 80,   "duration_min": 0,   "detail": "Gift wrapping for VIP customer orders.", "date": today, "start_time": datetime.now() - timedelta(minutes=25)},
    {"title": "Turnover",    "task_type": "Turnover",       "status": "in_progress", "member_id": 3, "wms_code": "", "units": 60,   "duration_min": 0,   "detail": "Discrepancy flagged - verify count.", "date": today, "start_time": datetime.now() - timedelta(minutes=10)},
    # DONE tasks (with start_time + end_time)
    {"title": "Other",        "task_type": "Other",           "status": "done",        "member_id": 1, "wms_code": "", "units": 500,  "duration_min": 25, "detail": "", "date": today, "start_time": datetime.now() - timedelta(hours=2), "end_time": datetime.now() - timedelta(hours=1, minutes=35)},
    {"title": "Return",       "task_type": "Return",          "status": "done",        "member_id": 5, "wms_code": "", "units": 150,  "duration_min": 30, "detail": "", "date": today, "start_time": datetime.now() - timedelta(hours=3), "end_time": datetime.now() - timedelta(hours=2, minutes=30)},
]

for td in tasks_data:
    t = Task(**td)
    db.add(t)

db.commit()
print(f"  Created {len(tasks_data)} sample tasks.")
print("Seed complete!")
db.close()
