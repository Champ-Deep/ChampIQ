/**
 * ChampIQ LakeB2B Connector — Background Service Worker
 *
 * B2B Pulse redirects the OAuth popup to:
 *   http://localhost:5173/login?token=<jwt>&refresh_token=<refresh>
 *
 * This worker watches ALL tab navigations. When it sees a tab loading a URL
 * with ?token= that came from the B2B Pulse auth flow, it:
 *   1. Extracts the tokens
 *   2. Closes the popup tab
 *   3. Broadcasts LAKEB2B_AUTH_TOKEN to all ChampIQ tabs via content script
 */

const CHAMPIQ_ORIGINS = [
  'champiq-production.up.railway.app',
  'localhost:3001',
  'localhost:5173',
  'localhost:5174',
  'localhost:4173',
  'localhost:8000',
]

function isChampIQTab(url) {
  try {
    const { hostname, port } = new URL(url)
    const hostport = port ? `${hostname}:${port}` : hostname
    return CHAMPIQ_ORIGINS.some(o => url.includes(o))
  } catch {
    return false
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'loading') return
  const url = changeInfo.url || tab.url
  if (!url) return

  // We're looking for the B2B Pulse → frontend redirect which contains the token.
  // B2B Pulse redirects to their configured frontend URL with ?token=...
  // This can be localhost:5173/login?token=... or any other URL.
  if (!url.includes('token=') && !url.includes('access_token=')) return

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return
  }

  const token = parsed.searchParams.get('token') || parsed.searchParams.get('access_token')
  const refreshToken = parsed.searchParams.get('refresh_token') || ''

  // Only fire if this looks like a B2B Pulse auth redirect
  // (has token param, is NOT a ChampIQ tab itself, came from /login path or similar)
  if (!token) return

  // Avoid intercepting ChampIQ's own token handling
  // B2B Pulse redirects to localhost:5173/login which IS our app — but only in popup context.
  // We intercept ALL ?token= navigations in non-ChampIQ-looking URLs,
  // OR navigations to /login?token= on any origin.
  const isLoginCallback = parsed.pathname === '/login' || parsed.pathname.includes('/callback')
  const isAuthRedirect = isLoginCallback && token.length > 20

  if (!isAuthRedirect) return

  // This tab is the OAuth popup. Close it and broadcast the token.
  chrome.tabs.remove(tabId).catch(() => {})

  // Broadcast to all ChampIQ tabs
  chrome.tabs.query({}, (tabs) => {
    for (const t of tabs) {
      if (t.id && t.url && isChampIQTab(t.url)) {
        chrome.tabs.sendMessage(t.id, {
          type: 'LAKEB2B_AUTH_TOKEN',
          token,
          refresh_token: refreshToken,
        }).catch(() => {})
      }
    }
  })
})

// Respond to ping from content script to confirm extension is alive
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'LAKEB2B_PING_BG') {
    sendResponse({ ok: true })
  }
})
