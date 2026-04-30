import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Handle B2B Pulse OAuth callback.
// After LinkedIn login, B2B Pulse redirects the popup to:
//   <FRONTEND_URL>/auth/callback#access_token=<jwt>&refresh_token=<refresh>
// If this page is a popup (window.opener exists), postMessage the tokens back
// to the parent ChampIQ tab and close.
;(function handleB2BOAuthCallback() {
  if (window.location.pathname !== '/auth/callback') return
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash
  const params = new URLSearchParams(hash)
  const token = params.get('access_token') || params.get('token')
  if (!token) return

  const refreshToken = params.get('refresh_token') || ''

  if (window.opener) {
    // Opened as a popup — postMessage to the parent tab
    window.opener.postMessage(
      { type: 'LAKEB2B_AUTH_TOKEN', token, refresh_token: refreshToken },
      '*'
    )
    window.close()
  } else {
    // Opened as a redirect (not a popup) — store in sessionStorage so the
    // parent can pick it up via BroadcastChannel
    const bc = new BroadcastChannel('lakeb2b_oauth')
    bc.postMessage({ type: 'LAKEB2B_AUTH_TOKEN', token, refresh_token: refreshToken })
    bc.close()
    // Show a simple "Connected" message while we close
    document.getElementById('root')!.innerHTML =
      '<p style="font-family:sans-serif;text-align:center;margin-top:40px;color:#6366f1">Connected! You can close this tab.</p>'
  }
})()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
