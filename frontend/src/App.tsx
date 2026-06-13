import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ProtectedRoute from './routes/ProtectedRoute'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <div>Home (protected) — TODO</div>
          </ProtectedRoute>
        }
      />
      {/* fallback: route lạ → về login */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
