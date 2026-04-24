"""
FastAPI router for WMS (Rainbow + China Post) endpoints.

Key design:
  - Token / PHPSESSID are refreshed AUTOMATICALLY when the server returns 401.
  - Refresh endpoint is debounced (10-second cooldown) to prevent rapid re-logins.
  - Abnormal orders are stored in the local wms.db; fetched from Rainbow on demand.
"""

import asyncio
import os
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import rainbow_api as rainbow
from . import cp_api as cp
from . import wms_db as db

router = APIRouter(prefix="/api/wms", tags=["wms"])

# ── Env ───────────────────────────────────────────────────────────────────────

ENV_PATH = Path(__file__).parent.parent / ".env"
load_dotenv(ENV_PATH)

# ── Rate-limit state (module-level, lives for process lifetime) ───────────────

_refresh_cooldown: float = 0.0  # Unix timestamp — earliest time next refresh is allowed
REFRESH_COOLDOWN_SEC = 10        # 10-second debounce between Playwright re-logins

# ── Response models ────────────────────────────────────────────────────────────

class AbnormalOrder(BaseModel):
    shipNoteNo: str
    pickNo: Optional[str] = None
    skuQty: Optional[int] = None
    exceptionTypeName: Optional[str] = None
    trackNo: Optional[str] = None
    create_at: Optional[str] = None
    sync_at: Optional[str] = None
    resolved_at: Optional[str] = None
    skus: list[str] = []


class AbnormalDetail(BaseModel):
    sku: str
    planQty: int
    pickQty: int
    locationCode: str
    order_date: Optional[str] = None


class CpSkuReport(BaseModel):
    sku: str
    detail: dict
    inventory: list
    history: list
    qr_code_base64: Optional[str] = None


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_rainbow_token() -> str:
    token = os.getenv("RAINBOW_TOKEN", "").strip()
    if not token:
        raise HTTPException(
            status_code=401,
            detail="RAINBOW_TOKEN not set. A background refresh will be triggered.",
        )
    return token


def _run_async(coro):
    """
    Run an async coroutine from a synchronous context (e.g. background threads).

    Uses a fresh event loop per call so httpx's connection pool is isolated
    and its async cleanup tasks (connection draining, TLS shutdown) are all
    dispatched and drained on the same loop before it is closed.

    Key design decisions on Windows + Python 3.14:
      - WindowsProactorEventLoopPolicy is set before creating the loop so that
        subprocess_exec (used by Playwright) works — SelectorEventLoop raises
        NotImplementedError for subprocesses on Windows.
      - The httpx client singleton is reset after each call so that the next
        call creates a fresh client on its own loop — avoiding "bound to a
        different event loop" errors from httpx internals.
      - Pending background tasks (httpx connection cleanup) are drained via
        run_until_complete(loop.shutdown_default_executor()) before close(),
        preventing "Event loop is closed" races in ProactorEventLoop.
    """
    if os.name == "nt":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        # Drain any pending asyncio work (httpx/httpcore/anyio cleanup tasks)
        # before closing the loop. Without this, ProactorEventLoop.close()
        # races against httpx's scheduled aclose() callbacks and raises
        # RuntimeError: Event loop is closed.
        try:
            loop.run_until_complete(loop.shutdown_default_executor())
        except Exception:
            pass  # executor may already be None or closed

        loop.close()

        # Reset the httpx client singleton so the next _run_async call
        # creates a fresh one on its own loop. A client bound to a closed
        # loop causes "bound to a different event loop" errors.
        rainbow._http_client = None


# ── Automatic token refresh on 401 ───────────────────────────────────────────

