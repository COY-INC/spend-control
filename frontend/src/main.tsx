import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { Login } from '@/views/Login'
import { token } from '@/api'

function RequireToken({ children }: { children: ReactNode }) {
  return token.get() ? <>{children}</> : <Navigate to="/login" replace />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <RequireToken>
              <App />
            </RequireToken>
          }
        />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
