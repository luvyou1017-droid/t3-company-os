import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { removeInitialDemoData } from './shared/services/storageService.ts'
import { restoreRemoteCampaigns } from './shared/services/campaignRecoveryService.ts'

async function startApp() {
  removeInitialDemoData()
  await restoreRemoteCampaigns()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void startApp()
