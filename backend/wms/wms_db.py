"""
WMS local SQLite database layer.
Keeps a separate DB (wms.db) from the main tally.db.
Schema aligned with local_wms.db:
  - abnormal_orders / abnormal_order_detail  — exception orders from Rainbow
  - sku_inventory / sku_details / sku_history — SKU data from Rainbow
  - sku_reports                             — cached full SKU reports for quick lookup
"""

import base64
import io
import json
from pathlib import Path
from typing import Optional

import sqlite3

# ── DB path ──────────────────────────────────────────────────────────────────

DB_PATH = Path(__file__).parent.parent / "wms.db"


def _conn():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


# ── Init ─────────────────────────────────────────────────────────────────────

def init_db():
    conn = _conn()
    cur = conn.cursor()

    # ── abnormal_orders ────────────────────────────────────────────────────────
    # Primary table: one row per exception order from Rainbow
    cur.execute("""
        CREATE TABLE IF NOT EXISTS abnormal_orders (
            shipNoteNo TEXT PRIMARY KEY,
            pickNo TEXT,
            skuQty INTEGER,
            exceptionTypeName TEXT,
            trackNo TEXT,
            create_at TIMESTAMP DEFAULT (datetime('now', 'localtime')),
            sync_at  TIMESTAMP DEFAULT (datetime('now', 'localtime')),
            resolved_at TIMESTAMP
        )
    """)

    # ── Schema migration: add create_at if missing (older wms.db) ──────────────
    cur.execute("PRAGMA table_info(abnormal_orders)")
    columns = {row[1] for row in cur.fetchall()}
    if "create_at" not in columns:
        cur.execute("ALTER TABLE abnormal_orders ADD COLUMN create_at TIMESTAMP")
    if "sync_at" not in columns:
        cur.execute("ALTER TABLE abnormal_orders ADD COLUMN sync_at TIMESTAMP")
    # Backfill sync_at for rows that have create_at but no sync_at
    cur.execute("UPDATE abnormal_orders SET sync_at = create_at WHERE sync_at IS NULL AND create_at IS NOT NULL")

    # ── abnormal_order_detail ─────────────────────────────────────────────────
    # SKU rows for each exception order
    cur.execute("""
        CREATE TABLE IF NOT EXISTS abnormal_order_detail (
            orderNo TEXT,
            sku TEXT,
            planQty INTEGER,
            pickQty INTEGER,
            locationCode TEXT,
            order_date DATE,
            sync_at TIMESTAMP DEFAULT (datetime('now', 'localtime')),
            PRIMARY KEY (orderNo, sku, locationCode)
        )
    """)

    # ── Schema migration: add order_date if missing (older wms.db) ──────────────
    cur.execute("PRAGMA table_info(abnormal_order_detail)")
    detail_cols = {row[1] for row in cur.fetchall()}
    if "order_date" not in detail_cols:
        cur.execute("ALTER TABLE abnormal_order_detail ADD COLUMN order_date DATE")

    # ── sku_inventory ──────────────────────────────────────────────────────────
    # Per-SKU, per-location inventory snapshot from Rainbow
    cur.execute("""
        CREATE TABLE IF NOT EXISTS sku_inventory (
            sku TEXT,
            locationCode TEXT,
            warehouseAreaCode TEXT,
            usableQty INTEGER DEFAULT 0,
            outQty INTEGER DEFAULT 0,
            pendingQty INTEGER DEFAULT 0,
            update_time TIMESTAMP DEFAULT (datetime('now', 'localtime')),
            sync_at TIMESTAMP DEFAULT (datetime('now', 'localtime')),
            PRIMARY KEY (sku, locationCode)
        )
    """)

    # ── sku_details ───────────────────────────────────────────────────────────
    # SKU master data (name, size, weight, image) from Rainbow
    cur.execute("""
        CREATE TABLE IF NOT EXISTS sku_details (
            sku TEXT PRIMARY KEY,
            productSku TEXT,
            productNameCn TEXT,
            productNameEn TEXT,
            size TEXT,
            realWeight REAL,
            productImageList TEXT,
            sync_at TIMESTAMP DEFAULT (datetime('now', 'localtime'))
        )
    """)

    # ── sku_history ───────────────────────────────────────────────────────────
    # Location movement history per SKU from Rainbow
    cur.execute("""
        CREATE TABLE IF NOT EXISTS sku_history (
            sku TEXT,
            locationCode TEXT,
            updateTime TIMESTAMP,
            sync_at TIMESTAMP DEFAULT (datetime('now', 'localtime')),
            PRIMARY KEY (sku, locationCode, updateTime)
        )
    """)

    # ── sku_reports ────────────────────────────────────────────────────────────
    # Cached full SKU reports (used by Search page as quick lookup)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS sku_reports (
            sku TEXT PRIMARY KEY,
            sku_info TEXT,
            inventory TEXT,
            history TEXT,
            qr_code_base64 TEXT,
            sync_at TIMESTAMP DEFAULT (datetime('now', 'localtime'))
        )
    """)

    # ── abnormal_resolution_logs ───────────────────────────────────────────────
    # Per-SKU resolution log for abnormal order analysis
    cur.execute("""
        CREATE TABLE IF NOT EXISTS abnormal_resolution_logs (
            log_id               INTEGER PRIMARY KEY AUTOINCREMENT,
            orderNo              TEXT NOT NULL,
            sku                  TEXT NOT NULL,
            -- Step 1: Inventory check
            found_in_inventory   INTEGER NOT NULL DEFAULT 0,
            inventory_location   TEXT,
            -- Step 2: History search
            found_in_history     INTEGER NOT NULL DEFAULT 0,
            found_location       TEXT,
            location_type        TEXT,
            -- Ranking (0-indexed, history search only)
            history_total_locs   INTEGER,
            rank_alphabetical    INTEGER,
            rank_updates         INTEGER,
            steps_taken          INTEGER,
            -- Metadata
            not_found            INTEGER NOT NULL DEFAULT 0,
            strategy_used        TEXT,
            checker_name         TEXT,
            snapshot_at          TIMESTAMP,
            created_at           TIMESTAMP DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (orderNo) REFERENCES abnormal_orders(shipNoteNo)
        )
    """)

    conn.commit()
    conn.close()
    print(f"[WMS DB] Initialized at {DB_PATH}")


# ── Abnormal orders ───────────────────────────────────────────────────────────

def save_abnormal_list(abnormal_list: list):
    """Insert or update a list of abnormal order summaries from Rainbow.

    resolved_at is NOT set here — it's determined by mark_resolved_orders():
    orders in the fetched list get resolved_at=NULL (pending),
    orders NOT in the fetched list are marked resolved (resolved_at=now).
    """
    if not abnormal_list:
        return
    conn = _conn()
    cur = conn.cursor()
    for item in abnormal_list:
        # Use create_at from API response if available, otherwise fall back to now
        create_at_val = item.get("create_at") or item.get("sync_at")
        if create_at_val and "T" in create_at_val:
            create_at_val = create_at_val.replace("T", " ").split(".")[0]
        elif not create_at_val:
            create_at_val = "datetime('now', 'localtime')"

        if create_at_val == "datetime('now', 'localtime')":
            cur.execute("""
                INSERT OR REPLACE INTO abnormal_orders
                    (shipNoteNo, pickNo, skuQty, exceptionTypeName, trackNo, create_at, sync_at)
                VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
            """, (
                item.get("shipNoteNo"),
                item.get("pickNo"),
                item.get("skuQty"),
                item.get("exceptionTypeName"),
                item.get("trackNo"),
            ))
        else:
            cur.execute("""
                INSERT OR REPLACE INTO abnormal_orders
                    (shipNoteNo, pickNo, skuQty, exceptionTypeName, trackNo, create_at, sync_at)
                VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
            """, (
                item.get("shipNoteNo"),
                item.get("pickNo"),
                item.get("skuQty"),
                item.get("exceptionTypeName"),
                item.get("trackNo"),
                create_at_val,
            ))
    conn.commit()
    conn.close()


def get_abnormal_orders(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    status: str = "all",
) -> list:
    """
    Returns abnormal orders with their SKU lists, filtered by date range.

    Args:
        start_date: ISO date string (inclusive), e.g. "2026-04-01"
        end_date:   ISO date string (inclusive), e.g. "2026-04-21"
        status:     "all", "pending", or "resolved"
    """
    conn = _conn()
    cur = conn.cursor()

    where_parts = []
    params: list = []

    if status == "pending":
        where_parts.append("ao.resolved_at IS NULL")
    elif status == "resolved":
        where_parts.append("ao.resolved_at IS NOT NULL")

    if start_date:
        where_parts.append("ao.sync_at >= ?")
        params.append(start_date + " 00:00:00")
    if end_date:
        where_parts.append("ao.sync_at <= ?")
        params.append(end_date + " 23:59:59")

    where_clause = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    cur.execute(f"""
        SELECT
            ao.*,
            GROUP_CONCAT(DISTINCT aod.sku) AS skus
        FROM abnormal_orders ao
        LEFT JOIN abnormal_order_detail aod ON ao.shipNoteNo = aod.orderNo
        {where_clause}
        GROUP BY ao.shipNoteNo
        ORDER BY ao.create_at DESC
    """, params)

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    for r in rows:
        r["skus"] = r["skus"].split(",") if r["skus"] else []
    return rows


def save_abnormal_order_detail(order_no: str, items: list, order_date: Optional[str] = None):
    """Save SKU/pick detail rows for an exception order."""
    if not items:
        return
    conn = _conn()
    cur = conn.cursor()
    for item in items:
        cur.execute("""
            INSERT OR REPLACE INTO abnormal_order_detail
                (orderNo, sku, planQty, pickQty, locationCode, order_date, sync_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
        """, (
            order_no,
            item.get("sku"),
            item.get("planQty"),
            item.get("pickQty"),
            item.get("locationCode"),
            order_date,
        ))
    conn.commit()
    conn.close()


def mark_resolved_orders(active_ship_note_nos: list):
    """Mark orders NOT in the active list as resolved (auto-resolve stale orders)."""
    conn = _conn()
    cur = conn.cursor()
    if active_ship_note_nos:
        placeholders = ",".join("?" for _ in active_ship_note_nos)
        cur.execute(f"""
            UPDATE abnormal_orders
            SET resolved_at = datetime('now', 'localtime')
            WHERE resolved_at IS NULL
              AND shipNoteNo NOT IN ({placeholders})
        """, active_ship_note_nos)
    else:
        cur.execute("""
            UPDATE abnormal_orders
            SET resolved_at = datetime('now', 'localtime')
            WHERE resolved_at IS NULL
        """)
    conn.commit()
    conn.close()


# ── SKU data (aligned with local_wms.db) ─────────────────────────────────────

def save_sku_inventory(sku: str, locations: list):
    """Upsert per-location inventory rows for a SKU."""
    if not locations:
        return
    conn = _conn()
    cur = conn.cursor()
    for loc in locations:
        cur.execute("""
            INSERT OR REPLACE INTO sku_inventory
                (sku, locationCode, warehouseAreaCode, usableQty, outQty, pendingQty, update_time, sync_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
        """, (
            sku,
            loc.get("locationCode"),
            loc.get("warehouseAreaCode"),
            loc.get("usableQty", 0),
            loc.get("outQty", 0),
            loc.get("pendingQty", 0),
        ))
    conn.commit()
    conn.close()


def save_sku_details(sku: str, info: dict):
    """Upsert SKU master data (name, size, weight, images)."""
    import json as _json

    def _img_list(val):
        if isinstance(val, list):
            return _json.dumps(val)
        if isinstance(val, str):
            try:
                _json.loads(val)
                return val
            except Exception:
                return _json.dumps([val])
        return "[]"

    conn = _conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT OR REPLACE INTO sku_details
            (sku, productSku, productNameCn, productNameEn, size, realWeight, productImageList, sync_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    """, (
        sku,
        info.get("productSku"),
        info.get("productNameCn"),
        info.get("productNameEn"),
        info.get("size"),
        info.get("realWeight"),
        _img_list(info.get("productImageList", [])),
    ))
    conn.commit()
    conn.close()


def save_sku_history(sku: str, history: list):
    """Upsert location history rows for a SKU."""
    if not history:
        return
    conn = _conn()
    cur = conn.cursor()
    for h in history:
        cur.execute("""
            INSERT OR REPLACE INTO sku_history
                (sku, locationCode, updateTime, sync_at)
            VALUES (?, ?, ?, datetime('now', 'localtime'))
        """, (
            sku,
            h.get("locationCode"),
            h.get("updateTime"),
        ))
    conn.commit()
    conn.close()


def get_sku_inventory(sku: str) -> list:
    """Get all inventory locations for a SKU."""
    conn = _conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT * FROM sku_inventory WHERE sku = ? ORDER BY locationCode",
        (sku,),
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def get_sku_details(sku: str) -> Optional[dict]:
    """Get SKU master data."""
    import json as _json

    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM sku_details WHERE sku = ?", (sku,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    # Parse productImageList back to list
    try:
        d["productImageList"] = _json.loads(d.get("productImageList") or "[]")
    except Exception:
        d["productImageList"] = []
    return d


def get_sku_history(sku: str) -> list:
    """Get location history for a SKU."""
    conn = _conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT * FROM sku_history WHERE sku = ? ORDER BY updateTime DESC",
        (sku,),
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


# ── SKU reports (cached full report) ─────────────────────────────────────────

def save_sku_report(sku: str, sku_info: dict, inventory: list, history: list):
    """Cache a complete SKU report for fast Search-page lookups."""
    qr = _generate_qr_base64(sku)
    conn = _conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT OR REPLACE INTO sku_reports
            (sku, sku_info, inventory, history, qr_code_base64, sync_at)
        VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
    """, (
        sku,
        json.dumps(sku_info),
        json.dumps(inventory),
        json.dumps(history),
        qr,
    ))
    conn.commit()
    conn.close()


def get_sku_report(sku: str) -> Optional[dict]:
    """Get cached full SKU report (used by Search page)."""
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM sku_reports WHERE sku = ?", (sku,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    return {
        "sku": row["sku"],
        "sku_info": json.loads(row["sku_info"]) if row["sku_info"] else {},
        "inventory": json.loads(row["inventory"]) if row["inventory"] else [],
        "history": json.loads(row["history"]) if row["history"] else [],
        "qr_code_base64": row["qr_code_base64"],
        "sync_at": row["sync_at"],
    }


# ── QR code ───────────────────────────────────────────────────────────────────

def _generate_qr_base64(text: str, box_size: int = 3) -> str:
    """
    Generate a QR code as base64 PNG.
    box_size=3 gives ~41×41 modules — small enough that upscaling to 120px
    on A5 print looks smooth and sharp on any printer resolution.
    """
    try:
        import qrcode
        qr = qrcode.QRCode(version=1, box_size=box_size, border=2)
        qr.add_data(text)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()
    except ImportError:
        return base64.b64encode(text.encode()).decode()


# ── Resolution logs ──────────────────────────────────────────────────────────

def insert_resolution_log(
    order_no: str,
    sku: str,
    found_in_inventory: bool,
    inventory_location: Optional[str],
    found_in_history: bool,
    found_location: Optional[str],
    location_type: Optional[str],
    history_total_locs: Optional[int],
    rank_alphabetical: Optional[int],
    rank_updates: Optional[int],
    steps_taken: Optional[int],
    not_found: bool,
    strategy_used: str,
    checker_name: Optional[str],
    snapshot_at: Optional[str],
):
    """
    Insert one resolution log entry.
    All booleans are stored as 0/1 integers in SQLite.
    """
    conn = _conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO abnormal_resolution_logs
            (orderNo, sku, found_in_inventory, inventory_location,
             found_in_history, found_location, location_type,
             history_total_locs, rank_alphabetical, rank_updates, steps_taken,
             not_found, strategy_used, checker_name, snapshot_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        order_no,
        sku,
        int(found_in_inventory),
        inventory_location,
        int(found_in_history),
        found_location,
        location_type,
        history_total_locs,
        rank_alphabetical,
        rank_updates,
        steps_taken,
        int(not_found),
        strategy_used,
        checker_name,
        snapshot_at,
    ))
    conn.commit()
    conn.close()


def get_resolution_logs(order_no: Optional[str] = None, sku: Optional[str] = None) -> list:
    """
    Fetch resolution logs, optionally filtered by orderNo and/or SKU.
    Returns rows sorted by created_at descending.
    """
    conn = _conn()
    cur = conn.cursor()

    where_parts = []
    params = []
    if order_no:
        where_parts.append("orderNo = ?")
        params.append(order_no)
    if sku:
        where_parts.append("sku = ?")
        params.append(sku)

    where_clause = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    cur.execute(f"""
        SELECT * FROM abnormal_resolution_logs
        {where_clause}
        ORDER BY created_at DESC
    """, params)

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    # Convert integer flags back to bool
    for r in rows:
        r["found_in_inventory"] = bool(r["found_in_inventory"])
        r["found_in_history"]   = bool(r["found_in_history"])
        r["not_found"]          = bool(r["not_found"])

    return rows


# ── Init on import ────────────────────────────────────────────────────────────

init_db()
