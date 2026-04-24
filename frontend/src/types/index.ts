export interface Member {
  id: number
  name: string
  role: string
  avatar_color: string
  phone: string
  note: string
  created_at: string
}

export interface Task {
  id: number
  member_id: number | null
  title: string
  task_type: string
  status: 'todo' | 'in_progress' | 'done'
  wms_code: string
  units: number
  duration_min: number
  detail: string
  date: string
  start_time: string | null
  end_time: string | null
  created_at: string
  updated_at: string
  is_paused: boolean
  paused_at: string | null
  member?: Member | null
}

export interface Schedule {
  id: number
  member_id: number
  day_of_week: number
  shift_start: string
  shift_end: string
  is_off: boolean
}

export type TaskStatus = 'todo' | 'in_progress' | 'done'
export type TaskType = 'Counting' | 'Value-Added' | 'Abnormal' | 'Turnover' | 'Return' | 'Other'
export const TASK_TYPES: TaskType[] = ['Counting', 'Value-Added', 'Abnormal', 'Turnover', 'Return', 'Other']
export const ROLES = ['Manager', 'Lead', 'Worker']
export const ROLE_COLORS: Record<string, string> = {
  Manager: '#f59e0b',
  Lead: '#6366f1',
  Worker: '#10b981',
}
export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
