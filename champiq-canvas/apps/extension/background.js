/**
 * ChampIQ LakeB2B Connector — Background Service Worker
 *
 * Flow:
 *   1. B2B Pulse OAuth popup lands on /auth/callback#access_token=<jwt>
 *   2. We capture token, close popup, send LAKEB2B_AUTH_TOKEN to ChampIQ tab
 *   3. ChampIQ saves the credential (gets credential_id back via postMessage)
 *   4. ChampIQ tab tells us the credential_id via LAKEB2B_SAVE_LI_AT
 *   5. We read li_at from linkedin.com cookies and POST it to ChampIQ backend
 *      → no manual copy-paste needed
 */

const CHAMPIQ_ORIGINS = [
  'champiq-production.up.railway.app',
  'localhost:3001',
  'localhost:5173',
  'localhost:5174',
  'localhost:5175',
  'localhost:5176',
  'localhost:4173',
  'localhost:8000',
]

const CHAMPIQ_API = 'https://champiq-production.up.railway.app'

function isChampIQTab(url) {
  return CHAMPIQ_ORIGINS.some(o => url.includes(o))
}

function getChampIQOrigin(url) {
  for (const o of CHAMPIQ_ORIGINS) {
    if (url.includes(o)) {
      return url.startsWith('https') ? `https://${o}` : `http://${o}`
    }
  }
  return CHAMPIQ_API
}

function extractHashParams(url) {
  try {
    const parsed = new URL(url)
    const hash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash
    const params = new URLSearchParams(hash)
    return {
      token: params.get('access_token') || params.get('token') || '',
      refreshToken: params.get('refresh_token') || '',
      pathname: parsed.pathname,
    }
  } catch {
    return { token: '', refreshToken: '', pathname: '' }
  }
}

// Step 1 & 2: Watch for OAuth callback, capture token, close popup
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url
  if (!url) return
  if (!url.includes('access_token=') && !url.includes('token=')) return

  const { token, refreshToken, pathname } = extractHashParams(url)
  if (!token || token.length < 20) return
  if (!pathname.includes('/auth/callback') && !pathname.includes('/callback') && pathname !== '/login') return

  chrome.tabs.remove(tabId).catch(() => {})

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

// Step 4 & 5: ChampIQ tab sends credential_id after saving — we fetch li_at and POST it
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'LAKEB2B_PING_BG') {
    sendResponse({ ok: true })
    return
  }

  if (msg.type === 'LAKEB2B_SAVE_LI_AT') {
    const { credential_id, champiq_origin } = msg
    const apiBase = champiq_origin || CHAMPIQ_API

    // Read li_at cookie from linkedin.com
    chrome.cookies.get({ url: 'https://www.linkedin.com', name: 'li_at' }, async (cookie) => {
      if (!cookie || !cookie.value) {
        // li_at not found — notify the tab
        if (sender.tab?.id) {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: 'LAKEB2B_LI_AT_RESULT',
            success: false,
            error: 'LinkedIn li_at cookie not found. Please open linkedin.com and log in first.',
          }).catch(() => {})
        }
        return
      }

      // POST li_at to ChampIQ backend
      try {
        const res = await fetch(`${apiBase}/api/auth/lakeb2b/linkedin-cookie`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential_id, li_at: cookie.value }),
        })
        const data = await res.json().catch(() => ({}))
        if (sender.tab?.id) {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: 'LAKEB2B_LI_AT_RESULT',
            success: res.ok,
            error: res.ok ? null : (data.detail || `Server error ${res.status}`),
          }).catch(() => {})
        }
      } catch (e) {
        if (sender.tab?.id) {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: 'LAKEB2B_LI_AT_RESULT',
            success: false,
            error: e.message,
          }).catch(() => {})
        }
      }
    })
  }
})
