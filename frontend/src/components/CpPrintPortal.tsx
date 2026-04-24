import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CpSkuReport } from '../api'

interface CpPrintPortalProps {
  report: CpSkuReport
  onClose: () => void
}

export default function CpPrintPortal({ report, onClose }: CpPrintPortalProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const totalStock = report?.inventory.reduce((s, i) => s + (i.quantity ?? 0), 0) ?? 0
  const productNameCn = report?.detail?.product_cn_name
  const productNameEn = report?.detail?.product_en_name
  const productWeight = report?.detail?.weight
  const productSize = report?.detail?.length
    ? `${report.detail.length} × ${report.detail.width} × ${report.detail.height}`
    : undefined

  useEffect(() => {
    if (!mounted) return
    const timer = setTimeout(() => window.print(), 50)
    return () => clearTimeout(timer)
  }, [mounted])

  if (!mounted) return null

  const content = (
    <div className="print-sheet">

      {/* ── Header: SKU Info + QR ───────────────────────────────── */}
      <div className="print-section">
        {/* Product Info */}
        <div className="print-product-info">
          {/* SKU — big, bold */}
          <div className="print-sku">{report.sku}</div>

          {productNameCn && <div className="print-name-cn">{productNameCn}</div>}
          {productNameEn && <div className="print-name-en">{productNameEn}</div>}

          <div className="print-meta-row">
            {productSize && <span className="print-meta-badge">{productSize} cm</span>}
            {productWeight && <span className="print-meta-badge">{productWeight} kg</span>}
          </div>
        </div>

        {/* QR Code */}
        {report.qr_code_base64 && (
          <div className="print-qr-block">
            <img src={`data:image/png;base64,${report.qr_code_base64}`} alt="QR" className="print-qr-img" />
            <span className="print-qr-label">SKU QR</span>
          </div>
        )}
      </div>

      {/* ── Inventory ──────────────────────────────────────────── */}
      <div className="print-section">
        <div className="print-section-title">Inventory (Total: {totalStock})</div>
        {report.inventory && report.inventory.length > 0 ? (
          <div className="print-inventory-grid">
            {[...report.inventory].sort((a, b) => (a.location || '').localeCompare(b.location || '')).map((inv, j) => (
              <div key={j} className="print-inv-cell">
                <span className="print-code">{inv.location}</span>
                <span className="print-qty-val">{inv.quantity ?? 0}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="print-no-data">No inventory data</div>
        )}
      </div>

      {/* ── Location History ────────────────────────────────────── */}
      {report.history && report.history.length > 0 && (
        <div className="print-section">
          <div className="print-section-title">Location History</div>
          <div className="print-table">
            <div className="print-table-header">
              <span className="print-col-location">Location</span>
              <span className="print-col-qty">Last Update</span>
            </div>
            {[...report.history].sort((a, b) => (a.location || '').localeCompare(b.location || '')).map((h, j) => (
              <div key={j} className="print-table-row">
                <span className="print-col-location print-code">{h.location}</span>
                <span className="print-col-qty print-date">{h.updated_time ? new Date(h.updated_time).toLocaleDateString() : '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  return createPortal(content, document.body)
}
