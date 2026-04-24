"""
Seed wms.db with realistic mock data (no real business data).
Run: python seed_mock_data.py
"""
import sqlite3, json
from datetime import datetime, timedelta
import base64

DB = __file__.rsplit("/", 1)[0] + "/backend/wms.db"
if "\\\" in DB:
    DB = __file__.rsplit("\\", 1)[0] + "\\wms.db"
conn = sqlite3.connect(DB)
cur = conn.cursor()

NOW = datetime.now()
TODAY = NOW.strftime("%Y-%m-%d")
NOW_STR = NOW.strftime("%Y-%m-%d %H:%M:%S")

# ── 1. Clear all data ─────────────────────────────────────────────────────────
tables = ["abnormal_resolution_logs", "abnormal_order_detail",
          "abnormal_orders", "sku_reports", "sku_inventory",
          "sku_details", "sku_history"]
for t in tables:
    cur.execute(f"DELETE FROM {t}")

# ── 2. Define mock SKUs ──────────────────────────────────────────────────────
mock_skus = [
    {"sku": "WDGT-SKU-001", "productSku": "AUTO-PUMP-001",
     "productNameCn": "汽车机油泵",         "productNameEn": "Engine Oil Pump",
     "size": "20.50x20.50x6.00",            "realWeight": 0.893},
    {"sku": "WDGT-SKU-002", "productSku": "AUTO-GASKET-026",
     "productNameCn": "气缸盖垫片套装",      "productNameEn": "Cylinder Head Gasket Set",
     "size": "63.00x36.00x31.00",          "realWeight": 19.75},
    {"sku": "WDGT-SKU-003", "productSku": "AUTO-WATERPUMP-167",
     "productNameCn": "水泵+节温器套装 22RE","productNameEn": "Water Pump with Thermostat",
     "size": "23.00x15.00x13.00",          "realWeight": 1.195},
    {"sku": "WDGT-SKU-004", "productSku": "AUTO-BRAKEPAD-044",
     "productNameCn": "前刹车片套装",        "productNameEn": "Front Brake Pad Set",
     "size": "15.20x12.80x5.50",          "realWeight": 0.680},
    {"sku": "WDGT-SKU-005", "productSku": "AUTO-ALT-089",
     "productNameCn": "发电机总成",          "productNameEn": "Alternator Assembly",
     "size": "18.00x14.00x16.00",          "realWeight": 5.200},
]

locations = ["A-001", "A-002", "B-003", "B-004", "C-005", "C-006", "D-007", "D-008"]
exception_types = ["尺寸原因，实物无法打包", "客户取消订单", "实物库存不足",
                    "SKU匹配错误", "包装破损", "重量超标"]

# ── 3. Insert sku_details ────────────────────────────────────────────────────
for s in mock_skus:
    cur.execute("""
        INSERT INTO sku_details (sku, productSku, productNameCn, productNameEn,
                                 size, realWeight, productImageList, sync_at)
        VALUES (?, ?, ?, ?, ?, ?, '[]', ?)""",
        (s["sku"], s["productSku"], s["productNameCn"], s["productNameEn"],
         s["size"], s["realWeight"], NOW_STR))

# ── 4. Insert sku_reports ────────────────────────────────────────────────────
qr_placeholder = base64.b64encode(b"MOCK_QR_CODE").decode()
for s in mock_skus:
    sku_info = json.dumps({"sku": s["sku"], "productSku": s["productSku"],
                            "productNameCn": s["productNameCn"],
                            "productNameEn": s["productNameEn"],
                            "size": s["size"],
                            "realWeight": str(s["realWeight"]),
                            "productImageList": None})
    cur.execute("""INSERT INTO sku_reports
                   (sku, sku_info, inventory, history, qr_code_base64, sync_at)
                   VALUES (?, ?, '[]', '[]', ?, ?)""",
                (s["sku"], sku_info, qr_placeholder, NOW_STR))

# ── 5. Insert sku_inventory ─────────────────────────────────────────────────
import random
random.seed(42)
inventory_records = []
for s in mock_skus:
    for loc in random.sample(locations, random.randint(1, 3)):
        inventory_records.append((s["sku"], loc, None,
                                   random.randint(0, 50), random.randint(0, 10),
                                   random.randint(0, 5),
                                   (NOW - timedelta(days=random.randint(0, 5))
                                   ).strftime("%Y-%m-%d %H:%M:%S"), NOW_STR))
for r in inventory_records:
    cur.execute("""INSERT INTO sku_inventory
                   (sku, locationCode, warehouseAreaCode,
                    usableQty, outQty, pendingQty, update_time, sync_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""", r)

# ── 6. Insert sku_history ───────────────────────────────────────────────────
history_records = []
for s in mock_skus:
    for _ in range(random.randint(2, 5)):
        history_records.append((s["sku"], random.choice(locations),
                                (NOW - timedelta(days=random.randint(1, 30),
                                                  hours=random.randint(0, 23))
                                 ).strftime("%Y-%m-%d %H:%M:%S"), NOW_STR))
for r in history_records:
    cur.execute("""INSERT INTO sku_history
                   (sku, locationCode, updateTime, sync_at)
                   VALUES (?, ?, ?, ?)""", r)

# ── 7. Insert abnormal_orders ────────────────────────────────────────────────
abnormal_orders = []
for i in range(10):
    order_no = f"MOCK-ORDER-{TODAY.replace('-','')}-{i+1:04d}"
    pick_no  = f"PICK-{TODAY.replace('-','')}-{i+1:04d}"
    exc_type = exception_types[i % len(exception_types)]
    track_no = f"TRACK{random.randint(100000000, 999999999)}" if random.random() > 0.3 else ""
    sync_t   = (NOW - timedelta(hours=random.randint(0, 12))).strftime("%Y-%m-%d %H:%M:%S")
    resolved = random.random() > 0.6
    resolved_t = (NOW - timedelta(hours=random.randint(0, 6))).strftime("%Y-%m-%d %H:%M:%S") if resolved else None
    create_t = (NOW - timedelta(hours=random.randint(0, 24))).strftime("%Y-%m-%d %H:%M:%S")
    abnormal_orders.append((order_no, pick_no, random.randint(1, 8),
                              exc_type, track_no, sync_t, resolved_t, create_t))
for r in abnormal_orders:
    cur.execute("""INSERT INTO abnormal_orders
                   (shipNoteNo, pickNo, skuQty, exceptionTypeName,
                    trackNo, sync_at, resolved_at, create_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""", r)

# ── 8. Insert abnormal_order_detail (first 5 orders) ─────────────────────────
for order in abnormal_orders[:5]:
    for s in random.sample(mock_skus, min(3, len(mock_skus))):
        plan_qty = random.randint(1, 5)
        cur.execute("""INSERT INTO abnormal_order_detail
                       (orderNo, sku, planQty, pickQty, locationCode, sync_at, order_date)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (order[0], s["sku"], plan_qty,
                     random.randint(0, plan_qty),
                     random.choice(locations),
                     (NOW - timedelta(hours=random.randint(0, 12))
                     ).strftime("%Y-%m-%d %H:%M:%S"), TODAY))

conn.commit()
conn.close()
print("Mock data seeded! Tables: abnormal_orders, sku_details, sku_inventory, "
      "sku_history, sku_reports, abnormal_order_detail")
