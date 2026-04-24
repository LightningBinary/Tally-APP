import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, Info, ChevronRight } from 'lucide-react'

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Español', flag: '🇲🇽' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
]

export default function SettingPage() {
  const { t, i18n } = useTranslation()
  const [currentLang, setCurrentLang] = useState(i18n.language)

  const handleLangChange = (code: string) => {
    i18n.changeLanguage(code)
    localStorage.setItem('lang', code)
    setCurrentLang(code)
  }

  return (
    <div className="p-5 max-w-2xl space-y-6">
      <h1 className="text-lg font-semibold text-white">{t('settingTitle')}</h1>

      {/* About section */}
      <section className="glass-card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center">
            <Info size={18} className="text-indigo-400" />
          </div>
          <div>
            <h2 className="font-semibold text-white text-sm">{t('aboutTitle')}</h2>
          </div>
        </div>

        {/* App icon / brand */}
        <div className="flex items-center gap-4 mb-4 p-4 rounded-xl bg-dark-700/50 border border-dark-500/30">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}>
            T
          </div>
          <div>
            <div className="font-bold text-white">Tally Team Manager</div>
            <div className="text-xs text-gray-400">{t('warehouse')} · {t('version')}</div>
          </div>
        </div>

        <p className="text-sm text-gray-300 leading-relaxed">{t('aboutDesc')}</p>

        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          {[
            { labelKey: 'taskBoard', icon: '📋' },
            { labelKey: 'teamManagement', icon: '👥' },
            { labelKey: 'multiLanguage', icon: '🌐' },
          ].map(item => (
            <div key={item.labelKey} className="p-3 rounded-xl bg-dark-700/50 border border-dark-500/30">
              <div className="text-xl mb-1">{item.icon}</div>
              <div className="text-xs text-gray-400">{t(item.labelKey)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Language section */}
      <section className="glass-card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/20 flex items-center justify-center">
            <Globe size={18} className="text-emerald-400" />
          </div>
          <div>
            <h2 className="font-semibold text-white text-sm">{t('language')}</h2>
            <p className="text-xs text-gray-400">{t('selectLanguage')}</p>
          </div>
        </div>

        <div className="space-y-2">
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => handleLangChange(lang.code)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 ${
                currentLang === lang.code
                  ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-300'
                  : 'bg-dark-700/50 border border-dark-500/30 text-gray-300 hover:border-dark-300 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{lang.flag}</span>
                <span className="text-sm font-medium">{lang.label}</span>
              </div>
              <div className="flex items-center gap-2">
                {currentLang === lang.code && (
                  <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                )}
                <ChevronRight size={14} className="text-gray-500" />
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Future sections placeholder */}
      <section className="glass-card p-5 border-dashed opacity-50">
        <div className="text-center py-4">
          <div className="text-2xl mb-2">🚧</div>
          <div className="text-sm text-gray-400">{t('moreSettings')}</div>
          <div className="text-xs text-gray-600 mt-1">Notifications · Backup · Access Control</div>
        </div>
      </section>
    </div>
  )
}
