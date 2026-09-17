import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="page-loading" role="status">화면을 불러오는 중입니다…</div>}><App /></Suspense>
  </StrictMode>,
)
