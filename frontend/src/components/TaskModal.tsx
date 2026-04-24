import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import type { Task, Member } from '../types'
import { TASK_TYPES } from '../types'

interface Props {
  task: Task | null
  members: Member[]
  date: string
  onSave: (data: Partial<Task>) => void
  onClose: () => void
}

export default function TaskModal({ task, members, date, onSave, onClose }: Props) {
  const { t } = useTranslation()
  const [form, setForm] = useState({
    task_type: 'Counting' as Task['task_type'],
    status: 'todo' as Task['status'],
    member_id: null as number | null,
    units: 0,
    detail: '',
    date: date,
    start_time: null as string | null,
    end_time: null as string | null,
  })

  useEffect(() => {
    if (task) {
      setForm({
        task_type: task.task_type,
        status: task.status,
        member_id: task.member_id,
        units: task.units,
        detail: task.detail,
        date: task.date || date,
        start_time: task.start_time,
        end_time: task.end_time,
      })
    }
  }, [task, date])

  const set = (key: string, val: unknown) => setForm(f => ({ ...f, [key]: val }))

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-card w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-500/40">
          <h2 className="font-semibold text-white">
            {task ? t('edit') : t('createTask')}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-dark-500 text-gray-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('taskType')} *</label>
            <select
              className="input-field"
              value={form.task_type}
              onChange={e => set('task_type', e.target.value)}
            >
              {TASK_TYPES.map(ty => (
                <option key={ty} value={ty}>{t(ty)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('assignTo')}</label>
            <select
              className="input-field"
              value={form.member_id ?? ''}
              onChange={e => set('member_id', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{t('unassigned')}</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('units')}</label>
            <input
              type="number"
              className="input-field"
              value={form.units}
              onChange={e => set('units', Number(e.target.value))}
              min={0}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('detail')}</label>
            <textarea
              className="input-field resize-none"
              rows={2}
              value={form.detail}
              onChange={e => set('detail', e.target.value)}
              placeholder="Optional..."
            />
          </div>

          {task && (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Status</label>
              <select className="input-field" value={form.status} onChange={e => set('status', e.target.value as Task['status'])}>
                <option value="todo">{t('todo')}</option>
                <option value="in_progress">{t('inProgress')}</option>
                <option value="done">{t('done')}</option>
              </select>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-dark-500/40">
          <button onClick={onClose} className="btn-secondary">{t('cancel')}</button>
          <button
            onClick={() => onSave({ ...form, title: form.task_type } as any)}
            className="btn-primary"
          >
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  )
}
