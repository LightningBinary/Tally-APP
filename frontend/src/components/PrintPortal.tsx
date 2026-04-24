import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RainbowSkuReport, AbnormalOrder } from '../api'

interface PrintPortalProps {
  sku: string
  planQty: number
  pickQty: number
  locationCode: string
  order: AbnormalOrder
  report: RainbowSkuReport
  onClose: () => void
}

export default function PrintPortal({ sku, planQty, pickQty, locationCode, order, report, onClose }: PrintPortalProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const totalStock = report?.inventory.reduce((sum, i) => sum + (i.usableQty ?? 0), 0) ?? 0
  const productNameCn = report?.sku_info?.productNameCn
  const productNameEn = report?.sku_info?.productNameEn
  const productSize = report?.sku_info?.size
  const productWeight = report?.sku_info?.realWeight
  const primaryImage = report?.sku_info?.primaryImage || report?.sku_info?.productImageList?.[0]
  const productSku = report?.sku_info?.productSku
  const diff = Math.max(0, planQty - pickQty)

  useEffect(() => {
    if (!mounted) return
    const timer = setTimeout(() => window.print(), 50)
    return () => clearTimeout(timer)
  }, [mounted])

  if (!mounted) return null

  const content = (
    <div className="print-sheet">

      {/* ── Header: Image + Info + QR ────────────────────────────── */}
      <div className="print-section">
        {/* Product Image */}
        <div className="print-product-img">
          {primaryImage ? (
            <img src={primaryImage} alt={sku} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <span style={{ color: '#aaa', fontSize: '12px' }}>No Image</span>
          )}
        </div>

        {/* Product Info */}
        <div className="print-product-info">
          {/* SKU — big, bold, white bg, solid black border */}
          <div className="print-sku">{sku}</div>
          {productSku && <div className="print-product-sku">{productSku}</div>}

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

      {/* ── Pick Compare Table ──────────────────────────────────── */}
      <div className="print-section">
        <div className="print-section-title">Pick Compare</div>
        <div className="print-table">
          {/* Header */}
          <div className="print-table-header">
            <span className="print-col-location">Location</span>
            <span className="print-col-qty">Plan</span>
            <span className="print-col-qty">Pick</span>
            <span className="print-col-diff">Diff</span>
          </div>
          {/* Data row */}
          <div className="print-table-row">
            <span className="print-col-location print-code">{locationCode || '—'}</span>
            <span className="print-col-qty print-qty-val">{planQty}</span>
            <span className="print-col-qty print-qty-val">{pickQty}</span>
            <span className={`print-col-diff print-qty-val ${diff > 0 ? 'print-diff-neg' : diff < 0 ? 'print-diff-pos' : 'print-diff-zero'}`}>
              {diff > 0 ? `-${diff}` : diff < 0 ? `+${Math.abs(diff)}` : '0'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Inventory ──────────────────────────────────────────── */}
      {report.inventory && report.inventory.length > 0 && (
        <div className="print-section">
          <div className="print-section-title">Inventory (Total: {totalStock})</div>
          <div className="print-inventory-grid">
            {report.inventory.map((inv, j) => (
              <div key={j} className="print-inv-cell">
                <span className="print-code">{inv.locationCode}</span>
                <span className="print-qty-val">{inv.usableQty ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Location History ────────────────────────────────────── */}
      {report.history && report.history.length > 0 && (
        <div className="print-section">
          <div className="print-section-title">Location History</div>
          <div className="print-table">
            <div className="print-table-header">
              <span className="print-col-location">Location</span>
              <span className="print-col-qty">Last Update</span>
            </div>
            {[...report.history].sort((a, b) => (a.locationCode || '').localeCompare(b.locationCode || '')).map((h, j) => (
              <div key={j} className="print-table-row">
                <span className="print-col-location print-code">{h.locationCode}</span>
                <span className="print-col-qty print-date">{h.updateTime ? new Date(h.updateTime).toLocaleDateString() : '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  return createPortal(content, document.body)
}
