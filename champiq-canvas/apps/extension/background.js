/**
 * ChampIQ LakeB2B Connector — Background Service Worker
 *
 * When B2B Pulse OAuth popup lands on /auth/callback#access_token=..., we:
 *   1. Extract the token from the hash
 *   2. Immediately read li_at from linkedin.com cookies (while token is still fresh)
 *   3. Close the popup
 *   4. Send LAKEB2B_AUTH_TOKEN (with li_at included) to the ChampIQ tab
 *
 * The frontend then calls /api/auth/lakeb2b/callback with token + li_at together
 * so the backend can save the credential AND call session-cookies in one go,
 * while the token is guaranteed fresh.
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

// Watch for B2B Pulse OAuth callback redirect
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url
  if (!url) return
  if (!url.includes('access_token=') && !url.includes('token=')) return

  const { token, refreshToken, pathname } = extractHashParams(url)
  if (!token || token.length < 20) return
  if (!pathname.includes('/auth/callback') && !pathname.includes('/callback') && pathname !== '/login') return

  // Close the popup immediately
  chrome.tabs.remove(tabId).catch(() => {})

  // Read li_at from LinkedIn cookies (try www and root domain)
  function getLiAt(callback) {
    chrome.cookies.get({ url: 'https://www.linkedin.com', name: 'li_at' }, (c) => {
      if (c?.value) { callback(c.value); return }
      chrome.cookies.get({ url: 'https://linkedin.com', name: 'li_at' }, (c2) => {
        callback(c2?.value || '')
      })
    })
  }

  getLiAt((li_at) => {
    const message = {
      type: 'LAKEB2B_AUTH_TOKEN',
      token,
      refresh_token: refreshToken,
      li_at,
      li_at_debug: li_at ? `len=${li_at.length} start=${li_at.slice(0,8)}` : 'NOT_FOUND',
    }
    chrome.tabs.query({}, (tabs) => {
      for (const t of tabs) {
        if (t.id && t.url && isChampIQTab(t.url)) {
          chrome.tabs.sendMessage(t.id, message).catch(() => {})
        }
      }
    })
  })
})

// Handle explicit LAKEB2B_SAVE_LI_AT requests (from Reconnect LinkedIn button)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'LAKEB2B_PING_BG') {
    sendResponse({ ok: true })
    return
  }

  if (msg.type === 'LAKEB2B_SAVE_LI_AT') {
    const { credential_id, champiq_origin } = msg
    const apiBase = champiq_origin || 'https://champiq-production.up.railway.app'

    function getLiAtForSave(callback) {
      chrome.cookies.get({ url: 'https://www.linkedin.com', name: 'li_at' }, (c) => {
        if (c?.value) { callback(c.value); return }
        chrome.cookies.get({ url: 'https://linkedin.com', name: 'li_at' }, (c2) => {
          callback(c2?.value || '')
        })
      })
    }

    getLiAtForSave(async (li_at) => {
      if (!li_at) {
        if (sender.tab?.id) {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: 'LAKEB2B_LI_AT_RESULT',
            success: false,
            error: 'LinkedIn li_at cookie not found. Open linkedin.com and make sure you are logged in.',
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