def _refresh_rainbow_token_and_retry(token_ref: dict, coro_func, *args, persist: bool = True):
    """
    Try an async coroutine; if it raises an auth error, automatically refresh
    the Rainbow token and retry once.
    The refreshed token is persisted to .env.
    Pass persist=False to skip DB writes (search-only mode).
    """
    global _refresh_cooldown

    # First attempt
    try:
        return _run_async(coro_func(*args, token=token_ref["token"], persist=persist))
    except HTTPException as e:
        if e.status_code != 401:
            raise
        print("[WMS] Rainbow token expired — auto-refreshing...")

    # Refresh: wait for cooldown if needed
    now = time.time()
    wait = max(0, _refresh_cooldown - now)
    if wait > 0:
        print(f"[WMS] Refresh cooldown active — waiting {wait:.1f}s")
        time.sleep(wait)

    _refresh_cooldown = time.time() + REFRESH_COOLDOWN_SEC

    # Signal SSE watcher that a refresh is in progress
    _token_refresh_in_progress.set()
    _token_refresh_error.clear()

    try:
        # Do the Playwright login (sync version — avoids asyncio subprocess issues on Windows)
        new_token = rainbow.refresh_rainbow_token_sync()
        token_ref["token"] = new_token
        _persist_token(new_token)

        if not new_token:
            # Playwright failed — signal error
            _token_refresh_error.set()
            print("[WMS] Token refresh failed (Playwright could not get token).")
            raise HTTPException(
                status_code=401,
                detail="Rainbow token refresh failed. Please try again.",
            )

        print(f"[WMS] Token refreshed, retrying request...")
        return _run_async(coro_func(*args, token=new_token, persist=persist))
    finally:
        _token_refresh_in_progress.clear()


def _persist_token(token: str):
    """Write RAINBOW_TOKEN back to .env so it survives restarts."""
    import re
    env_path = ENV_PATH
    if env_path.exists():
        content = env_path.read_text(encoding="utf-8")
    else:
        content = ""

    if re.search(r"^RAINBOW_TOKEN=", content, re.MULTILINE):
        content = re.sub(
            r"^RAINBOW_TOKEN=.*$",
            f"RAINBOW_TOKEN={token}",
            content,
            flags=re.MULTILINE,
        )
    else:
        content += f"\nRAINBOW_TOKEN={token}\n"

    env_path.write_text(content, encoding="utf-8")
    # Reload so os.getenv picks it up
    load_dotenv(ENV_PATH)


def _auto_refresh_cp_session(phpsessid_ref: dict, func, *args):
    """Try a CP call; if it fails with auth error, refresh PHPSESSID and retry once.
    If the refresh itself returns an empty string (Playwright failed), re-raise the
    original HTTPException so the client gets a meaningful error instead of a chain
    of misleading 401s.
    """
    global _refresh_cooldown

    # ── Try 1 ────────────────────────────────────────────────────────────────
    try:
        return func(*args, phpsessid=phpsessid_ref["phpsessid"])
    except HTTPException as e:
        if e.status_code != 401:
            raise
        reason = e.detail
    except cp.CpAuthExpired as e:
        reason = str(e)
    else:
        return  # succeeded on first try

    # ── Refresh PHPSESSID ───────────────────────────────────────────────────
    print(f"[WMS] CP session expired — auto-refreshing PHPSESSID... ({reason})")
    now = time.time()
    wait = max(0, _refresh_cooldown - now)
    if wait > 0:
        time.sleep(wait)

    _refresh_cooldown = time.time() + REFRESH_COOLDOWN_SEC

    new_sessid = _run_async(cp.refresh_cp_phpsessid())

    # If Playwright failed to extract a PHPSESSID, propagate original error
    # with a clear message instead of retrying with an empty string.
    if not new_sessid:
        raise HTTPException(
            status_code=401,
            detail=(
                f"CP session refresh failed. "
                f"Playwright could not extract PHPSESSID. "
                f"Original error: {reason}"
            ),
        )

    phpsessid_ref["phpsessid"] = new_sessid
    _persist_cp_sessid(new_sessid)

    # ── Try 2 (with fresh PHPSESSID) ───────────────────────────────────────
    return func(*args, phpsessid=new_sessid)


def _persist_cp_sessid(sessid: str):
    import re
    env_path = ENV_PATH
    if env_path.exists():
        content = env_path.read_text(encoding="utf-8")
    else:
        content = ""

    if re.search(r"^CP_PHPSESSID=", content, re.MULTILINE):
        content = re.sub(
            r"^CP_PHPSESSID=.*$",
            f"CP_PHPSESSID={sessid}",
            content,
            flags=re.MULTILINE,
        )
    else:
        content += f"\nCP_PHPSESSID={sessid}\n"

    env_path.write_text(content, encoding="utf-8")
    load_dotenv(ENV_PATH)


