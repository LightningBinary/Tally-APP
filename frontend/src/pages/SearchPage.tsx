import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Search, Package, RefreshCw, X, MapPin,
  Boxes, Clock, AlertCircle, Printer, Image as ImageIcon, KeyRound,
} from 'lucide-react'
import {
  getRainbowSkuReport,
  getCpSkuReport,
  API_BASE,
} from '../api'
import PrintPortal from '../components/PrintPortal'
import CpPrintPortal from '../components/CpPrintPortal'

// ── Rainbow SKU Sheet ─────────────────────────────────────────────────────────

function RainbowSkuSheet({ sku, onClose }: { sku: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [report, setReport] = useState<RainbowSkuReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [printMode, setPrintMode] = useState(false)

  useEffect(() => {
    setLoading(true)
    setReport(null)  // clear old data immediately
    setError('')
    let cancelled = false
    // skipCache=true: fetch from server only, do NOT persist to wms.db
    getRainbowSkuReport(sku, true)
      .then(r => { if (!cancelled) setReport(r) })
      .catch(() => { if (!cancelled) setError(t('noDataFound')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sku])

  const totalStock = report?.inventory.reduce((s, i) => s + (i.usableQty ?? 0), 0) ?? 0
  const primaryImage = report?.sku_info?.primaryImage || report?.sku_info?.productImageList?.[0]
  const productNameCn = report?.sku_info?.productNameCn
  const productNameEn = report?.sku_info?.productNameEn
  const productSize = report?.sku_info?.size
  const productWeight = report?.sku_info?.realWeight

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[88vh] bg-dark-800 border border-dark-500 rounded-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-500">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/15">
              <Package size={18} className="text-amber-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">{sku}</div>
              <div className="text-xs text-gray-400">
                {t('rainbowWms')} · {totalStock > 0 ? t('unitsInStock', { count: totalStock }) : t('noDataFound')}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPrintMode(true)}
              disabled={loading || !report}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-dark-600 transition-colors disabled:opacity-30"
              title={t('printSkuCard')}
            >
              <Printer size={18} />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-dark-600 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <RefreshCw size={20} className="animate-spin mr-2" /> {t('loading')}
            </div>
          )}
          {error && <div className="text-center py-10 text-red-400 text-sm">{error}</div>}

          {report && !loading && (
            <>
              {/* 1. Product Image + Info */}
              <div className="flex items-start gap-3">
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
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-semibold text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/20">{sku}</span>
                    {report?.sku_info?.productSku && (
                      <span className="text-xs font-mono text-gray-500 bg-dark-600 px-2 py-0.5 rounded">{t('prodSku')}: {report.sku_info.productSku}</span>
                    )}
                  </div>
                  {productNameCn && (
                    <div className="text-sm text-white font-medium">{productNameCn}</div>
                  )}
                  {productNameEn && (
                    <div className="text-xs text-gray-400">{productNameEn}</div>
                  )}
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
                </div>
              </div>

              {/* 2. QR Code */}
              {report.qr_code_base64 && (
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
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Boxes size={11} />
                  {t('inventory')} (Total: {totalStock})
                </div>
                {report.inventory && report.inventory.length > 0 ? (
                  <div className="space-y-1">
                    {report.inventory.map((item, i) => (
                      <div key={i} className="flex items-center justify-between bg-dark-600/60 rounded-lg px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <MapPin size={11} className="text-amber-400" />
                          <span className="text-xs font-mono text-gray-200">{item.locationCode}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-emerald-400">{item.usableQty ?? 0} {t('available')}</span>
                          <span className="text-red-400/70">{item.pendingQty ?? 0} {t('pending')}</span>
                          <span className="text-gray-500">{item.outQty ?? 0} {t('out')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 py-1">{t('noDataFound')}</div>
                )}
              </div>

              {/* 4. History Locations */}
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Clock size={11} /> {t('locationHistory')}
                </div>
                {report.history && report.history.length > 0 ? (
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
            </>
          )}
        </div>
      </div>

      {/* Print Portal */}
      {printMode && !loading && report && (
        <PrintPortal
          sku={sku}
          planQty={0}
          pickQty={0}
          locationCode={report.inventory?.[0]?.locationCode || ''}
          order={{ shipNoteNo: 'Search', exceptionTypeName: 'Rainbow WMS' } as any}
          report={report}
          onClose={() => setPrintMode(false)}
        />
      )}
    </div>
  )
}

// ── CP SKU Sheet ───────────────────────────────────────────────────────────────

function CpSkuSheet({ sku, onClose }: { sku: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [report, setReport] = useState<CpSkuReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [printMode, setPrintMode] = useState(false)

  useEffect(() => {
    setLoading(true)
    setReport(null)  // clear old data immediately
    setError('')
    let cancelled = false
    getCpSkuReport(sku)
      .then(r => { if (!cancelled) setReport(r) })
      .catch(e => { if (!cancelled) setError(e?.response?.data?.detail || t('noDataFound')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sku])

  const totalStock = report?.inventory.reduce((s, i) => s + (i.quantity ?? 0), 0) ?? 0
  const productNameCn = report?.detail?.product_cn_name
  const productNameEn = report?.detail?.product_en_name
  const productWeight = report?.detail?.weight
  const productSize = report?.detail?.length ? `${report.detail.length} x ${report.detail.width} x ${report.detail.height}` : undefined

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[88vh] bg-dark-800 border border-dark-500 rounded-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-500">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-pink-500/15">
              <Package size={18} className="text-pink-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">{sku}</div>
              <div className="text-xs text-gray-400">
                {t('chinaPost')} · {totalStock > 0 ? t('unitsInStock', { count: totalStock }) : t('noDataFound')}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPrintMode(true)}
              disabled={loading || !report}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-dark-600 transition-colors disabled:opacity-30"
              title={t('printSkuCard')}
            >
              <Printer size={18} />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-dark-600 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <RefreshCw size={20} className="animate-spin mr-2" /> {t('loading')}
            </div>
          )}
          {error && <div className="text-center py-10 text-red-400 text-sm">{error}</div>}

          {report && !loading && (
            <>
              {/* 1. Product Info (no image for CP) */}
              <div className="flex items-start gap-3">
                <div className="w-16 h-16 rounded-lg bg-dark-600 flex items-center justify-center shrink-0 border border-dark-500">
                  <ImageIcon size={24} className="text-gray-600" />
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-semibold text-pink-300 bg-pink-500/10 px-2.5 py-1 rounded border border-pink-500/20">{sku}</span>
                  </div>
                  {productNameCn && (
                    <div className="text-sm text-white font-medium">{productNameCn}</div>
                  )}
                  {productNameEn && (
                    <div className="text-xs text-gray-400">{productNameEn}</div>
                  )}
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
                </div>
              </div>

              {/* 2. Stock Distribution */}
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Boxes size={11} />
                  {t('inventory')} (Total: {totalStock})
                </div>
                {report.inventory && report.inventory.length > 0 ? (
                  <div className="space-y-1">
                    {report.inventory.map((item, i) => (
                      <div key={i} className="flex items-center justify-between bg-dark-600/60 rounded-lg px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <MapPin size={11} className="text-pink-400" />
                          <span className="text-xs font-mono text-gray-200">{item.location}</span>
                        </div>
                        <span className="text-xs text-emerald-400 font-medium">{item.quantity ?? 0} {t('available')}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 py-1">{t('noDataFound')}</div>
                )}
              </div>

              {/* 3. History Locations */}
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Clock size={11} /> {t('locationHistory')}
                </div>
                {report.history && report.history.length > 0 ? (
                  <div className="space-y-1">
                    {[...report.history].sort((a, b) => (a.location || '').localeCompare(b.location || '')).map((h, i) => (
                      <div key={i} className="flex items-center justify-between bg-dark-600/40 rounded-lg px-3 py-1.5">
                        <span className="text-xs font-mono text-gray-300">{h.location}</span>
                        <span className="text-xs text-gray-500">
                          {h.updated_time ? new Date(h.updated_time).toLocaleDateString() : '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 py-1">{t('noDataFound')}</div>
                )}
              </div>

              {!report.detail && !report.inventory?.length && !report.history?.length && (
                <div className="text-center text-gray-500 py-8 text-sm">{t('noDataFound')}</div>
              )}
            </>
          )}
        </div>
      </div>

      {/* CP Print Portal */}
      {printMode && !loading && report && (
        <CpPrintPortal
          report={report}
          onClose={() => setPrintMode(false)}
        />
      )}
    </div>
  )
}

// ── Search Card wrapper ────────────────────────────────────────────────────────

function SearchCard({
  titleKey,
  color,
  icon,
  children,
}: {
  titleKey: string
  color: 'amber' | 'pink'
  icon: React.ReactNode
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const colorMap = {
    amber: { border: 'border-amber-500/20', bg: 'bg-amber-500/5', icon: 'text-amber-400', label: 'text-amber-300' },
    pink: { border: 'border-pink-500/20', bg: 'bg-pink-500/5', icon: 'text-pink-400', label: 'text-pink-300' },
  }
  const c = colorMap[color]

  return (
    <div className={`rounded-2xl border ${c.border} ${c.bg} p-5`}>
      <div className="flex items-center gap-2 mb-4">
        <div className={`p-1.5 rounded-lg ${c.bg}`}>{icon}</div>
        <h2 className={`text-sm font-semibold ${c.label}`}>{t(titleKey)}</h2>
      </div>
      {children}
    </div>
  )
}

// ── Search Input ──────────────────────────────────────────────────────────────

function SearchInput({
  value,
  onChange,
  onSearch,
  loading,
  placeholder,
  color,
}: {
  value: string
  onChange: (v: string) => void
  onSearch: () => void
  loading: boolean
  placeholder: string
  color: 'indigo' | 'pink'
}) {
  const { t } = useTranslation()
  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSearch()}
        placeholder={placeholder}
        className="flex-1 text-sm bg-dark-700 border border-dark-500 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 outline-none focus:border-indigo-500/50 transition-colors font-mono"
      />
      <button
        onClick={onSearch}
        disabled={loading || !value.trim()}
        className={`px-4 py-2.5 rounded-xl text-xs font-medium transition-colors disabled:opacity-40 flex items-center gap-1.5 ${
          color === 'indigo'
            ? 'bg-indigo-600/30 text-indigo-300 hover:bg-indigo-600/50 border border-indigo-500/30'
            : 'bg-pink-600/30 text-pink-300 hover:bg-pink-600/50 border border-pink-500/30'
        }`}
      >
        <Search size={13} className={loading ? 'animate-spin' : ''} />
        {t('search')}
      </button>
    </div>
  )
}

// ── Main Search Page ──────────────────────────────────────────────────────────

export default function SearchPage() {
  const { t } = useTranslation()

  // Rainbow state
  const [rainbowSku, setRainbowSku] = useState('')
  const [rainbowLoading, setRainbowLoading] = useState(false)
  const [rainbowError, setRainbowError] = useState('')
  const rainbowAbort = useRef<AbortController | null>(null)   // cancel in-flight requests

  // CP state
  const [cpSku, setCpSku] = useState('')
  const [cpLoading, setCpLoading] = useState(false)
  const [cpError, setCpError] = useState('')
  const cpAbort = useRef<AbortController | null>(null)         // cancel in-flight requests

  // Token refresh notification
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'refreshing' | 'refreshed' | 'error'>('idle')

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

  // Sheet state
  const [rainbowSheetSku, setRainbowSheetSku] = useState<string | null>(null)
  const [cpSheetSku, setCpSheetSku] = useState<string | null>(null)

  const searchRainbow = () => {
    if (!rainbowSku.trim()) return

    // Cancel any in-flight request so the sheet reflects only the latest SKU
    if (rainbowAbort.current) rainbowAbort.current.abort()
    rainbowAbort.current = new AbortController()

    setRainbowLoading(true)
    setRainbowError('')
    setRainbowSheetSku(null)  // close any open sheet immediately

    // skipCache=true: fetch from server only, do NOT persist to wms.db
    getRainbowSkuReport(rainbowSku.trim(), true, rainbowAbort.current.signal)
      .then(r => setRainbowSheetSku(r.sku))  // auto-open the detail sheet
      .catch((e: any) => {
        if (e.name === 'AbortError') return  // superseded by a newer search — ignore
        setRainbowError(e?.response?.data?.detail || t('noDataFound'))
        setRainbowSheetSku(null)
      })
      .finally(() => setRainbowLoading(false))
  }

  const searchCp = () => {
    if (!cpSku.trim()) return

    // Cancel any in-flight request so the sheet reflects only the latest SKU
    if (cpAbort.current) cpAbort.current.abort()
    cpAbort.current = new AbortController()

    setCpLoading(true)
    setCpError('')
    setCpSheetSku(null)  // close any open sheet immediately

    // CP already doesn't persist to DB — just fetch and display
    getCpSkuReport(cpSku.trim(), cpAbort.current.signal)
      .then(r => setCpSheetSku(r.sku))  // auto-open the detail sheet
      .catch((e: any) => {
        if (e.name === 'AbortError') return  // superseded by a newer search — ignore
        setCpError(e?.response?.data?.detail || t('noDataFound'))
        setCpSheetSku(null)
      })
      .finally(() => setCpLoading(false))
  }

  // No auto-search on type — only explicit Search click or Enter triggers a search

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 shrink-0">
        <h1 className="text-lg font-semibold text-white flex items-center gap-2">
          <Search size={18} className="text-indigo-400" />
          {t('skuSearch')}
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">{t('searchDesc')}</p>
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

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-5">

        {/* Rainbow WMS */}
        <SearchCard
          titleKey="rainbowWms"
          color="amber"
          icon={<Package size={14} className="text-amber-400" />}
        >
          <SearchInput
            value={rainbowSku}
            onChange={v => setRainbowSku(v)}
            onSearch={searchRainbow}
            loading={rainbowLoading}
            placeholder={t('skuPlaceholder')}
            color="indigo"
          />
          {rainbowError && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertCircle size={12} />
              {rainbowError}
            </div>
          )}
        </SearchCard>

        {/* China Post PDA */}
        <SearchCard
          titleKey="chinaPost"
          color="pink"
          icon={<Package size={14} className="text-pink-400" />}
        >
          <SearchInput
            value={cpSku}
            onChange={v => setCpSku(v)}
            onSearch={searchCp}
            loading={cpLoading}
            placeholder={t('cpSkuPlaceholder')}
            color="pink"
          />
          {cpError && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertCircle size={12} />
              {cpError}
            </div>
          )}
        </SearchCard>
      </div>

      {/* Sheets */}
      {rainbowSheetSku && (
        <RainbowSkuSheet
          sku={rainbowSheetSku}
          onClose={() => setRainbowSheetSku(null)}
        />
      )}
      {cpSheetSku && (
        <CpSkuSheet
          sku={cpSheetSku}
          onClose={() => setCpSheetSku(null)}
        />
      )}
    </div>
  )
}
