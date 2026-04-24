import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X, MapPin, Clock, CheckCircle2, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
import {
  getRainbowSkuReport,
  createResolutionLog,
  getResolutionLogs,
  type ResolutionLog,
  type CreateResolutionLogPayload,
} from '../api'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ResolutionModalProps {
  orderNo: string
  skus: string[]
  onClose: () => void
}

type LogState = 'pending' | 'saving' | 'saved' | 'error'

interface SkuStep {
  sku: string
  // Step 1
  invChecked: boolean
  invFoundLocation: string | null   // null = not found in inventory
  // Step 2
  histChecked: boolean
  histFoundLocation: string | null
  histCustomLocation: string
  notFound: boolean
  logState: LogState
  errorMsg: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeRank(locs: { locationCode: string; updateTime?: string | null }[]): { locationCode: string; updateTime?: string | null; rank: number }[] {
  return [...locs]
    .filter(l => l.locationCode?.trim())
    .sort((a, b) => {
      const ta = a.updateTime || ''
      const tb = b.updateTime || ''
      return tb.localeCompare(ta) // newest first
    })
    .map((l, i) => ({ ...l, rank: i }))
}

function alphaRank(locs: { locationCode: string }[]): { locationCode: string; rank: number }[] {
  return [...locs]
    .filter(l => l.locationCode?.trim())
    .sort((a, b) => (a.locationCode || '').localeCompare(b.locationCode || ''))
    .map((l, i) => ({ ...l, rank: i }))
}

// ── Single-SKU Resolution Row ──────────────────────────────────────────────────

interface SkuRowProps {
  sku: string
  orderNo: string
  initialLog?: ResolutionLog
  onRemove?: () => void
}

function SkuRow({ sku, orderNo, initialLog, onRemove }: SkuRowProps) {
  const { t } = useTranslation()

  const [step, setStep] = useState<SkuStep>(() => ({
    sku,
    invChecked: initialLog?.found_in_inventory ?? false,
    invFoundLocation: initialLog?.inventory_location ?? null,
    histChecked: initialLog?.found_in_history ?? false,
    histFoundLocation: initialLog?.found_location ?? null,
    histCustomLocation: '',
    notFound: initialLog?.not_found ?? false,
    logState: initialLog ? 'saved' : 'pending',
    errorMsg: '',
  }))

  // ── Fetch SKU report for location data ────────────────────────────────────
  const [report, setReport] = useState<RainbowSkuReport | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    getRainbowSkuReport(sku)
      .then(r => setReport(r))
      .catch(() => setReport(null))
      .finally(() => setLoading(false))
  }, [sku])

  const invLocs = report?.inventory?.filter(i => i.locationCode?.trim()).map(i => i.locationCode!) ?? []
  const histLocs = report?.history ?? []
  const histTimeSorted = timeRank(histLocs)
  const histAlphaSorted = alphaRank(histLocs)

  const isInvFound = step.invFoundLocation !== null
  const isSaved = step.logState === 'saved'

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setStep(s => ({ ...s, logState: 'saving', errorMsg: '' }))

    const found_in_inventory = isInvFound
    const inventory_location = step.invFoundLocation
    const found_in_history = !isInvFound && !step.notFound && (step.histFoundLocation !== null || step.histCustomLocation.trim() !== '')
    const found_location = isInvFound
      ? step.invFoundLocation
      : (step.histCustomLocation.trim() || step.histFoundLocation || null)
    const location_type = isInvFound ? 'inventory' : 'history'
    const not_found = step.notFound || (!found_in_inventory && !found_in_history)

    const payload: CreateResolutionLogPayload = {
      orderNo,
      sku,
      found_in_inventory,
      inventory_location: inventory_location ?? undefined,
      found_in_history,
      found_location: found_location ?? undefined,
      location_type: (found_location && !not_found) ? location_type : undefined,
      not_found,
      strategy_used: 'alphabet',
      checker_name: undefined,
    }

    try {
      await createResolutionLog(payload)
      setStep(s => ({ ...s, logState: 'saved' }))
    } catch {
      setStep(s => ({ ...s, logState: 'error', errorMsg: 'Save failed' }))
    }
  }

  // ── Reset for re-logging ──────────────────────────────────────────────────
  const handleReset = () => {
    setStep(s => ({ ...s, logState: 'pending', invChecked: false, invFoundLocation: null, histChecked: false, histFoundLocation: null, histCustomLocation: '', notFound: false }))
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border bg-dark-700/60 border-dark-500 p-4 space-y-3">
      {/* SKU header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-mono font-semibold text-indigo-300">{sku}</span>
        <div className="flex items-center gap-2">
          {isSaved && (
            <span className="text-xs flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              <CheckCircle2 size={10} /> Saved
            </span>
          )}
          {isSaved && (
            <button
              onClick={handleReset}
              className="text-xs text-gray-500 hover:text-gray-300 underline"
            >
              Re-log
            </button>
          )}
          {onRemove && !isSaved && (
            <button onClick={onRemove} className="text-gray-500 hover:text-red-400">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Already-saved summary */}
      {isSaved && (
        <div className="text-xs text-gray-400 bg-dark-600/40 rounded-lg px-3 py-2 space-y-0.5">
          {step.invFoundLocation && (
            <div className="flex items-center gap-1.5">
              <MapPin size={10} className="text-emerald-400 shrink-0" />
              <span>Found in <b className="text-white">{step.invFoundLocation}</b> (inventory)</span>
            </div>
          )}
          {step.notFound && (
            <div className="flex items-center gap-1.5">
              <AlertCircle size={10} className="text-red-400 shrink-0" />
              <span>Not found</span>
            </div>
          )}
          {!step.invFoundLocation && !step.notFound && step.histFoundLocation && (
            <div className="flex items-center gap-1.5">
              <MapPin size={10} className="text-amber-400 shrink-0" />
              <span>Found in <b className="text-white">{step.histFoundLocation}</b> (history)</span>
            </div>
          )}
        </div>
      )}

      {!isSaved && (
        <>
          {/* ── Step 1: Inventory Check ──────────────────────────────────────────── */}
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Boxes size={11} />
              Step 1 — Inventory Check
            </div>

            {loading ? (
              <div className="text-xs text-gray-500 py-2">Loading...</div>
            ) : invLocs.length === 0 ? (
              <div className="text-xs text-gray-600 py-1.5 italic">No inventory locations in DB</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {invLocs.map(loc => (
                  <button
                    key={loc}
                    onClick={() => setStep(s => ({ ...s, invFoundLocation: loc, invChecked: true }))}
                    className={`text-xs px-2.5 py-1 rounded-lg border font-mono transition-all ${
                      step.invFoundLocation === loc
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                        : 'bg-dark-600 border-dark-500 text-gray-300 hover:border-emerald-500/30'
                    }`}
                  >
                    <MapPin size={9} className="inline mr-1" />
                    {loc}
                  </button>
                ))}
              </div>
            )}

            {/* "Not in inventory" toggle */}
            {!isInvFound && (
              <button
                onClick={() => setStep(s => ({ ...s, invChecked: true, invFoundLocation: null }))}
                className={`mt-2 text-xs px-2.5 py-1 rounded-lg border transition-all ${
                  step.invChecked && step.invFoundLocation === null
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-dark-600 border-dark-500 text-gray-500 hover:border-amber-500/30'
                }`}
              >
                Not in inventory — go to Step 2
              </button>
            )}
          </div>

          {/* ── Step 2: History Search (only if not found in inventory) ──────────── */}
          {isInvFound && (
            <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 p-3">
              <div className="text-xs text-emerald-400 flex items-center gap-1 mb-1">
                <CheckCircle2 size={11} />
                Found in inventory — {step.invFoundLocation}
              </div>
              <div className="text-xs text-gray-500">No history search needed.</div>
            </div>
          )}

          {!isInvFound && (
            <div className="border-t border-dark-500/50 pt-3">
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Clock size={11} />
                Step 2 — History Search
              </div>

              {histLocs.length === 0 ? (
                <div className="text-xs text-gray-600 italic py-1.5">No history locations in DB</div>
              ) : (
                <>
                  {/* Alphabetical view */}
                  <div className="mb-2">
                    <div className="text-xs text-gray-500 mb-1">Sort: A–Z</div>
                    <div className="flex flex-wrap gap-1.5">
                      {histAlphaSorted.map(({ locationCode, rank }) => (
                        <button
                          key={locationCode}
                          onClick={() => setStep(s => ({ ...s, histChecked: true, histFoundLocation: locationCode, notFound: false }))}
                          className={`text-xs px-2.5 py-1 rounded-lg border font-mono transition-all ${
                            step.histFoundLocation === locationCode && !step.notFound
                              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                              : 'bg-dark-600 border-dark-500 text-gray-300 hover:border-amber-500/30'
                          }`}
                          title={`Rank ${rank + 1} (0-indexed: ${rank})`}
                        >
                          <MapPin size={9} className="inline mr-1 opacity-50" />
                          {locationCode}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Time view */}
                  <div className="mb-2">
                    <div className="text-xs text-gray-500 mb-1">Sort: Newest first</div>
                    <div className="flex flex-wrap gap-1.5">
                      {histTimeSorted.map(({ locationCode, updateTime, rank }) => (
                        <button
                          key={locationCode}
                          onClick={() => setStep(s => ({ ...s, histChecked: true, histFoundLocation: locationCode, notFound: false }))}
                          className={`text-xs px-2.5 py-1 rounded-lg border font-mono transition-all ${
                            step.histFoundLocation === locationCode && !step.notFound
                              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                              : 'bg-dark-600 border-dark-500 text-gray-300 hover:border-amber-500/30'
                          }`}
                          title={`Updated: ${updateTime ? new Date(updateTime).toLocaleDateString() : '?'} | Rank ${rank + 1} (0-indexed: ${rank})`}
                        >
                          <Clock size={9} className="inline mr-1 opacity-50" />
                          {locationCode}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Custom location input */}
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  placeholder="Or type custom location..."
                  value={step.histCustomLocation}
                  onChange={e => setStep(s => ({ ...s, histCustomLocation: e.target.value, histChecked: true, histFoundLocation: null, notFound: false }))}
                  className="flex-1 text-xs bg-dark-600 border border-dark-500 rounded-lg px-3 py-1.5 text-white font-mono placeholder-gray-600 outline-none focus:border-indigo-500/50"
                />
              </div>

              {/* Not found toggle */}
              <div className="mt-2">
                <button
                  onClick={() => setStep(s => ({ ...s, notFound: true, histChecked: true, histFoundLocation: null, histCustomLocation: '' }))}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                    step.notFound
                      ? 'bg-red-500/10 border-red-500/30 text-red-300'
                      : 'bg-dark-600 border-dark-500 text-gray-500 hover:border-red-500/30'
                  }`}
                >
                  <AlertCircle size={10} className="inline mr-1" />
                  Not Found (after checking all locations)
                </button>
              </div>
            </div>
          )}

          {/* ── Submit ─────────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between pt-1">
            <div className="text-xs text-gray-600 italic">
              {step.invFoundLocation
                ? `Inventory: ${step.invFoundLocation}`
                : step.notFound
                  ? 'Not found'
                  : step.histFoundLocation || step.histCustomLocation
                    ? `History: ${step.histCustomLocation || step.histFoundLocation}`
                    : 'Select a location above'}
            </div>
            <button
              onClick={handleSubmit}
              disabled={
                step.logState === 'saving' ||
                (!isInvFound && !step.notFound && !step.histFoundLocation && !step.histCustomLocation.trim())
              }
              className="text-xs px-4 py-1.5 rounded-lg bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {step.logState === 'saving' ? 'Saving...' : step.logState === 'error' ? 'Retry' : 'Save'}
            </button>
          </div>
          {step.errorMsg && (
            <div className="text-xs text-red-400">{step.errorMsg}</div>
          )}
        </>
      )}
    </div>
  )
}

// ── Boxes icon helper (local inline) ───────────────────────────────────────────
function Boxes({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z"/>
      <path d="m7 16.5-4.74-2.85"/>
      <path d="m7 16.5 5-3"/>
      <path d="M7 16.5v5.17"/>
      <path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10l-5 3.5Z"/>
      <path d="m17 16.5-5-3"/>
      <path d="m17 16.5 4.74-2.85"/>
      <path d="M17 16.5v5.17"/>
      <path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z"/>
      <path d="M12 8 7.26 5.15"/>
      <path d="m12 8 4.74-2.85"/>
      <path d="M12 13.5V8"/>
    </svg>
  )
}

// ── Main ResolutionModal ───────────────────────────────────────────────────────

export default function ResolutionModal({ orderNo, skus, onClose }: ResolutionModalProps) {
  const { t } = useTranslation()
  const [activeSkus, setActiveSkus] = useState<string[]>([...skus])

  const handleRemoveSku = (sku: string) => {
    setActiveSkus(prev => prev.filter(s => s !== sku))
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-dark-800 border border-dark-500 rounded-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-500 shrink-0">
          <div>
            <div className="text-sm font-semibold text-white flex items-center gap-2">
              <MapPin size={14} className="text-emerald-400" />
              Log Resolution — {orderNo}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              Record where each SKU was found. Rank data is calculated automatically.
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-dark-600">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {activeSkus.length === 0 && (
            <div className="text-center text-gray-500 py-10 text-sm">
              All SKUs have been logged.
            </div>
          )}

          {activeSkus.map(sku => (
            <SkuRow
              key={sku}
              sku={sku}
              orderNo={orderNo}
              onRemove={() => handleRemoveSku(sku)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