# ── Token refresh SSE pub/sub ───────────────────────────────────────────────

import asyncio
import json
import threading
from typing import Optional

_token_refresh_listeners: list[asyncio.Queue] = []
_token_refresh_lock = asyncio.Lock()
_token_refresh_in_progress = threading.Event()   # set by bg thread, watched by watcher task
_token_refresh_error = threading.Event()         # set on failure
_sse_watcher_running = False


def _start_sse_watcher(loop: asyncio.AbstractEventLoop):
    """Start (or ensure running) the background task that watches threading.Events and emits SSE."""
    global _sse_watcher_running
    if _sse_watcher_running:
        return
    _sse_watcher_running = True

    async def _watch():
        while _sse_watcher_running:
            # Poll every 200ms — lightweight way to bridge threading.Event → asyncio
            await asyncio.sleep(0.2)
            if _token_refresh_in_progress.is_set():
                await _publish_token_event("token:refreshing", "Rainbow token expired — logging in...")
                # Wait for the event to clear (means refresh is done)
                while _token_refresh_in_progress.is_set() and _sse_watcher_running:
                    await asyncio.sleep(0.2)
                # Determine outcome
                if _token_refresh_error.is_set():
                    _token_refresh_error.clear()
                    await _publish_token_event("token:error", "Token refresh failed. Please try again.")
                else:
                    await _publish_token_event("token:refreshed", "Token refreshed and saved.")

    async def _run_watcher():
        try:
            await _watch()
        except Exception:
            pass
        finally:
            global _sse_watcher_running
            _sse_watcher_running = False

    asyncio.ensure_future(_run_watcher(), loop=loop)


async def _publish_token_event(event: str, detail: str = ""):
    """Push a token-refresh event to all connected SSE clients."""
    payload = json.dumps({"event": event, "detail": detail})
    async with _token_refresh_lock:
        listeners = list(_token_refresh_listeners)
    for q in listeners:
        try:
            await q.put(payload)
        except Exception:
            pass


# ── Token refs (shared mutable state) ────────────────────────────────────────

_rainbow_token_ref: dict = {"token": os.getenv("RAINBOW_TOKEN", "").strip()}


def _get_cp_sessid() -> str:
    """Read CP_PHPSESSID fresh from .env each time (not cached at module load)."""
    load_dotenv(ENV_PATH, override=True)
    return os.getenv("CP_PHPSESSID", "").strip()

# ── In-memory TTL cache for order details ───────────────────────────────────────
_DETAIL_CACHE_TTL_SEC = 60  # 1-minute TTL — avoids hammering Rainbow on repeated clicks

_detail_cache: dict[str, tuple[list, float]] = {}  # ship_note_no → (rows, cached_at)


# ── Internal fetch helpers ────────────────────────────────────────────────────

async def _fetch_abnormal_from_rainbow(token: str = None, persist: bool = True):
    """Pull pending abnormal orders from Rainbow and persist to wms.db.
    If token is None, reads from _rainbow_token_ref (used by _sync_bg).
    """
    if token is None:
        token = _rainbow_token_ref["token"]
    raw_list = await rainbow.get_abnormal_list_api(token, exception_status=1)

    # Build active set FIRST so we can mark-resolve even if raw_list is empty
    active_nos = [o["shipNoteNo"] for o in (raw_list or [])]

    # Always run mark_resolved_orders — if raw_list is empty, this clears ALL pending
    # orders (server has no active exceptions). Must run BEFORE the early return.
    db.mark_resolved_orders(active_nos)

    if not raw_list:
        return
    db.save_abnormal_list(raw_list)

    # For each order, fetch SKU detail and save to DB
    for order in raw_list:
        order_no = order["shipNoteNo"]
        order_date = order.get("create_at") or order.get("sync_at")
        if order_date and "T" in order_date:
            order_date = order_date.split("T")[0]

        # get_abnormal_handle_api already returns extracted records — no need to re-extract
        detail = await rainbow.get_abnormal_handle_api(order_no, token)
        db.save_abnormal_order_detail(order_no, detail, order_date)


