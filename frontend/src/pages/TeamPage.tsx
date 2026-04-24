import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell
} from 'recharts'
import {
  getMembers, createMember, updateMember, deleteMember,
  getMemberSchedules, updateSchedule, getTasks
} from '../api'
import type { Member, Schedule, Task } from '../types'
import { ROLES, ROLE_COLORS, DAY_LABELS } from '../types'

const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function Avatar({ member, size = 40 }: { member: Member; size?: number }) {
  const initials = member.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
      style={{ width: size, height: size, backgroundColor: member.avatar_color, fontSize: size * 0.35 }}
    >
      {initials}
    </div>
  )
}

function MemberModal({ member, onSave, onClose }: {
  member: Member | null
  onSave: (data: Partial<Member>) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [form, setForm] = useState({
    name: member?.name ?? '',
    role: member?.role ?? 'Worker',
    phone: member?.phone ?? '',
    note: member?.note ?? '',
    avatar_color: member?.avatar_color ?? ROLE_COLORS['Worker'],
  })

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  // Auto-update color when role changes
  const handleRoleChange = (role: string) => {
    setForm(f => ({ ...f, role, avatar_color: ROLE_COLORS[role] ?? f.avatar_color }))
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-card w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-500/40">
          <h2 className="font-semibold text-white">
            {member ? t('editMember') : t('addMember')}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-dark-500 text-gray-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('memberName')} *</label>
            <input className="input-field" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Full name" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('role')}</label>
            <select className="input-field" value={form.role} onChange={e => handleRoleChange(e.target.value)}>
              {ROLES.map(r => <option key={r} value={r}>{t(r)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('avatarColor')}</label>
            <div className="flex items-center gap-3">
              <input type="color" value={form.avatar_color} onChange={e => set('avatar_color', e.target.value)}
                className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-none" />
              <span className="text-xs text-gray-400">{form.avatar_color}</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('phone')}</label>
            <input className="input-field" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 (555) 000-0000" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('note')}</label>
            <textarea className="input-field resize-none" rows={2} value={form.note} onChange={e => set('note', e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-dark-500/40">
          <button onClick={onClose} className="btn-secondary">{t('cancel')}</button>
          <button onClick={() => onSave(form)} disabled={!form.name.trim()} className="btn-primary disabled:opacity-50">
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ScheduleRow({ member, schedules, onUpdate }: {
  member: Member
  schedules: Schedule[]
  onUpdate: (day: number, field: string, value: string | boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <tr className="border-b border-dark-500/30 hover:bg-dark-700/30 transition-colors">
      <td className="py-2 pr-4 text-sm whitespace-nowrap">
        <div className="flex items-center gap-2">
          <Avatar member={member} size={28} />
          <span style={{ color: member.avatar_color }}>{member.name}</span>
        </div>
      </td>
      {schedules.map(sched => (
        <td key={sched.day_of_week} className="px-2 py-1.5 text-center">
          <div className="flex flex-col items-center gap-0.5">
            <button
              onClick={() => onUpdate(sched.day_of_week, 'is_off', !sched.is_off)}
              className={`w-14 text-xs py-0.5 rounded transition-all ${sched.is_off ? 'bg-dark-500 text-gray-500' : 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/30'}`}
            >
              {sched.is_off ? t('noSchedule') : <Check size={11} className="mx-auto" />}
            </button>
            {!sched.is_off && (
              <div className="flex flex-col gap-0.5 items-center">
                <input
                  type="text"
                  value={sched.shift_start}
                  onChange={e => onUpdate(sched.day_of_week, 'shift_start', e.target.value)}
                  placeholder="09:00"
                  pattern="[0-9]{2}:[0-9]{2}"
                  maxLength={5}
                  className="text-xs bg-dark-700 border border-dark-400 rounded px-1 py-0.5 text-gray-300 w-14 text-center"
                />
                <input
                  type="text"
                  value={sched.shift_end}
                  onChange={e => onUpdate(sched.day_of_week, 'shift_end', e.target.value)}
                  placeholder="17:45"
                  pattern="[0-9]{2}:[0-9]{2}"
                  maxLength={5}
                  className="text-xs bg-dark-700 border border-dark-400 rounded px-1 py-0.5 text-gray-300 w-14 text-center"
                />
              </div>
            )}
          </div>
        </td>
      ))}
    </tr>
  )
}

export default function TeamPage() {
  const { t } = useTranslation()
  const [members, setMembers] = useState<Member[]>([])
  const [allSchedules, setAllSchedules] = useState<Record<number, Schedule[]>>({})
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<Member | null>(null)

  const loadAll = async () => {
    const ms = await getMembers()
    setMembers(ms)
    // Load schedules for each member
    const schedMap: Record<number, Schedule[]> = {}
    await Promise.all(ms.map(async m => {
      schedMap[m.id] = await getMemberSchedules(m.id)
    }))
    setAllSchedules(schedMap)
    // Load all tasks (no date filter - for workload)
    const ts = await getTasks()
    setTasks(ts)
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  const handleSaveMember = async (data: Partial<Member>) => {
    if (editingMember) {
      await updateMember(editingMember.id, data)
    } else {
      await createMember(data as any)
    }
    setModalOpen(false)
    setEditingMember(null)
    loadAll()
  }

  const handleDeleteMember = async (id: number) => {
    if (confirm(t('confirmDelete'))) {
      await deleteMember(id)
      loadAll()
    }
  }

  const handleScheduleUpdate = async (memberId: number, day: number, field: string, value: string | boolean) => {
    await updateSchedule(memberId, day, { [field]: value })
    // Optimistic update
    setAllSchedules(prev => {
      const updated = { ...prev }
      if (updated[memberId]) {
        updated[memberId] = updated[memberId].map(s =>
          s.day_of_week === day ? { ...s, [field]: value } : s
        )
      }
      return updated
    })
  }

  // Workload chart data: tasks per member this week
  const workloadData = members.map(m => {
    const count = tasks.filter(t => t.member_id === m.id).length
    const done = tasks.filter(t => t.member_id === m.id && t.status === 'done').length
    return {
      name: m.name.split(' ')[0],
      total: count,
      done,
      pending: count - done,
      color: m.avatar_color,
    }
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p>Loading team...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-5 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-white">{t('teamMembers')}</h1>
        <button
          onClick={() => { setEditingMember(null); setModalOpen(true) }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={15} />
          {t('addMember')}
        </button>
      </div>

      {/* Member Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {members.map(m => {
          const memberTasks = tasks.filter(t => t.member_id === m.id)
          const doneTasks = memberTasks.filter(t => t.status === 'done')
          return (
            <div key={m.id} className="glass-card p-4 group relative">
              <div className="flex items-start justify-between mb-3">
                <Avatar member={m} size={44} />
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => { setEditingMember(m); setModalOpen(true) }}
                    className="p-1.5 rounded hover:bg-dark-500 text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => handleDeleteMember(m.id)}
                    className="p-1.5 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="font-semibold text-sm mb-0.5" style={{ color: m.avatar_color }}>{m.name}</div>
              <div
                className="text-xs font-medium inline-flex px-2 py-0.5 rounded-full mb-2"
                style={{ backgroundColor: m.avatar_color + '25', color: m.avatar_color, border: `1px solid ${m.avatar_color}40` }}
              >
                {t(m.role)}
              </div>
              <div className="text-xs text-gray-400">
                {memberTasks.length} {t('tasks')} · {doneTasks.length} {t('done')}
              </div>
              {m.phone && <div className="text-xs text-gray-500 mt-0.5">{m.phone}</div>}
            </div>
          )
        })}

        {members.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-500 text-sm">
            No team members yet. Add one to get started!
          </div>
        )}
      </div>

      {/* Weekly Schedule */}
      <section>
        <h2 className="text-sm font-semibold text-gray-300 mb-3">{t('weeklySchedule')}</h2>
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-xs min-w-max">
            <thead>
              <tr className="border-b border-dark-500/40">
                <th className="text-left py-3 pr-4 text-gray-400 font-medium pl-4">Member</th>
                {DAY_LABELS.map((d, i) => (
                  <th key={d} className="text-center px-2 py-3 text-gray-400 font-medium">
                    {t(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <ScheduleRow
                  key={m.id}
                  member={m}
                  schedules={allSchedules[m.id] ?? []}
                  onUpdate={(day, field, value) => handleScheduleUpdate(m.id, day, field, value)}
                />
              ))}
            </tbody>
          </table>
          {members.length === 0 && (
            <div className="py-8 text-center text-gray-500 text-sm">No members yet.</div>
          )}
        </div>
      </section>

      {/* Workload Chart */}
      <section>
        <h2 className="text-sm font-semibold text-gray-300 mb-3">{t('workload')}</h2>
        <div className="glass-card p-4">
          {workloadData.length === 0 || workloadData.every(d => d.total === 0) ? (
            <div className="h-40 flex items-center justify-center text-gray-500 text-sm">No task data available.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={workloadData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1c2128', border: '1px solid #30363d', borderRadius: 8, color: '#e5e7eb' }}
                  labelStyle={{ color: '#e5e7eb' }}
                />
                <Bar dataKey="done" name="Done" radius={[4, 4, 0, 0]} stackId="a">
                  {workloadData.map((entry, index) => (
                    <Cell key={`done-${index}`} fill={entry.color} />
                  ))}
                </Bar>
                <Bar dataKey="pending" name="Pending" radius={[4, 4, 0, 0]} stackId="a">
                  {workloadData.map((entry, index) => (
                    <Cell key={`pending-${index}`} fill={`${entry.color}60`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {modalOpen && (
        <MemberModal
          member={editingMember}
          onSave={handleSaveMember}
          onClose={() => { setModalOpen(false); setEditingMember(null) }}
        />
      )}
    </div>
  )
}
