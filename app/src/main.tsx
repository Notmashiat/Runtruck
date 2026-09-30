import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/industry.css'
import './styles/app.css'
import './styles/shell.css'
import './styles/calendar.css'
import './styles/dashboard.css'
import { initTheme } from './lib/theme'
import { initSettings } from './lib/applySettings'
import App from './App.tsx'

initTheme()
initSettings()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