async def _fetch_rainbow_sku_async(sku: str, token: str, persist: bool = True):
    """Fetch full SKU report from Rainbow. If persist=False, returns data without saving to DB."""
    # NOTE: get_sku_detail_api already calls _extract_sku_info internally,
    #       get_sku_inventory_balance_api already calls _extract_inventory_info internally,
    #       get_sku_history_api already returns the shaped list.
    #       Do NOT call _extract_* again — that would strip the size/weight fields.

    # ── Parallel fetch: all 3 API calls fire simultaneously ──────────────────────
    # Previously these were sequential (A + B + C = ~5s). With gather they run
    # concurrently, so total time = max(A, B, C) ≈ 1-2s.
    results = await asyncio.gather(
        rainbow.get_sku_detail_api(sku, token),
        rainbow.get_sku_inventory_balance_api(sku, token),
        rainbow.get_sku_history_api(sku, token),
        return_exceptions=True,   # one failure doesn't kill the whole request
    )

    sku_info  = results[0] if not isinstance(results[0], Exception) else {}
    inventory = results[1] if not isinstance(results[1], Exception) else []
    hist_raw  = results[2] if not isinstance(results[2], Exception) else []

    # Log any individual failures without blocking the response
    for i, res in enumerate(results):
        if isinstance(res, Exception):
            names = ["sku_detail", "inventory", "history"]
            print(f"[WMS] _fetch_rainbow_sku_async: {names[i]} failed — {res}")

    history = [
        {
            "sku": h.get("sku"),
            "locationCode": h.get("locationCode"),
            "updateTime": h.get("updateTime"),
        }
        for h in (hist_raw or [])
    ]

    # Persist to DB only when requested (skip for search-only mode)
    if persist:
        if inventory:
            db.save_sku_inventory(sku, inventory)
        if sku_info:
            db.save_sku_details(sku, sku_info)
        if history:
            db.save_sku_history(sku, history)
        db.save_sku_report(sku, sku_info, inventory, history)

    # Generate QR for the report
    qr = db._generate_qr_base64(sku)

    return {
        "sku": sku,
        "sku_info": sku_info,
        "inventory": inventory,
        "history": history,
        "qr_code_base64": qr,
        "sync_at": datetime.now().isoformat(),
    }


def _sync_bg(token: str):
    try:
        # persist=False: background sync only pulls from Rainbow, does not
        # re-save SKU details (they were already saved in _fetch_abnormal_from_rainbow).
        _refresh_rainbow_token_and_retry(
            {"token": token},
            _fetch_abnormal_from_rainbow,
            persist=False,
        )
    finally:
        # Reload token from .env in case it was refreshed during the fetch
        load_dotenv(ENV_PATH, override=True)
        refreshed = os.getenv("RAINBOW_TOKEN", "").strip()
        if refreshed:
            _rainbow_token_ref["token"] = refreshed


# ── API Endpoints ─────────────────────────────────────────────────────────────

@router.get("/abnormal-orders", response_model=list[AbnormalOrder])
def get_abnormal_orders(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    status: str = "all",
):
    """
    Get abnormal orders from local wms.db.
    Orders are populated when /abnormal-orders/refresh is called.
    """
    return db.get_abnormal_orders(
        start_date=start_date,
        end_date=end_date,
        status=status,
    )


@router.post("/abnormal-orders/refresh")
def refresh_abnormal_orders():
    """
    Pull fresh abnormal order list from Rainbow WMS server.

    Debounced: if called within 10 seconds of the last call, returns immediately
    without triggering another Playwright login.
    """
    global _refresh_cooldown

    now = time.time()
    if _refresh_cooldown > now:
        remaining = _refresh_cooldown - now
        return {
            "status": "debounced",
            "message": f"Refresh cooldown active ({remaining:.0f}s remaining)",
            "cooldown_remaining": round(remaining),
        }

    token = _get_rainbow_token()
    _refresh_cooldown = now + REFRESH_COOLDOWN_SEC

    t = threading.Thread(target=_sync_bg, args=(token,), daemon=True)
    t.start()
    return {"status": "ok", "message": "Refresh started in background"}


