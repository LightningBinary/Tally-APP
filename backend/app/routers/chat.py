"""
AI Chat router — fast SQL + LLM agent.

Pipeline (2 paths, 1 LLM call each):
  query_db  → LLM generates SQL + summarizes in one call → execute safely → return
  general   → LLM direct response (1 call)
"""

import os
import re
import sqlite3
from pathlib import Path
from typing import Literal, Optional

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..schemas import ChatRequest, ChatResponse, ChatMessage

# ── Env ─────────────────────────────────────────────────────────────────────────

load_dotenv(Path(__file__).parent.parent.parent / ".env")
SILICONFLOW_KEY = os.getenv("SILICONFLOW_API_KEY", "").strip()
SILICONFLOW_URL = os.getenv("SILICONFLOW_BASE_URL", "https://api.siliconflow.com/v1").strip()
DEEPSEEK_MODEL = "deepseek-ai/DeepSeek-V3"

# NOTE: SILICONFLOW_API_KEY is optional in demo mode.
# If not set, chat will return a friendly "demo mode" message instead.
_llm_available = bool(SILICONFLOW_KEY)

# ── DB paths ────────────────────────────────────────────────────────────────────

BACKEND_DIR = Path(__file__).parent.parent.parent
TALLY_DB    = BACKEND_DIR / "tally.db"
WMS_DB      = BACKEND_DIR / "backend" / "wms.db"

# ── Fast intent detection (keyword-based, no LLM call) ──────────────────────────

# Keywords that indicate the user wants to query warehouse data
_DB_KEYWORDS = (
    "task", "member", "team", "worker", "schedule", "shift",
    "abnormal", "exception", "order", "ship", "wms", "sku",
    "counting", "done", "pending", "in progress", "working",
    "今天", "任务", "成员", "团队", "异常", "工作",
    "多少", "谁在", "有", "show", "how many", "who is",
    "what", "list", "all",
)
_GENERAL_KEYWORDS = (
    "hello", "hi ", "hey", "how are", "thanks", "thank you",
    "what is your", "can you", "help me",
    "你好", "嗨", "嗨",
)


def _is_db_question(message: str) -> bool:
    """Fast keyword-based intent detection — no LLM call needed."""
    m = message.lower().strip()
    # Greeting shortcuts
    if m in ("hi", "hi!", "hello", "hello!", "嗨", "嗨！"):
        return False
    # Count db vs general keyword hits
    db_hits = sum(1 for kw in _DB_KEYWORDS if kw in m)
    gen_hits = sum(1 for kw in _GENERAL_KEYWORDS if kw in m)
    return db_hits > gen_hits


# ── DB helpers ─────────────────────────────────────────────────────────────────

def run_sql(db_path: Path, sql: str) -> tuple[list[dict], str]:
    """
    Execute a read-only SELECT on the given DB.
    Returns (rows, error_message). Row count is capped at 50.
    """
    stmt = sql.strip()
    if not stmt.upper().startswith("SELECT"):
        return [], "Only SELECT statements are allowed."

    for kw in ["INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER", "TRUNCATE", "GRANT", "REVOKE"]:
        if re.search(rf"\b{kw}\b", stmt, re.IGNORECASE):
            return [], f"Keyword '{kw}' is not permitted."

    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute(stmt)
        rows = [dict(r) for r in cur.fetchmany(50)]
        conn.close()
        return rows, ""
    except sqlite3.Error as e:
        return [], f"SQL error: {e}"


# ── LLM helper ─────────────────────────────────────────────────────────────────

_MAX_TOKENS = 150  # Keep responses short and fast


