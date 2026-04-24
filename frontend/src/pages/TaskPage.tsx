import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, ArrowRight, Clock, Package, Pause, Play } from 'lucide-react'
import { getTasks, createTask, updateTask, deleteTask, pauseTask, resumeTask, getMembers, getMembersWorkingToday } from '../api'
import type { Task, Member } from '../types'
import { TASK_TYPES } from '../types'
import TaskModal from '../components/TaskModal'

const today = () => new Date().toISOString().slice(0, 10)

function getTypeClass(type: string) {
  const map: Record<string, string> = {
    'Counting': 'type-counting',
    'Value-Added': 'type-valueadded',
    'Abnormal': 'type-abnormal',
    'Turnover': 'type-turnover',
    'Return': 'type-return',
    'Other': 'type-other',
  }
  return map[type] ?? 'type-other'
}

function AvatarBadge({ member, size = 28 }: { member?: Member | null; size?: number }) {
  if (!member) return null
  const initials = member.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
      style={{ width: size, height: size, backgroundColor: member.avatar_color, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  )
}

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Calculate elapsed minutes from timestamps (always UTC to avoid timezone mismatch)
function calculateElapsedMinutes(
  startTime: string | null,
  endTime: string | null,
  status: Task['status'],
  isPaused: boolean,
  pausedAt: string | null
): number {
  if (!startTime) return 0
  // Parse as UTC by appending 'Z'
  const start = new Date(startTime.endsWith('Z') ? startTime : startTime + 'Z').getTime()
  if (status === 'todo') return 0
  if (status === 'in_progress') {
    if (isPaused && pausedAt) {
      // Frozen at the moment it was paused
      const pauseMoment = new Date(pausedAt.endsWith('Z') ? pausedAt : pausedAt + 'Z').getTime()
      return Math.max(0, Math.floor((pauseMoment - start) / 60000))
    }
    // Still running — count up to now
    return Math.max(0, Math.floor((Date.now() - start) / 60000))
  }
  // done
  if (!endTime) return 0
  const end = new Date(endTime.endsWith('Z') ? endTime : endTime + 'Z').getTime()
  return Math.max(0, Math.floor((end - start) / 60000))
}

// Format UTC timestamp to local time string (24-hr)
function formatLocalTime(isoStr: string | null): string {
  if (!isoStr) return '--'
  const date = new Date(isoStr.endsWith('Z') ? isoStr : isoStr + 'Z')
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function TaskCard({
  task,
  onEdit,
  onDelete,
  onStatusChange,
  onPause,
  onResume,
  members,
}: {
  task: Task
  onEdit: (t: Task) => void
  onDelete: (id: number) => void
  onStatusChange: (id: number, status: Task['status']) => void
  onPause: (id: number) => void
  onResume: (id: number) => void
  members: Member[]
}) {
  const { t } = useTranslation()
  const member = task.member ?? members.find(m => m.id === task.member_id)
  const isAssigned = !!member
  const memberColor = member?.avatar_color ?? '#6e7681'
  const [tick, setTick] = useState(0) // force re-render for real-time updates

  // Real-time duration — respects is_paused flag
  const elapsed = useMemo(
    () => calculateElapsedMinutes(task.start_time, task.end_time, task.status, task.is_paused, task.paused_at),
    [task.start_time, task.end_time, task.status, task.is_paused, task.paused_at, tick]
  )

  // Force re-render every minute for IN_PROGRESS (non-paused) tasks
  useEffect(() => {
    if (task.status !== 'in_progress' || task.is_paused) return
    const interval = setInterval(() => {
      setTick(n => n + 1)
    }, 60000)
    return () => clearInterval(interval)
  }, [task.status, task.start_time, task.is_paused])

  const cardBg = isAssigned ? hexToRgba(memberColor, 0.14) : 'rgba(110, 118, 129, 0.14)'
  const borderColor = isAssigned ? hexToRgba(memberColor, 0.55) : 'rgba(110, 118, 129, 0.55)'
  const nameColor = isAssigned ? memberColor : '#9ca3af'

  return (
    <div
      className="p-3 mb-2 group relative rounded-xl transition-all duration-200 hover:scale-[1.01]"
      style={{
        backgroundColor: cardBg,
        border: `1px solid ${borderColor}`,
        borderLeft: `3px solid ${memberColor}`,
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <AvatarBadge member={member} size={24} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: nameColor }}>
            {member?.name ?? t('unassigned')}
          </span>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(task)}
            className="p-1 rounded hover:bg-dark-500 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="p-1 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Task title */}
      <div className="mb-1.5 text-sm font-medium text-gray-100">{task.title}</div>

      {/* Meta */}
      <div className="space-y-0.5 text-xs text-gray-400">
        <div className="flex items-center gap-1">
          <Clock size={10} />
          {t('startTime')}: {formatLocalTime(task.start_time)}
        </div>
        <div className="flex items-center gap-1">
          <Clock size={10} />
          {t('endTime')}: {formatLocalTime(task.end_time)}
        </div>
        {task.units > 0 && (
          <div className="flex items-center gap-1">
            <Package size={10} />
            <span>{task.units} units</span>
          </div>
        )}
        {elapsed > 0 && (
          <div className="flex items-center gap-1">
            <Clock size={10} />
            <span>{elapsed} min</span>
          </div>
        )}
        {task.detail && (
          <div className="mt-1 text-gray-300 italic leading-relaxed" style={{ color: `${memberColor}bb` }}>
            {task.detail}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="mt-2 flex items-center gap-2">
        {task.status === 'todo' && (
          <button
            onClick={() => onStatusChange(task.id, 'in_progress')}
            className="btn-success text-xs px-3 py-1"
          >
            {t('start')}
          </button>
        )}
        {task.status === 'in_progress' && !task.is_paused && (
          <>
            <button
              onClick={() => onStatusChange(task.id, 'done')}
              className="btn-danger text-xs px-3 py-1"
            >
              {t('end')}
            </button>
            <button
              onClick={() => onPause(task.id)}
              className="flex items-center gap-1 text-xs px-3 py-1 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30 transition-colors"
            >
              <Pause size={10} />
              {t('pause')}
            </button>
          </>
        )}
        {task.status === 'in_progress' && task.is_paused && (
          <>
            <button
              onClick={() => onStatusChange(task.id, 'done')}
              className="btn-danger text-xs px-3 py-1"
            >
              {t('end')}
            </button>
            <button
              onClick={() => onResume(task.id)}
              className="flex items-center gap-1 text-xs px-3 py-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors"
            >
              <Play size={10} />
              {t('resume')}
            </button>
            <span className="text-xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25 font-medium uppercase tracking-wider">
              {t('paused')}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

// Live row for one member showing their task chain
function LiveMemberRow({ member, tasks }: { member: Member; tasks: Task[] }) {
  const { t } = useTranslation()
  const [, forceRefresh] = useState(0)

  // Refresh every minute for real-time duration updates
  useEffect(() => {
    const interval = setInterval(() => forceRefresh(n => n + 1), 60000)
    return () => clearInterval(interval)
  }, [tasks])

  // Sort: latest tasks first (newest on the right); within same time, todo before in_progress
  const memberTasks = tasks
    .filter(t => t.member_id === member.id && t.status !== 'done')
    .sort((a, b) => {
      // Descending by time: newer tasks first
      const timeCmp = b.created_at.localeCompare(a.created_at)
      if (timeCmp !== 0) return timeCmp
      // within same second: todo < in_progress
      const statusOrder = { todo: 0, in_progress: 1 }
      return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
    })
    .slice(0, 5)

  return (
    <div className="flex items-center gap-3 py-2">
      <AvatarBadge member={member} size={36} />
      <div className="min-w-0">
        <div className="text-xs font-bold uppercase tracking-wide" style={{ color: member.avatar_color }}>{member.name}</div>
        <div className="text-xs text-gray-500">[{member.role}]</div>
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {memberTasks.length === 0 ? (
          <span className="text-xs text-gray-500 italic">{t('noTasks')}</span>
        ) : (
          memberTasks.map((task, idx) => {
            const mc = member.avatar_color
            const elapsed = calculateElapsedMinutes(task.start_time, task.end_time, task.status, task.is_paused, task.paused_at)

            // Status icon
            const isPaused = task.is_paused
            const isInProgress = task.status === 'in_progress' && !isPaused
            const pillBg = isPaused ? 'rgba(245,158,11,0.18)' : mc + '30'
            const pillBorder = isPaused ? 'rgba(245,158,11,0.45)' : mc + '55'

            return (
            <div key={task.id} className="flex items-center gap-1">
              <div
                className="tag-pill text-xs flex items-center gap-1"
                style={{
                  backgroundColor: pillBg,
                  color: isPaused ? '#fbbf24' : mc,
                  border: `1px solid ${pillBorder}`,
                }}
              >
                {isPaused ? (
                  <Pause size={9} />
                ) : isInProgress ? (
                  <span>✓</span>
                ) : (
                  <span className="text-gray-500">○</span>
                )}
                <span className="font-semibold uppercase text-[10px] tracking-wider mr-0.5">
                  {isPaused ? t('paused') : task.status === 'in_progress' ? t('inProgress') : t('todo')}
                </span>
                <span className="opacity-80">{t(task.task_type)}</span>
                {task.units > 0 && <span className="opacity-70">({task.units})</span>}
                {elapsed > 0 && <span className="opacity-80">· {elapsed}m</span>}
              </div>
              {idx < memberTasks.length - 1 && <ArrowRight size={12} className="text-gray-500 shrink-0" />}
            </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default function TaskPage() {
  const { t } = useTranslation()
  const [tasks, setTasks] = useState<Task[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [workingMembers, setWorkingMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [selectedDate, setSelectedDate] = useState(today())

  const loadData = useCallback(async () => {
    try {
      const [ts, ms, wm] = await Promise.all([
        getTasks({ date: selectedDate }),
        getMembers(),
        getMembersWorkingToday(selectedDate),
      ])
      setTasks(ts)
      setMembers(ms)
      setWorkingMembers(wm)
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  useEffect(() => { loadData() }, [loadData])

  // Auto-refresh every 30s
  useEffect(() => {
    const timer = setInterval(loadData, 30000)
    return () => clearInterval(timer)
  }, [loadData])

  const handleStatusChange = async (id: number, status: Task['status']) => {
    await updateTask(id, { status })
    loadData()
  }

  const handleDelete = async (id: number) => {
    if (confirm(t('confirmDelete'))) {
      await deleteTask(id)
      loadData()
    }
  }

  const handlePause = async (id: number) => {
    await pauseTask(id)
    loadData()
  }

  const handleResume = async (id: number) => {
    await resumeTask(id)
    loadData()
  }

  const handleSave = async (data: Partial<Task>) => {
    if (editingTask) {
      await updateTask(editingTask.id, data)
    } else {
      await createTask({ ...data, date: selectedDate } as any)
    }
    setModalOpen(false)
    setEditingTask(null)
    loadData()
  }

  const todoTasks = tasks.filter(t => t.status === 'todo')
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress')
  const doneTasks = tasks.filter(t => t.status === 'done')

  // Live section: show all members scheduled to work on the selected date
  // sorted: members with active tasks first, then idle members alphabetically
  const liveMembers = [...workingMembers].sort((a, b) => {
    const aActive = tasks.some(t => t.member_id === a.id && t.status !== 'done')
    const bActive = tasks.some(t => t.member_id === b.id && t.status !== 'done')
    if (aActive && !bActive) return -1
    if (!aActive && bActive) return 1
    return a.name.localeCompare(b.name)
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-5 space-y-5">
      {/* Date selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">{t('date')}:</span>
        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="input-field w-auto text-sm"
        />
      </div>

      {/* Live Team Assignments */}
      <section>
        <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #1a2a3a 0%, #0f1e2e 100%)', border: '1px solid rgba(99,102,241,0.15)' }}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
            <h2 className="text-sm font-semibold text-gray-100">{t('liveTeamAssignments')}</h2>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-xs text-emerald-400">{t('live')}</span>
            </div>
          </div>
          <div className="px-5 divide-y divide-white/5">
            {liveMembers.length === 0 ? (
              <div className="py-6 text-center text-gray-500 text-sm">{t('noTasks')}</div>
            ) : (
              liveMembers.map(m => (
                <LiveMemberRow key={m.id} member={m} tasks={tasks} />
              ))
            )}
          </div>
        </div>
      </section>

      {/* Ad-Hoc Kanban */}
      <section>
        <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #0d1b2a 0%, #0a1628 100%)', border: '1px solid rgba(99,102,241,0.15)' }}>
          <div className="px-5 py-3 border-b border-white/5">
            <h2 className="text-sm font-semibold text-indigo-300">{t('dailyAdHoc')}</h2>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-3 gap-4">
              {/* TO DO */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('todo')}</span>
                  <span className="text-xs bg-dark-500 text-gray-400 px-2 py-0.5 rounded-full">{todoTasks.length}</span>
                </div>
                <button
                  onClick={() => { setEditingTask(null); setModalOpen(true) }}
                  className="w-full mb-2 py-1.5 rounded-lg border border-dashed border-dark-400 text-xs text-gray-500 hover:text-gray-300 hover:border-dark-300 transition-all flex items-center justify-center gap-1"
                >
                  <Plus size={12} /> {t('newTask')}
                </button>
                {todoTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    members={members}
                    onEdit={t => { setEditingTask(t); setModalOpen(true) }}
                    onDelete={handleDelete}
                    onStatusChange={handleStatusChange}
                    onPause={handlePause}
                    onResume={handleResume}
                  />
                ))}
              </div>

              {/* IN PROGRESS */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">{t('inProgress')}</span>
                  <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/20">{inProgressTasks.length}</span>
                </div>
                {inProgressTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    members={members}
                    onEdit={t => { setEditingTask(t); setModalOpen(true) }}
                    onDelete={handleDelete}
                    onStatusChange={handleStatusChange}
                    onPause={handlePause}
                    onResume={handleResume}
                  />
                ))}
              </div>

              {/* DONE */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">{t('done')}</span>
                  <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">{doneTasks.length}</span>
                </div>
                <div className="max-h-[600px] overflow-y-auto space-y-2 pr-1">
                  {doneTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      members={members}
                      onEdit={t => { setEditingTask(t); setModalOpen(true) }}
                      onDelete={handleDelete}
                      onStatusChange={handleStatusChange}
                      onPause={handlePause}
                      onResume={handleResume}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Modal */}
      {modalOpen && (
        <TaskModal
          task={editingTask}
          members={members}
          date={selectedDate}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditingTask(null) }}
        />
      )}
    </div>
  )
}