@router.get("/abnormal-orders/{ship_note_no}/detail", response_model=list[AbnormalDetail])
async def get_abnormal_order_detail(ship_note_no: str):
    """Get SKU/pick details for a specific abnormal order.
    If DB has no detail (e.g. after DB clear), fetch from Rainbow API on-the-fly.
    Results are cached in-memory for 60 seconds to avoid hammering the API.
    """
    # 0. Check in-memory TTL cache
    now = time.time()
    if ship_note_no in _detail_cache:
        rows, cached_at = _detail_cache[ship_note_no]
        if now - cached_at < _DETAIL_CACHE_TTL_SEC:
            return rows

    # 1. Try DB first
    conn = db._conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT sku, planQty, pickQty, locationCode, order_date "
        "FROM abnormal_order_detail WHERE orderNo = ?",
        (ship_note_no,),
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    if rows:
        _detail_cache[ship_note_no] = (rows, now)
        return rows

    # 2. DB is empty — fetch from Rainbow API on-the-fly
    token = _get_rainbow_token()
    detail_raw = await rainbow.get_abnormal_handle_api(ship_note_no, token)

    # 3. If Rainbow has data, save and return it
    if detail_raw:
        db.save_abnormal_order_detail(ship_note_no, detail_raw, None)
        rows = [
            AbnormalDetail(
                sku=item.get("sku", ""),
                planQty=item.get("planQty", 0),
                pickQty=item.get("pickQty", 0),
                locationCode=item.get("locationCode", ""),
            )
            for item in detail_raw
        ]
        _detail_cache[ship_note_no] = (rows, now)
        return rows

    # 4. Cache negative result too (prevents repeated failed API calls)
    _detail_cache[ship_note_no] = ([], now)
    return []


# ── Rainbow SKU search ────────────────────────────────────────────────────────

@router.get("/token-refresh-events")
async def token_refresh_events():
    """
    SSE stream that pushes token-refresh events to the frontend.
    Events:
      - token:refreshing  — Rainbow token refresh has started
      - token:refreshed   — Rainbow token has been refreshed successfully
      - token:error       — Rainbow token refresh failed
    """
    # Lazily start the SSE watcher (watches threading.Event → emits SSE)
    try:
        loop = asyncio.get_running_loop()
        _start_sse_watcher(loop)
    except RuntimeError:
        pass

    q: asyncio.Queue = asyncio.Queue()

    async with _token_refresh_lock:
        _token_refresh_listeners.append(q)

    async def event_stream():
        try:
            yield "event: connected\ndata: {\"event\":\"connected\"}\n\n"
            while True:
                payload = await q.get()
                yield f"data: {payload}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            async with _token_refresh_lock:
                if q in _token_refresh_listeners:
                    _token_refresh_listeners.remove(q)

    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/rainbow/sku/{sku}")
async def get_rainbow_sku_report(sku: str, skip_cache: bool = False):
    """
    Fetch complete SKU report from Rainbow WMS.
    Auto-refreshes token on 401 and retries.

    If skip_cache=True (used by Search page): fetches fresh data from server
    WITHOUT saving to wms.db. Each search is a live query only.

    If skip_cache=False (used by Abnormal page): checks DB cache first,
    persists fresh data to DB for future lookups.
    """
    # ── Token resolution ────────────────────────────────────────────────────────
    token = _get_rainbow_token()

    # ── Search-only mode: always fetch fresh, never touch DB ───────────────────
    if skip_cache:
        try:
            result = await _fetch_rainbow_sku_async(sku, token, persist=False)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Failed to fetch SKU: {e}")
        if not result:
            raise HTTPException(status_code=404, detail=f"No data found for SKU: {sku}")
        return result

    # ── Normal mode: check cache first, then persist ───────────────────────────
    cached = db.get_sku_report(sku)
    if cached:
        if cached.get("sku_info", {}).get("size"):
            return cached

    try:
        await _fetch_rainbow_sku_async(sku, token, persist=True)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch SKU: {e}")

    fresh = db.get_sku_report(sku)
    if not fresh:
        raise HTTPException(status_code=404, detail=f"No data found for SKU: {sku}")
    return fresh


# ── China Post SKU search ─────────────────────────────────────────────────────

