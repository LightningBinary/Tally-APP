import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageSquare, SendHorizonal, Trash2, Bot, User } from 'lucide-react'

import { sendChatMessage, type ChatMessage } from '../api/chat'

const MAX_HISTORY = 8   // messages kept in context window

export default function ChatPage() {
  const { t } = useTranslation()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleClear = () => {
    setMessages([])
    inputRef.current?.focus()
  }

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    // Append user message immediately
    const userMsg: ChatMessage = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    // Build history for API (last MAX_HISTORY messages)
    const history = messages.slice(-MAX_HISTORY)

    try {
      const res = await sendChatMessage({ message: text, history })
      const aiMsg: ChatMessage = { role: 'assistant', content: res.reply }
      setMessages(prev => [...prev, aiMsg])
    } catch {
      const errMsg: ChatMessage = {
        role: 'assistant',
        content: t('aiError'),
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [input, loading, messages])

  // Submit on Enter (Shift+Enter for newline)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="h-full flex flex-col">

      {/* Header */}
      <div className="px-6 pt-6 pb-4 shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <MessageSquare size={18} className="text-indigo-400" />
            {t('aiAssistant')}
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {t('askQuestionDesc')}
          </p>
        </div>
        <button
          onClick={handleClear}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-dark-600 transition-colors border border-dark-500"
        >
          <Trash2 size={12} />
          {t('clearChat')}
        </button>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-4">

        {/* Welcome (shown only when empty) */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center mb-4">
              <Bot size={28} className="text-indigo-400" />
            </div>
            <h2 className="text-base font-semibold text-white mb-2">{t('askQuestion')}</h2>
            <p className="text-sm text-gray-400 max-w-sm leading-relaxed">
              {t('askQuestionDesc')}
            </p>
            <div className="mt-4 flex flex-col gap-2 text-left w-full max-w-sm">
              {[
                t('askAboutTasks'),
                t('askWhoIsWorking'),
                t('askShowTeam'),
                t('askAbnormalCount'),
                t('askTasksByStatus'),
              ].map((q, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(q); inputRef.current?.focus() }}
                  className="text-left text-xs px-3 py-2 rounded-lg bg-dark-700/60 border border-dark-500 text-gray-300 hover:text-white hover:border-indigo-500/30 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            <div className={`
              w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5
              ${msg.role === 'user'
                ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/20'
                : 'bg-dark-600 text-gray-400 border border-dark-500'
              }
            `}>
              {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
            </div>

            {/* Bubble */}
            <div className={`
              max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed
              ${msg.role === 'user'
                ? 'bg-indigo-600/20 text-white rounded-tr-sm'
                : 'bg-dark-700/80 text-gray-200 rounded-tl-sm border border-dark-600'
              }
            `}>
              {msg.role === 'assistant' ? (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-dark-600 text-gray-400 border border-dark-500 flex items-center justify-center shrink-0 mt-0.5">
              <Bot size={14} />
            </div>
            <div className="bg-dark-700/80 border border-dark-600 px-4 py-3 rounded-2xl rounded-tl-sm">
              <div className="flex items-center gap-1.5 text-gray-400 text-sm">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '160ms' }} />
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '320ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 px-6 pb-6">
        <div className="flex items-end gap-3 bg-dark-700/80 border border-dark-500 rounded-2xl px-4 py-3 focus-within:border-indigo-500/50 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('askQuestionDesc')}
            rows={1}
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 resize-none outline-none leading-relaxed max-h-32 overflow-y-auto"
            style={{ minHeight: '1.5rem' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className={`
              p-2 rounded-xl transition-all shrink-0
              ${input.trim() && !loading
                ? 'bg-indigo-600 text-white hover:bg-indigo-500 cursor-pointer'
                : 'bg-dark-600 text-gray-500 cursor-not-allowed'
              }
            `}
          >
            <SendHorizonal size={16} />
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-1.5 text-center">
          {t('aiPoweredBy')}
        </p>
      </div>
    </div>
  )
}
