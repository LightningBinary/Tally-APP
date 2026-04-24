import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ClipboardList, Users, AlertTriangle,
  Search, MessageSquare, Settings, PanelLeftClose, PanelLeftOpen
} from 'lucide-react'

const navItems = [
  { path: '/task', icon: ClipboardList, key: 'task', enabled: true },
  { path: '/team', icon: Users, key: 'team', enabled: true },
  { path: '/abnormal', icon: AlertTriangle, key: 'abnormal', enabled: true },
  { path: '/search', icon: Search, key: 'search', enabled: true },
  { path: '/ai-chat', icon: MessageSquare, key: 'aiChat', enabled: true },
  { path: '/setting', icon: Settings, key: 'setting', enabled: true },
]

interface SidebarProps {
  open: boolean
  onToggle: () => void
}

export default function Sidebar({ open, onToggle }: SidebarProps) {
  const { t } = useTranslation()

  return (
    <>
      {/* Sidebar */}
      <aside
        className={`bg-dark-800 border-r border-dark-500/50 flex flex-col shrink-0 h-screen sticky top-0 transition-all duration-300 ease-in-out ${
          open ? 'w-48' : 'w-0 overflow-hidden'
        }`}
      >
        {/* Header */}
        <div className="px-4 py-5 border-b border-dark-500/40">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-0.5">
                {t('warehouse')}
              </div>
              <div className="text-base font-semibold text-white">{t('tallyTeam')}</div>
            </div>
            {/* Toggle button — only visible when sidebar is open */}
            {open && (
              <button
                onClick={onToggle}
                title={t('hideSidebar')}
                className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-dark-600 transition-all duration-200 shrink-0"
              >
                <PanelLeftClose size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2">
          {navItems.map(({ path, icon: Icon, key, enabled }) => (
            enabled ? (
              <NavLink
                key={key}
                to={path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm font-medium transition-all duration-150 ` +
                  (isActive
                    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/20'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-dark-600/60')
                }
              >
                <Icon size={16} />
                <span>{t(key)}</span>
              </NavLink>
            ) : (
              <div
                key={key}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm font-medium text-gray-600 cursor-not-allowed opacity-50"
                title="Coming soon"
              >
                <Icon size={16} />
                <span>{t(key)}</span>
              </div>
            )
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-dark-500/40">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-xs text-emerald-400 font-medium">{t('live')}</span>
          </div>
        </div>
      </aside>

      {/* Floating open button — only visible when sidebar is collapsed */}
      {!open && (
        <button
          onClick={onToggle}
          title={t('showSidebar')}
          className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-dark-700 border border-dark-500 text-gray-400 hover:text-white hover:bg-dark-600 transition-all duration-200"
        >
          <PanelLeftOpen size={16} />
        </button>
      )}
    </>
  )
}
