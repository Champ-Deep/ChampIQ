import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Intercept B2B Pulse OAuth callback: if this page was opened as a popup
// and has ?token= in the URL (from B2B Pulse redirecting to localhost:5173/login?token=...),
// relay the token to the opener so the parent window can complete the credential setup.
;(function handleLakeB2BPopupCallback() {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token') || params.get('access_token')
  if (!token || !window.opener) return

  const refresh = params.get('refresh_token') || ''
  window.opener.postMessage({ type: 'LAKEB2B_TOKEN_RELAY', token, refresh_token: refresh }, '*')
  window.close()
})()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
