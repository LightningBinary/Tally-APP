import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  RefreshCw, Package, X, ExternalLink, QrCode,
  MapPin, Boxes, AlertTriangle, ShieldCheck,
  Printer, Image as ImageIcon, Clock, ClipboardList, KeyRound,
} from 'lucide-react'
import { API_BASE } from '../api'
import {
  getAbnormalOrders,
  refreshAbnormalOrders,
  getAbnormalOrderDetail,
  getRainbowSkuReport,
  type AbnormalOrder,
  type AbnormalDetail,
  type RainbowSkuReport,
} from '../api'
import PrintPortal from '../components/PrintPortal'
import ResolutionModal from '../components/ResolutionModal'

// ── Exception type colors ─────────────────────────────────────────────────────

function excColor(type: string | undefined) {
  if (!type) return 'text-gray-400'
  const t = type.toLowerCase()
  if (t.includes('short') || t.includes('qty')) return 'text-red-400'
  if (t.includes('damage') || t.includes('broken')) return 'text-orange-400'
  if (t.includes('miss') || t.includes('item')) return 'text-yellow-400'
  return 'text-purple-400'
}

function excBg(type: string | undefined) {
  if (!type) return 'bg-dark-600'
  const t = type.toLowerCase()
  if (t.includes('short') || t.includes('qty')) return 'bg-red-500/10'
  if (t.includes('damage') || t.includes('broken')) return 'bg-orange-500/10'
  if (t.includes('miss') || t.includes('item')) return 'bg-yellow-500/10'
  return 'bg-purple-500/10'
}



// ── Date helpers ────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

// ── Order Detail Sheet ─────────────────────────────────────────────────────────

// Inline SKU card matching old app layout
interface InlineSkuCardProps {
  sku: string
  planQty: number
  pickQty: number
  locationCode: string
  order: AbnormalOrder
  onClose: () => void
}