@router.get("/cp/sku/{sku}")
def get_cp_sku_report(sku: str):
    """
    Fetch SKU report from China Post PDA system.
    Reads PHPSESSID from .env (CP_PHPSESSID).
    Auto-refreshes PHPSESSID on 401 and retries, persisting to .env.
    """
    sessid = _get_cp_sessid()
    if not sessid:
        # No PHPSESSID at all — trigger a fresh Playwright login instead of
        # letting _auto_refresh_cp_session retry the same empty string.
        raise HTTPException(
            status_code=401,
            detail="CP_PHPSESSID is empty in .env. Attempting to auto-refresh...",
        )

    sessid_ref = {"phpsessid": sessid}

    try:
        result = _auto_refresh_cp_session(
            sessid_ref,
            _cp_fetch_and_cache,
            sku,         # positional: becomes *args
        )
    except HTTPException as e:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"CP lookup failed: {e}")

    return result


def _cp_fetch_and_cache(sku: str, phpsessid: str) -> dict:
    """Internal: call CP APIs and return the report dict."""
    detail = cp.get_sku_detail_cp(phpsessid, sku)
    inventory = cp.get_sku_inventory_cp(phpsessid, sku)
    history = cp.get_sku_history_cp(phpsessid, sku)

    if not detail and not inventory and not history:
        raise HTTPException(status_code=404, detail=f"No data found for SKU: {sku}")

    # Generate QR code for this SKU
    qr = db._generate_qr_base64(sku)

    return {
        "sku": sku,
        "detail": detail,
        "inventory": inventory,
        "history": history,
        "qr_code_base64": qr,
    }


# ── Resolution Logs ──────────────────────────────────────────────────────────

class ResolutionLogInput(BaseModel):
    orderNo: str
    sku: str
    # Step 1: Inventory check
    found_in_inventory: bool
    inventory_location: Optional[str] = None
    # Step 2: History search (only relevant if not found in inventory)
    found_in_history: bool = False
    found_location: Optional[str] = None
    location_type: Optional[str] = None
    # Metadata
    not_found: bool
    strategy_used: str = "alphabet"
    checker_name: Optional[str] = None


@router.post("/resolution-logs")
def create_resolution_log(data: ResolutionLogInput):
    """
    Record one resolution attempt for a SKU in an abnormal order.
    Ranks are calculated server-side from current DB state.
    """
    sku = data.sku

    # ── Fetch current location lists from DB ───────────────────────────────
    # History locations (sorted for rank calculation)
    history_rows = db.get_sku_history(sku)
    all_locations: list[str] = []
    loc_to_updated: dict[str, str] = {}

    for row in history_rows:
        loc = row.get("locationCode", "").strip()
        if loc and loc not in all_locations:
            all_locations.append(loc)
            loc_to_updated[loc] = row.get("updateTime") or ""

    history_total = len(all_locations)

    # ── Calculate ranks ──────────────────────────────────────────────────
    rank_alpha = None
    rank_updates = None
    steps_taken = None

    if data.found_location and data.found_location in all_locations:
        idx = all_locations.index(data.found_location)
        rank_alpha = idx

        # Time rank: sort by updateTime descending
        time_sorted = sorted(all_locations, key=lambda loc: loc_to_updated.get(loc, ""), reverse=True)
        rank_updates = time_sorted.index(data.found_location)
        steps_taken = rank_updates

    snapshot_at = datetime.now().isoformat()

    db.insert_resolution_log(
        order_no=data.orderNo,
        sku=data.sku,
        found_in_inventory=data.found_in_inventory,
        inventory_location=data.inventory_location,
        found_in_history=data.found_in_history,
        found_location=data.found_location,
        location_type=data.location_type,
        history_total_locs=history_total,
        rank_alphabetical=rank_alpha,
        rank_updates=rank_updates,
        steps_taken=steps_taken,
        not_found=data.not_found,
        strategy_used=data.strategy_used,
        checker_name=data.checker_name,
        snapshot_at=snapshot_at,
    )

    return {"status": "ok", "log_id": None}


@router.get("/resolution-logs")
def get_resolution_logs(orderNo: Optional[str] = None, sku: Optional[str] = None):
    """Fetch resolution logs, optionally filtered by orderNo or SKU."""
    logs = db.get_resolution_logs(order_no=orderNo, sku=sku)
    return logs
