"""
China Post PDA API integration — Mock Mode (Demo).

This module is running in MOCK MODE.
All functions return realistic demo data — no real API calls are made.

To switch back to live mode:
  1. Set MOCK_MODE = False
  2. Restore the original .env with real CP_PHPSESSID
  3. Restore the original API logic (see .backup_original/)
"""

import random
from datetime import datetime, timedelta

# ── Mock flag ─────────────────────────────────────────────────────────────────
MOCK_MODE = True

_MOCK_LOCATIONS = ["A-001", "A-002", "B-003", "B-004", "C-005", "C-006", "D-007", "D-008"]


class CpAuthExpired(Exception):
    """Placeholder — not raised in mock mode."""
    pass


def refresh_cp_phpsessid_sync() -> str:
    return "MOCK_CP_PHPSESSID_DO_NOT_USE_IN_PROD"


# ── SKU inventory ─────────────────────────────────────────────────────────────

def get_sku_inventory_cp(phpsessid: str, sku: str) -> list:
    random.seed(hash(sku) % 2**31)
    return [
        {
            "sku":      sku,
            "location": loc,
            "quantity": random.randint(5, 50),
        }
        for loc in random.sample(_MOCK_LOCATIONS, 2)
    ]


# ── SKU history ──────────────────────────────────────────────────────────────

def get_sku_history_cp(phpsessid: str, sku: str) -> list:
    now = datetime.now()
    records = []
    for i in range(3):
        days_ago = i + 1
        records.append({
            "sku":          sku,
            "location":     random.choice(_MOCK_LOCATIONS),
            "updated_time": (now - timedelta(days=days_ago, hours=random.randint(0, 12))
                             ).strftime("%Y-%m-%d %H:%M:%S"),
        })
    return records


# ── SKU detail ───────────────────────────────────────────────────────────────

def get_sku_detail_cp(phpsessid: str, sku: str, page: int = 1, page_size: int = 20) -> dict:
    demo_skus = {
        "WDGT-SKU-001": {"length": 20.50, "width": 20.50, "height": 6.00,
                         "weight": 0.893, "product_cn_name": "汽车机油泵",  "product_en_name": "Engine Oil Pump"},
        "WDGT-SKU-002": {"length": 63.00, "width": 36.00, "height": 31.00,
                         "weight": 19.75, "product_cn_name": "气缸盖垫片套装", "product_en_name": "Cylinder Head Gasket Set"},
        "WDGT-SKU-003": {"length": 23.00, "width": 15.00, "height": 13.00,
                         "weight": 1.195, "product_cn_name": "水泵+节温器套装", "product_en_name": "Water Pump with Thermostat"},
    }
    data = demo_skus.get(sku, {"length": 10.0, "width": 10.0, "height": 5.0,
                                "weight": 1.0, "product_cn_name": "未知商品", "product_en_name": "Unknown Product"})
    return {"sku": sku, **data}
