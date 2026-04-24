"""
Rainbow WMS API integration — Mock Mode (Demo).

This module is running in MOCK MODE.
All functions return realistic demo data — no real API calls are made.

To switch back to live mode:
  1. Set MOCK_MODE = False
  2. Restore the original .env with real RAINBOW_TOKEN
  3. Restore the original API logic (see .backup_original/)
"""

import uuid
import random
from datetime import datetime, timedelta

# ── Mock flag ─────────────────────────────────────────────────────────────────
MOCK_MODE = True

# ── Demo data ─────────────────────────────────────────────────────────────────

_MOCK_ABNORMAL_RECORDS = [
    {
        "shipNoteNo": "MOCK-ORDER-260423-0001",
        "pickNo":     "PICK-260423-0001",
        "skuQty":     3,
        "exceptionTypeName": "尺寸原因，实物无法打包",
        "trackNo":    "",
        "create_at":  "2026-04-23T10:30:00",
        "sync_at":    "2026-04-23T10:35:00",
    },
    {
        "shipNoteNo": "MOCK-ORDER-260423-0002",
        "pickNo":     "PICK-260423-0002",
        "skuQty":     1,
        "exceptionTypeName": "客户取消订单",
        "trackNo":    "TRACK983472105",
        "create_at":  "2026-04-23T09:15:00",
        "sync_at":    "2026-04-23T09:20:00",
    },
    {
        "shipNoteNo": "MOCK-ORDER-260422-0003",
        "pickNo":     "PICK-260422-0003",
        "skuQty":     5,
        "exceptionTypeName": "实物库存不足",
        "trackNo":    "TRACK728195403",
        "create_at":  "2026-04-22T16:00:00",
        "sync_at":    "2026-04-22T16:05:00",
    },
    {
        "shipNoteNo": "MOCK-ORDER-260422-0004",
        "pickNo":     "PICK-260422-0004",
        "skuQty":     2,
        "exceptionTypeName": "SKU匹配错误",
        "trackNo":    "",
        "create_at":  "2026-04-22T14:30:00",
        "sync_at":    "2026-04-22T14:35:00",
    },
    {
        "shipNoteNo": "MOCK-ORDER-260422-0005",
        "pickNo":     "PICK-260422-0005",
        "skuQty":     8,
        "exceptionTypeName": "包装破损",
        "trackNo":    "TRACK581920374",
        "create_at":  "2026-04-22T11:00:00",
        "sync_at":    "2026-04-22T11:05:00",
    },
]

_MOCK_SKU_DETAIL = {
    "sku":            "WDGT-SKU-001",
    "productSku":     "AUTO-PUMP-001",
    "productNameCn":  "汽车机油泵",
    "productNameEn":  "Engine Oil Pump",
    "size":           "20.50x20.50x6.00",
    "realWeight":     0.893,
    "productImageList": [],
}

_MOCK_LOCATIONS = ["A-001", "A-002", "B-003", "B-004", "C-005", "C-006", "D-007", "D-008"]


def _mock_uuid() -> str:
    return str(uuid.uuid4())


# ── Mock token (not used but kept for API shape compatibility) ─────────────────

def refresh_rainbow_token_sync() -> str:
    return "MOCK_RAINBOW_TOKEN_DO_NOT_USE_IN_PROD"


# ── Abnormal orders list ──────────────────────────────────────────────────────

async def get_abnormal_list_api(
    token: str,
    exception_status: int = 1,
    page_size: int = 40,
) -> list:
    if not MOCK_MODE:
        raise RuntimeError("Live mode not implemented in this demo version.")
    records = _MOCK_ABNORMAL_RECORDS
    if exception_status == 1:
        records = [r for r in records if "2026-04-23" in r["create_at"]]
    return records


# ── Abnormal order detail ─────────────────────────────────────────────────────

async def get_abnormal_handle_api(order_no: str, token: str) -> list:
    return [
        {"sku": "WDGT-SKU-001", "planQty": 2, "pickQty": 2, "locationCode": "A-001"},
        {"sku": "WDGT-SKU-002", "planQty": 1, "pickQty": 0, "locationCode": "B-003"},
    ]


# ── SKU detail ────────────────────────────────────────────────────────────────

async def get_sku_detail_api(sku: str, token: str) -> dict:
    detail = dict(_MOCK_SKU_DETAIL)
    detail["sku"] = sku
    return detail


# ── SKU inventory balance ──────────────────────────────────────────────────────

async def get_sku_inventory_balance_api(sku_code: str, token: str, page_size: int = 100) -> list:
    random.seed(hash(sku_code) % 2**31)
    return [
        {
            "sku":           sku_code,
            "locationCode": loc,
            "usableQty":     random.randint(0, 30),
            "outQty":        random.randint(0, 5),
            "pendingQty":    random.randint(0, 3),
        }
        for loc in random.sample(_MOCK_LOCATIONS, min(3, len(_MOCK_LOCATIONS)))
    ]


# ── SKU location history ──────────────────────────────────────────────────────

async def get_sku_history_api(sku: str, token: str, page_size: int = 100) -> list:
    now = datetime.now()
    records = []
    for i in range(min(page_size, 5)):
        days_ago = i + 1
        records.append({
            "sku":          sku,
            "locationCode": random.choice(_MOCK_LOCATIONS),
            "updateTime":   (now - timedelta(days=days_ago)).strftime("%Y-%m-%d %H:%M:%S"),
        })
    return records