function InlineSkuCard({ sku, planQty, pickQty, locationCode, order, onClose }: InlineSkuCardProps) {
  const { t } = useTranslation()
  const [report, setReport] = useState<RainbowSkuReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [printMode, setPrintMode] = useState(false)

  useEffect(() => {
    setLoading(true)
    getRainbowSkuReport(sku)
      .then(r => { setReport(r); setError('') })
      .catch(() => setError(t('failedToLoad')))
      .finally(() => setLoading(false))
  }, [sku])

  const totalStock = report?.inventory.reduce((sum, i) => sum + (i.usableQty ?? 0), 0) ?? 0
  const productNameCn = report?.sku_info?.productNameCn
  const productNameEn = report?.sku_info?.productNameEn
  const productSize = report?.sku_info?.size
  const productWeight = report?.sku_info?.realWeight
  const primaryImage = report?.sku_info?.primaryImage || report?.sku_info?.productImageList?.[0]
  const diff = Math.max(0, planQty - pickQty)

  const handlePrint = () => {
    setPrintMode(true)
    // PrintPortal component handles window.print() internally via setTimeout(50)
    // No need to call window.print() here — it would fire twice
  }

  return (
    <div className="bg-dark-700 rounded-xl overflow-hidden space-y-3">
      {/* 1. SKU Info: image + name + size/weight */}
      <div className="flex items-start gap-3 px-4 pt-4">
        {primaryImage ? (
          <img
            src={primaryImage}
            alt={sku}
            className="w-16 h-16 object-contain rounded-lg bg-white/5 shrink-0 border border-dark-500"
          />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-dark-600 flex items-center justify-center shrink-0 border border-dark-500">
            <ImageIcon size={24} className="text-gray-600" />
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-1">
          {/* SKU label + Print button */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono font-semibold text-indigo-300 bg-indigo-500/10 px-2.5 py-1 rounded border border-indigo-500/20">{sku}</span>
            {report?.sku_info?.productSku && (
              <span className="text-xs font-mono text-gray-500 bg-dark-600 px-2 py-0.5 rounded">{t('prodSku')}: {report.sku_info.productSku}</span>
            )}
            <button
              onClick={handlePrint}
              disabled={loading}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-dark-600 transition-colors disabled:opacity-30"
              title={t('printSkuCard')}
            >
              <Printer size={14} />
            </button>
          </div>

          {/* CN name */}
          {productNameCn && (
            <div className="text-sm text-white font-medium">{productNameCn}</div>
          )}
          {/* EN name */}
          {productNameEn && (
            <div className="text-xs text-gray-400">{productNameEn}</div>
          )}

          {/* Size + Weight tags */}
          {(productSize || productWeight) && (
            <div className="flex gap-2 mt-1">
              {productSize && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-dark-600 text-gray-300 border border-dark-500">
                  {productSize} cm
                </span>
              )}
              {productWeight && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-dark-600 text-gray-300 border border-dark-500">
                  {productWeight} kg
                </span>
              )}
            </div>
          )}
          {!productSize && !productWeight && (
            <div className="text-xs text-gray-600 mt-1">{t('noSizeWeightInfo')}</div>
          )}
        </div>
      </div>

      {/* 2. QR Code (if available) */}
      {report?.qr_code_base64 && (
        <div className="flex justify-center">
          <div className="flex flex-col items-center gap-1 p-3 bg-white/5 rounded-lg">
            <img
              src={`data:image/png;base64,${report.qr_code_base64}`}
              alt="QR"
              className="w-20 h-20"
            />
            <span className="text-xs text-gray-500">{t('skuQrCode')}</span>
          </div>
        </div>
      )}

      {/* 3. Stock Distribution */}
      <div className="px-4">
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
          <Boxes size={11} />
          {t('inventory')} (Total: {totalStock})
        </div>
        {loading && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500 py-2">
            <RefreshCw size={11} className="animate-spin" /> {t('loading')}
          </div>
        )}
        {error && (
          <div className="text-xs text-gray-500 py-2">{t('noDataFound')}</div>
        )}
        {!loading && !error && (
          report?.inventory && report.inventory.length > 0 ? (
            <div className="space-y-1">
              {report.inventory.map((item, i) => (
                <div key={i} className="flex items-center justify-between bg-dark-600/60 rounded-lg px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <MapPin size={11} className="text-indigo-400" />
                    <span className="text-xs font-mono text-gray-200">{item.locationCode}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-emerald-400">{item.usableQty ?? 0} {t('available')}</span>
                    <span className="text-red-400/70">{item.pendingQty ?? 0} {t('pending')}</span>
                    <span className="text-gray-500">{item.outQty ?? 0} {t('out')}</span>
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-center bg-dark-600/60 rounded-lg px-3 py-1.5 mt-1">
                <span className="text-xs text-gray-400">{t('total')}</span>
                <span className="text-sm font-semibold text-emerald-400">{totalStock}</span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-500 py-1">{t('noDataFound')}</div>
          )
        )}
      </div>

      {/* 4. Pick Compare */}
      <div className="px-4">
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
          <MapPin size={11} /> {t('pickCompare')}
        </div>
        <div className="bg-dark-600/60 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="flex items-center px-3 py-2 border-b border-dark-500/50">
            <span className="flex-1 text-xs text-gray-500 font-medium">{t('location')}</span>
            <span className="w-16 text-center text-xs text-gray-500 font-medium">{t('reviewQty')}</span>
            <span className="w-16 text-center text-xs text-gray-500 font-medium">{t('picked')}</span>
            <span className="w-12 text-center text-xs text-gray-500 font-medium">{t('diff')}</span>
          </div>
          {/* Data row */}
          <div className="flex items-center px-3 py-2">
            <span className="flex-1 text-sm font-mono text-gray-200">{locationCode || '-'}</span>
            <span className="w-16 text-center text-sm font-semibold text-white">{planQty}</span>
            <span className="w-16 text-center text-sm font-semibold text-white">{pickQty}</span>
            <span className={`w-12 text-center text-sm font-bold ${diff > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {diff > 0 ? `-${diff}` : diff < 0 ? `+${Math.abs(diff)}` : '0'}
            </span>
          </div>
        </div>
      </div>

      {/* 5. History Locations */}
      <div className="px-4 pb-4">
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
          <Clock size={11} /> {t('locationHistory')}
        </div>
        {report?.history && report.history.length > 0 ? (
          <div className="space-y-1">
            {[...report.history].sort((a, b) => (a.locationCode || '').localeCompare(b.locationCode || '')).map((h, i) => (
              <div key={i} className="flex items-center justify-between bg-dark-600/40 rounded-lg px-3 py-1.5">
                <span className="text-xs font-mono text-gray-300">{h.locationCode}</span>
                <span className="text-xs text-gray-500">
                  {h.updateTime ? new Date(h.updateTime).toLocaleDateString() : '-'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-gray-500 py-1">{t('noDataFound')}</div>
        )}
      </div>

      {/* Portal-based print: renders to document.body, outside the dialog */}
      {printMode && !loading && report && (
        <PrintPortal
          sku={sku}
          planQty={planQty}
          pickQty={pickQty}
          locationCode={locationCode}
          order={order}
          report={report}
          onClose={() => setPrintMode(false)}
        />
      )}
    </div>
  )
}


interface OrderSheetProps {
  order: AbnormalOrder
  onClose: () => void
}

function OrderSheet({ order, onClose }: OrderSheetProps) {
  const { t } = useTranslation()
  const [details, setDetails] = useState<AbnormalDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showResolution, setShowResolution] = useState(false)

  useEffect(() => {
    setLoading(true)
    getAbnormalOrderDetail(order.shipNoteNo)
      .then(d => { setDetails(d); setError('') })
      .catch(e => setError(e?.response?.data?.detail || t('fetchError')))
      .finally(() => setLoading(false))
  }, [order.shipNoteNo])

  const isResolved = !!order.resolved_at

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-auto min-w-[35rem] max-h-[90vh] bg-dark-800 border border-dark-500 rounded-2xl flex flex-col overflow-hidden print-card mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-500 shrink-0">
          <div>
            <div className="text-sm font-semibold text-white flex items-center gap-2">
              <AlertTriangle size={14} className={isResolved ? 'text-emerald-400' : 'text-amber-400'} />
              {order.shipNoteNo}
              {isResolved && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <ShieldCheck size={10} />
                  {t('resolved')}
                </span>
              )}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {order.exceptionTypeName} · {order.skuQty} SKUs · {order.trackNo || '-'}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowResolution(true)}
              className="p-2 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border border-emerald-500/20 transition-colors"
              title="Log Resolution"
            >
              <ClipboardList size={16} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-dark-600 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <RefreshCw size={18} className="animate-spin mr-2" /> Loading...
            </div>
          )}
          {error && <div className="text-center text-red-400 text-sm py-6">{error}</div>}

          {!loading && !error && details.length === 0 && (
            <div className="text-center text-gray-500 py-6 text-sm">No SKU details found.</div>
          )}

          {!loading && details.map((d, i) => (
            <InlineSkuCard
              key={i}
              sku={d.sku}
              planQty={d.planQty}
              pickQty={d.pickQty}
              locationCode={d.locationCode || ''}
              order={order}
              onClose={onClose}
            />
          ))}
        </div>
      </div>

      {/* Resolution log modal */}
      {showResolution && details.length > 0 && (
        <ResolutionModal
          orderNo={order.shipNoteNo}
          skus={[...new Set(details.map(d => d.sku))]}
          onClose={() => setShowResolution(false)}
        />
      )}
    </div>
  )
}

// ── Order List Panel (shared by both columns) ─────────────────────────────────

interface OrderPanelProps {
  orders: AbnormalOrder[]
  loading: boolean
  variant: 'pending' | 'resolved'
  onOrderClick: (order: AbnormalOrder) => void
}

function OrderPanel({ orders, loading, variant, onOrderClick }: OrderPanelProps) {
  const { t } = useTranslation()
  const isPending = variant === 'pending'
  const borderColor = isPending ? 'border-amber-500' : 'border-emerald-500'
  const headerBg = isPending ? 'bg-amber-500/10' : 'bg-emerald-500/10'
  const headerText = isPending ? 'text-amber-400' : 'text-emerald-400'
  const dotColor = isPending ? 'bg-amber-400' : 'bg-emerald-400'
  const emptyLabel = isPending ? t('noPendingOrders') : t('noResolvedOrders')

  return (
    <div className={`flex-1 min-w-0 border-t-2 ${borderColor} rounded-b-xl`}>
      {/* Column header */}
      <div className={`px-4 py-3 ${headerBg} rounded-b-xl`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${dotColor} animate-pulse`} />
          <span className={`text-sm font-semibold ${headerText}`}>
            {isPending ? t('pendingOrders') : t('resolvedOrders')}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${headerBg} ${headerText}`}>
            {orders.length}
          </span>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[calc(100vh-280px)]">
        {loading && (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <RefreshCw size={16} className="animate-spin mr-2" />
          </div>
        )}

        {!loading && orders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-gray-500">
            <AlertTriangle size={24} className="mb-2 opacity-20" />
            <p className="text-xs">{emptyLabel}</p>
          </div>
        )}

        {!loading && orders.map(order => {
          const isResolved = !!order.resolved_at
          return (
            <button
              key={order.shipNoteNo}
              onClick={() => onOrderClick(order)}
              className={`
                w-full text-left rounded-xl p-3 transition-all group
                bg-dark-700/60 border border-dark-500/50
                hover:bg-dark-600 hover:border-dark-400
              `}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-mono font-semibold text-white">
                      {order.shipNoteNo}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full border border-white/20 text-white/80">
                      {order.exceptionTypeName || 'Unknown'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>{order.skus?.length ? `${order.skus.length} SKU${order.skus.length !== 1 ? 's' : ''}` : `${order.skuQty ?? 0} SKU${order.skuQty !== 1 ? 's' : ''}`}</span>
                    {order.pickNo && <span>Pick: {order.pickNo}</span>}
                    {order.trackNo && <span className="font-mono truncate max-w-[120px]">Tracking: {order.trackNo}</span>}
                  </div>

                  {order.skus && order.skus.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {order.skus.slice(0, 8).map(sku => (
                        <span
                          key={sku}
                          className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 font-mono border border-indigo-500/20"
                        >
                          {sku}
                        </span>
                      ))}
                      {order.skus.length > 8 && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-dark-600/80 text-gray-500 border border-dark-600">
                          +{order.skus.length - 8}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="text-gray-500 group-hover:text-gray-300 transition-colors shrink-0 mt-0.5">
                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/>
                  </svg>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Abnormal Page ─────────────────────────────────────────────────────────

const REFRESH_COOLDOWN_SEC = 10

export default function AbnormalPage() {
  const { t } = useTranslation()
  const [orders, setOrders] = useState<AbnormalOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [cooldownRemaining, setCooldownRemaining] = useState(0)
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'refreshing' | 'refreshed' | 'error'>('idle')

  // Date range state — default to today
  const [startDate, setStartDate] = useState(todayStr())
  const [endDate, setEndDate] = useState(todayStr())

  // Sheet state
  const [selectedOrder, setSelectedOrder] = useState<AbnormalOrder | null>(null)

  // Debounce: track the last time we successfully triggered a refresh
  const lastRefreshMs = useRef(0)
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── SSE: listen for Rainbow token refresh events ─────────────────────────────
  useEffect(() => {
    const es = new EventSource(`${API_BASE}/api/wms/token-refresh-events`)
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.event === 'token:refreshing') {
          setTokenStatus('refreshing')
        } else if (data.event === 'token:refreshed') {
          setTokenStatus('refreshed')
          setTimeout(() => setTokenStatus('idle'), 3000)
        } else if (data.event === 'token:error') {
          setTokenStatus('error')
          setTimeout(() => setTokenStatus('idle'), 5000)
        }
      } catch { /* ignore parse errors */ }
    }
    return () => es.close()
  }, [])

  const loadOrders = () => {
    setLoading(true)
    return getAbnormalOrders({ start_date: startDate, end_date: endDate, status: 'all' })
      .then(d => setOrders(d))
      .finally(() => setLoading(false))
  }

  // Reload whenever date range changes
  useEffect(() => {
    loadOrders()
  }, [startDate, endDate])

  // Cooldown tick
  useEffect(() => {
    if (cooldownRemaining <= 0) return
    cooldownTimer.current = setInterval(() => {
      const elapsed = Date.now() - lastRefreshMs.current
      const remaining = Math.max(0, REFRESH_COOLDOWN_SEC * 1000 - elapsed)
      setCooldownRemaining(Math.ceil(remaining / 1000))
    }, 500)
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current)
    }
  }, [cooldownRemaining > 0])

  const handleRefresh = async () => {
    const now = Date.now()
    const elapsed = now - lastRefreshMs.current
    const remaining = REFRESH_COOLDOWN_SEC * 1000 - elapsed

    if (remaining > 0) {
      setCooldownRemaining(Math.ceil(remaining / 1000))
      return
    }

    setRefreshing(true)
    setCooldownRemaining(REFRESH_COOLDOWN_SEC)
    lastRefreshMs.current = now

    try {
      await refreshAbnormalOrders()
      // Wait for background thread to finish persisting to DB, then poll
      // until the order count is stable (no more changes). This handles both
      // cases: server has NEW orders (they appear) or 0 orders (stale pending
      // orders get resolved by the backend and disappear from the pending list).
      let prevCount = orders.length
      let attempts = 0
      while (attempts < 8) {
        await new Promise(r => setTimeout(r, 1000))
        const data = await getAbnormalOrders({ start_date: startDate, end_date: endDate, status: 'all' })
        setOrders(data)
        setLoading(false)
        // Stop when count is stable (same as previous poll) — server and DB are in sync
        if (data.length === prevCount) break
        prevCount = data.length
        attempts++
      }
    } finally {
      setRefreshing(false)
    }
  }

  const pendingOrders = orders.filter(o => !o.resolved_at)
  const resolvedOrders = orders.filter(o => !!o.resolved_at)

  return (
    <div className="h-full flex flex-col">
      {/* Page header */}
      <div className="px-6 pt-6 pb-4 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold text-white flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-400" />
              {t('abnormalOrders')}
            </h1>
            <p className="text-xs text-gray-400 mt-0.5" />
          </div>

          {/* Refresh button with debounce */}
          <button
            onClick={handleRefresh}
            disabled={refreshing || cooldownRemaining > 0}
            className={`
              text-xs px-4 py-2 rounded-xl border transition-all flex items-center gap-1.5 font-medium
              ${cooldownRemaining > 0
                ? 'bg-dark-600 text-gray-500 border-dark-400 cursor-not-allowed'
                : refreshing
                  ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/30'
                  : 'bg-indigo-600/20 text-indigo-300 border-indigo-500/20 hover:bg-indigo-600/30 hover:border-indigo-500/40 cursor-pointer'
              }
            `}
            title={cooldownRemaining > 0 ? `${cooldownRemaining}s cooldown` : 'Load Data'}
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            {refreshing
              ? 'Loading...'
              : cooldownRemaining > 0
                ? `${cooldownRemaining}s`
                : 'Load Data'
            }
          </button>
        </div>

        {/* Date range row */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 shrink-0">From</span>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            max={endDate}
            className="flex-1 text-xs bg-dark-700 border border-dark-500 rounded-lg px-3 py-1.5 text-gray-200 outline-none focus:border-indigo-500/50"
          />
          <span className="text-xs text-gray-500 shrink-0">To</span>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            min={startDate}
            max={todayStr()}
            className="flex-1 text-xs bg-dark-700 border border-dark-500 rounded-lg px-3 py-1.5 text-gray-200 outline-none focus:border-indigo-500/50"
          />
        </div>

        {/* Status summary */}
        <div className="flex items-center gap-3 mt-2" />
      </div>

      {/* Token refresh notification banner */}
      {tokenStatus === 'refreshing' && (
        <div className="mx-6 mb-2 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
          <KeyRound size={12} className="shrink-0 animate-pulse" />
          {t('tokenRefreshing')}
        </div>
      )}
      {tokenStatus === 'refreshed' && (
        <div className="mx-6 mb-2 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
          <KeyRound size={12} className="shrink-0" />
          {t('tokenRefreshed')}
        </div>
      )}
      {tokenStatus === 'error' && (
        <div className="mx-6 mb-2 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
          <KeyRound size={12} className="shrink-0" />
          {t('tokenRefreshFailed')}
        </div>
      )}

      {/* Two-column order list */}
      <div className="flex gap-3 px-6 pb-6 flex-1 min-h-0">
        {/* Pending column */}
        <OrderPanel
          orders={pendingOrders}
          loading={loading}
          variant="pending"
          onOrderClick={setSelectedOrder}
        />

        {/* Divider */}
        <div className="w-px bg-dark-600 shrink-0" />

        {/* Resolved column */}
        <OrderPanel
          orders={resolvedOrders}
          loading={loading}
          variant="resolved"
          onOrderClick={setSelectedOrder}
        />
      </div>

      {/* Order detail sheet */}
      {selectedOrder && (
        <OrderSheet
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </div>
  )
};
