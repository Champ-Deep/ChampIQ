/**
 * ChampIQ LakeB2B Connector — Background Service Worker
 *
 * Two flows supported:
 *
 * Flow A — OAuth token capture (fires automatically):
 *   B2B Pulse OAuth popup lands on /auth/callback#access_token=...
 *   → background reads li_at from LinkedIn cookies
 *   → sends LAKEB2B_AUTH_TOKEN (with li_at) to ChampIQ tab
 *   → ChampIQ page calls its own backend to save credential
 *
 * Flow B — Pairing token flow (extension/pair):
 *   ChampIQ page calls /api/auth/lakeb2b/pair → gets {pairing_token, api_base}
 *   → sends LAKEB2B_PAIR message to background with pairing_token + api_base
 *   → background reads li_at from LinkedIn cookies
 *   → POSTs directly to B2B Pulse's /api/integrations/extension/session-cookies
 *     with X-Pairing-Token header (B2B Pulse validates and stores internally)
 *   → sends LAKEB2B_PAIR_RESULT back to ChampIQ page
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

function getLiAt() {
  return new Promise((resolve) => {
    chrome.cookies.getAll({ name: 'li_at' }, (cookies) => {
      const c = cookies.find(c => c.domain.includes('linkedin.com') && c.value && c.value.length > 20)
      resolve(c?.value || '')
    })
  })
}

function broadcastToChampIQ(message) {
  chrome.tabs.query({}, (tabs) => {
    for (const t of tabs) {
      if (t.id && t.url && isChampIQTab(t.url)) {
        chrome.tabs.sendMessage(t.id, message).catch(() => {})
      }
    }
  })
}

// ── Flow A: OAuth popup callback ──────────────────────────────────────────────
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url
  if (!url) return
  if (!url.includes('access_token=') && !url.includes('token=')) return

  const { token, refreshToken, pathname } = extractHashParams(url)
  if (!token || token.length < 20) return
  if (!pathname.includes('/auth/callback') && !pathname.includes('/callback') && pathname !== '/login') return

  chrome.tabs.remove(tabId).catch(() => {})

  const li_at = await getLiAt()

  broadcastToChampIQ({
    type: 'LAKEB2B_AUTH_TOKEN',
    token,
    refresh_token: refreshToken,
    li_at,
  })
})

// ── Flow B: Pairing token + extension/session-cookies ────────────────────────
// Also handles LAKEB2B_GET_LI_AT (simple cookie read for reconnect button)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'LAKEB2B_PING_BG') {
    sendResponse({ ok: true })
    return
  }

  if (msg.type === 'LAKEB2B_GET_LI_AT') {
    getLiAt().then((li_at) => {
      if (sender.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'LAKEB2B_LI_AT_VALUE',
          li_at,
          found: !!li_at,
        }).catch(() => {})
      }
    })
    return
  }

  if (msg.type === 'LAKEB2B_PAIR') {
    const { pairing_token, api_base } = msg
    // Read li_at then POST directly to B2B Pulse with pairing token
    getLiAt().then(async (li_at) => {
      if (!li_at) {
        if (sender.tab?.id) {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: 'LAKEB2B_PAIR_RESULT',
            success: false,
            error: 'LinkedIn li_at cookie not found — make sure you are logged into LinkedIn.',
          }).catch(() => {})
        }
        return
      }

      try {
        const res = await fetch(`${api_base}/api/integrations/extension/session-cookies`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Pairing-Token': pairing_token,
          },
          body: JSON.stringify({ li_at }),
        })
        const data = await res.json().catch(() => ({}))
        if (sender.tab?.id) {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: 'LAKEB2B_PAIR_RESULT',
            success: res.ok,
            user_name: data.user_name || null,
            extension_token: data.extension_token || null,
            error: res.ok ? null : (data.detail || `Error ${res.status}`),
          }).catch(() => {})
        }
      } catch (e) {
        if (sender.tab?.id) {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: 'LAKEB2B_PAIR_RESULT',
            success: false,
            error: e.message,
          }).catch(() => {})
        }
      }
    })
  }
})
