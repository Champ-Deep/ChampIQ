/**
 * ChampIQ LakeB2B Connector — Background Service Worker
 *
 * The background worker reads li_at from cookies and sends it to the ChampIQ
 * page via content script. The PAGE (not the background) calls the API —
 * this avoids service worker fetch restrictions / CORS issues.
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

// Step 1: OAuth popup lands on /auth/callback#access_token=...
// Read li_at immediately and send BOTH to the ChampIQ tab
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url
  if (!url) return
  if (!url.includes('access_token=') && !url.includes('token=')) return

  const { token, refreshToken, pathname } = extractHashParams(url)
  if (!token || token.length < 20) return
  if (!pathname.includes('/auth/callback') && !pathname.includes('/callback') && pathname !== '/login') return

  chrome.tabs.remove(tabId).catch(() => {})

  const li_at = await getLiAt()

  // Send to ChampIQ tab — page handles the API call (no fetch from service worker)
  broadcastToChampIQ({
    type: 'LAKEB2B_AUTH_TOKEN',
    token,
    refresh_token: refreshToken,
    li_at,
  })
})

// Step 2: When Reconnect button is clicked, page asks background for li_at
// Background reads it and sends it back — page makes the API call
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'LAKEB2B_PING_BG') {
    sendResponse({ ok: true })
    return
  }

  if (msg.type === 'LAKEB2B_GET_LI_AT') {
    // Page asked for li_at — read it and send back via content script
    getLiAt().then((li_at) => {
      if (sender.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'LAKEB2B_LI_AT_VALUE',
          li_at,
          found: !!li_at,
        }).catch(() => {})
      }
    })
  }
})
