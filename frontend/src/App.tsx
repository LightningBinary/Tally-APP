import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import TaskPage from './pages/TaskPage'
import TeamPage from './pages/TeamPage'
import AbnormalPage from './pages/AbnormalPage'
import SearchPage from './pages/SearchPage'
import ChatPage from './pages/ChatPage'
import SettingPage from './pages/SettingPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/task" replace />} />
          <Route path="task" element={<TaskPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="abnormal" element={<AbnormalPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="ai-chat" element={<ChatPage />} />
          <Route path="setting" element={<SettingPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
