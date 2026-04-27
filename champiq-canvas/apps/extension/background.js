/**
 * ChampIQ LakeB2B Connector — Background Service Worker
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

function isChampIQTab(url) {
  return CHAMPIQ_ORIGINS.some(o => url.includes(o))
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

/**
 * Get li_at from LinkedIn cookies using getAll() which finds HttpOnly/partitioned cookies
 * that get() sometimes misses.
 */
function getLiAt() {
  return new Promise((resolve) => {
    chrome.cookies.getAll({ name: 'li_at' }, (cookies) => {
      // Find the LinkedIn one — domain contains 'linkedin.com'
      const linkedinCookie = cookies.find(c =>
        c.domain.includes('linkedin.com') && c.value && c.value.length > 20
      )
      resolve(linkedinCookie?.value || '')
    })
  })
}

// Watch for B2B Pulse OAuth callback — fires when popup lands on /auth/callback#access_token=...
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url
  if (!url) return
  if (!url.includes('access_token=') && !url.includes('token=')) return

  const { token, refreshToken, pathname } = extractHashParams(url)
  if (!token || token.length < 20) return
  if (!pathname.includes('/auth/callback') && !pathname.includes('/callback') && pathname !== '/login') return

  // Close the popup immediately
  chrome.tabs.remove(tabId).catch(() => {})

  // Read li_at right now while token is fresh
  const li_at = await getLiAt()

  const message = {
    type: 'LAKEB2B_AUTH_TOKEN',
    token,
    refresh_token: refreshToken,
    li_at,
    li_at_debug: li_at ? `len=${li_at.length} prefix=${li_at.slice(0, 8)}` : 'NOT_FOUND',
  }

  chrome.tabs.query({}, (tabs) => {
    for (const t of tabs) {
      if (t.id && t.url && isChampIQTab(t.url)) {
        chrome.tabs.sendMessage(t.id, message).catch(() => {})
      }
    }
  })
})

// Handle explicit LAKEB2B_SAVE_LI_AT (from Reconnect button in credential card)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'LAKEB2B_PING_BG') {
    sendResponse({ ok: true })
    return
  }

  if (msg.type === 'LAKEB2B_SAVE_LI_AT') {
    const { credential_id, champiq_origin } = msg
    const apiBase = champiq_origin || 'https://champiq-production.up.railway.app'

    getLiAt().then(async (li_at) => {
      if (!li_at) {
        if (sender.tab?.id) {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: 'LAKEB2B_LI_AT_RESULT',
            success: false,
            error: 'li_at cookie not found — make sure you are logged into LinkedIn in this browser.',
          }).catch(() => {})
        }
        return
      }

      try {
        const res = await fetch(`${apiBase}/api/auth/lakeb2b/linkedin-cookie`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential_id, li_at }),
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
