import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  message: string
  history: ChatMessage[]
}

export interface ChatResponse {
  reply: string
  intent: string
  query?: string
}

export const sendChatMessage = (payload: ChatRequest) =>
  api.post<ChatResponse>('/chat/message', payload).then(r => r.data)
