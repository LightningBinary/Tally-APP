import sys
from pathlib import Path

# Add project root (backend/) to Python path so 'wms' package is discoverable
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base
from .routers import members, tasks, settings, chat
from . import models  # noqa: ensure models are registered
from wms.router import router as wms_router

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Tally Team Manager", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(members.router)
app.include_router(tasks.router)
app.include_router(settings.router)
app.include_router(wms_router)
app.include_router(chat.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