def _llm(prompt: str, system: str = "", history: list = None) -> str:
    """Call SiliconFlow DeepSeek-V3 via chat completions API.
    Falls back to demo message if API key is not configured."""
    if not _llm_available:
        return ("[Demo Mode] LLM API key not configured. "
                "Set SILICONFLOW_API_KEY in .env to enable AI chat features.")

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    if history:
        for m in history:
            messages.append({"role": m.role, "content": m.content})
    messages.append({"role": "user", "content": prompt})

    resp = httpx.post(
        f"{SILICONFLOW_URL}/chat/completions",
        json={
            "model": DEEPSEEK_MODEL,
            "messages": messages,
            "max_tokens": _MAX_TOKENS,
        },
        headers={
            "Authorization": f"Bearer {SILICONFLOW_KEY}",
            "Content-Type": "application/json",
        },
        timeout=30.0,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


# ── SQL generation (combined with summarize in one LLM call) ────────────────────

_DB_SCHEMA = """
DATABASES:
  tally.db — members(id,name,role,avatar_color,phone,note), tasks(id,member_id,title,task_type,status,wms_code,units,duration_min,date,start_time,end_time,is_paused), schedules(id,member_id,day_of_week Mon=0..Sun=6,shift_start,shift_end,is_off)
  wms.db — abnormal_orders(shipNoteNo,pickNo,skuQty,exceptionTypeName,trackNo,create_at,sync_at,resolved_at)
RULES:
  - Only SELECT. No INSERT/UPDATE/DELETE/DROP/CREATE/ALTER.
  - Today = date('now'). Task statuses: 'todo','in_progress','done'.
  - Schedule day_of_week: Mon=1, Tue=2... Sun=0 (strftime('%w','now') on Windows gives 0=Sunday).
  - Max 50 rows. Use JOINs over subqueries.
"""


def _build_db_reply(question: str, history: list = None) -> str:
    """
    Single LLM call: generates SQL, executes it, returns a natural-language reply.
    If SQL fails, the LLM still responds (it knows the schema and can answer directly).
    """
    system = (
        f"You are a warehouse assistant. {_DB_SCHEMA}\n"
        "Reply in plain natural language only. Keep it short (1-3 sentences, max 50 words). "
        "No markdown, no bullet points, no bold, no tables. "
        "If the user asks about data and SQL is needed, include this JSON in your response:\n"
        "SQL: <the SELECT query>\n"
        "So the system can execute it and give you real results. "
        "If no SQL is needed, just answer directly."
    )

    reply = _llm(question, system=system, history=history)

    # Extract SQL from LLM response (it may include SQL in "SQL: ..." format)
    sql_match = re.search(r"SQL:\s*([^\n`]+)", reply, re.IGNORECASE)
    if sql_match:
        sql = sql_match.group(1).strip()
        # Remove trailing semicolons or fences
        sql = re.sub(r"[;`]+$", "", sql).strip()

        # Pick DB
        q = question.lower()
        db_path = WMS_DB if any(kw in q for kw in ["abnormal", "exception", "ship", "wms"]) else TALLY_DB

        rows, err = run_sql(db_path, sql)
        if err:
            return f"{reply.strip()}\n\n(Database query failed: {err})"

        if rows:
            # Give real data to LLM for a better summary
            return _llm(
                f"User asked: {question}\nReal data from database: {rows}\n\n"
                "Reply in 1-3 short sentences. Plain text only. No formatting.",
                system="You are a warehouse assistant. Be concise. Max 50 words.",
            )
        else:
            return _llm(
                f"User asked: {question}\nThe database returned no results.\n\n"
                "Reply in 1 short sentence. Tell the user the data is empty.",
                system="You are a warehouse assistant. Be concise. Max 30 words.",
            )

    return reply


# ── Conversation memory ─────────────────────────────────────────────────────────

_MAX_HISTORY = 6   # messages (3 turns) — keeps context without wasting tokens


def _build_history(incoming: list[ChatMessage]) -> list[ChatMessage]:
    if len(incoming) <= _MAX_HISTORY:
        return incoming
    return incoming[-_MAX_HISTORY:]


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("/message", response_model=ChatResponse)
async def chat_message(req: ChatRequest):
    history = _build_history(req.history)
    intent = "query_db" if _is_db_question(req.message) else "general"
    sql: Optional[str] = None

    try:
        if intent == "query_db":
            reply = _build_db_reply(req.message, history)
        else:
            reply = _llm(
                req.message,
                system=(
                    "You are a warehouse assistant. Be friendly and helpful. "
                    "Keep your reply very short (1-3 sentences, max 50 words). "
                    "Plain natural language only. No markdown formatting."
                ),
                history=history,
            )

    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"LLM API error: {e.response.text}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat error: {e}")

    return ChatResponse(reply=reply.strip(), intent=intent, query=sql)
