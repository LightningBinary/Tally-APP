import axios from 'axios'
import type { Member, Task, Schedule } from '../types'

export const API_BASE = ''   // Uses Vite proxy — same origin for both API and SSE

const api = axios.create({ baseURL: '/api' })

// Members
export const getMembers = () => api.get<Member[]>('/members/').then(r => r.data)
export const getMembersWorkingToday = (date?: string) =>
  api.get<Member[]>('/members/working-today', { params: date ? { date } : undefined }).then(r => r.data)
export const createMember = (data: Omit<Member, 'id' | 'created_at'>) =>
  api.post<Member>('/members/', data).then(r => r.data)
export const updateMember = (id: number, data: Partial<Member>) =>
  api.put<Member>(`/members/${id}`, data).then(r => r.data)
export const deleteMember = (id: number) => api.delete(`/members/${id}`)

// Schedules
export const getMemberSchedules = (memberId: number) =>
  api.get<Schedule[]>(`/members/${memberId}/schedules`).then(r => r.data)
export const updateSchedule = (memberId: number, day: number, data: Partial<Schedule>) =>
  api.put<Schedule>(`/members/${memberId}/schedules/${day}`, data).then(r => r.data)

// Tasks
export const getTasks = (params?: { date?: string; status?: string; member_id?: number }) =>
  api.get<Task[]>('/tasks/', { params }).then(r => r.data)
export const createTask = (data: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'member'>) =>
  api.post<Task>('/tasks/', data).then(r => r.data)
export const updateTask = (id: number, data: Partial<Task>) =>
  api.put<Task>(`/tasks/${id}`, data).then(r => r.data)
export const deleteTask = (id: number) => api.delete(`/tasks/${id}`)

// Pause / Resume
export const pauseTask = (id: number) => api.post<Task>(`/tasks/${id}/pause`).then(r => r.data)
export const resumeTask = (id: number) => api.post<Task>(`/tasks/${id}/resume`).then(r => r.data)

// Settings
export const getSetting = (key: string) =>
  api.get<{ key: string; value: string }>(`/settings/${key}`).then(r => r.data)
export const upsertSetting = (key: string, value: string) =>
  api.put(`/settings/${key}`, { key, value }).then(r => r.data)

// ── WMS ────────────────────────────────────────────────────────────────────

// Abnormal orders (with date range + status filter)
export const getAbnormalOrders = (params?: {
  start_date?: string
  end_date?: string
  status?: string
}) =>
  api.get<AbnormalOrder[]>('/wms/abnormal-orders', { params }).then(r => r.data)

export const refreshAbnormalOrders = () =>
  api.post('/wms/abnormal-orders/refresh').then(r => r.data)

export const getAbnormalOrderDetail = (shipNoteNo: string) =>
  api.get<AbnormalDetail[]>(`/wms/abnormal-orders/${encodeURIComponent(shipNoteNo)}/detail`).then(r => r.data)

// Rainbow SKU report (auto-refreshes token on 401)
export const getRainbowSkuReport = (sku: string, skipCache = false, signal?: AbortSignal) =>
  api.get<RainbowSkuReport>(`/wms/rainbow/sku/${encodeURIComponent(sku)}`, {
    params: skipCache ? { skip_cache: true } : undefined,
    signal,
  }).then(r => r.data)

// China Post SKU search (PHPSESSID managed entirely by backend from .env)
export const getCpSkuReport = (sku: string, signal?: AbortSignal) =>
  api.get<CpSkuReport>(`/wms/cp/sku/${encodeURIComponent(sku)}`, { signal }).then(r => r.data)

// Resolution logs
export interface ResolutionLog {
  log_id: number
  orderNo: string
  sku: string
  found_in_inventory: boolean
  inventory_location?: string
  found_in_history: boolean
  found_location?: string
  location_type?: string
  history_total_locs?: number
  rank_alphabetical?: number
  rank_updates?: number
  steps_taken?: number
  not_found: boolean
  strategy_used?: string
  checker_name?: string
  snapshot_at?: string
  created_at: string
}

export interface CreateResolutionLogPayload {
  orderNo: string
  sku: string
  found_in_inventory: boolean
  inventory_location?: string
  found_in_history: boolean
  found_location?: string
  location_type?: string
  not_found: boolean
  strategy_used?: string
  checker_name?: string
}

export const createResolutionLog = (data: CreateResolutionLogPayload) =>
  api.post('/wms/resolution-logs', data).then(r => r.data)

export const getResolutionLogs = (orderNo?: string, sku?: string) =>
  api.get<ResolutionLog[]>('/wms/resolution-logs', {
    params: { orderNo, sku },
  }).then(r => r.data)

// ── WMS Types ───────────────────────────────────────────────────────────────

export interface AbnormalOrder {
  shipNoteNo: string
  pickNo?: string
  skuQty?: number
  exceptionTypeName?: string
  trackNo?: string
  create_at?: string
  sync_at?: string
  resolved_at?: string | null
  skus: string[]
}

export interface AbnormalDetail {
  sku: string
  planQty: number
  pickQty: number
  locationCode: string
  order_date?: string

}

export interface RainbowSkuReport {
  sku: string
  sku_info: {
    sku?: string
    productSku?: string
    productNameCn?: string
    productNameEn?: string
    size?: string
    realWeight?: number
    productImageList: string[]
    primaryImage?: string
  }
  inventory: {
    sku?: string
    locationCode?: string
    usableQty?: number
    outQty?: number
    pendingQty?: number
  }[]
  history: {
    sku?: string
    locationCode?: string
    updateTime?: string
  }[]
  qr_code_base64: string
  sync_at?: string
}

export interface CpSkuReport {
  sku: string
  detail: {
    sku?: string
    product_cn_name?: string
    product_en_name?: string
    length?: string
    width?: string
    height?: string
    weight?: string
  }
  inventory: { sku?: string; location?: string; quantity?: number }[]
  history: { sku?: string; location?: string; updated_time?: string }[]
  qr_code_base64?: string
}
