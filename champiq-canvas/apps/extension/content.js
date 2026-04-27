/**
 * ChampIQ LakeB2B Connector — Content Script
 * Bridges window.postMessage (page) ↔ chrome.runtime (background).
 */

window.addEventListener('message', (ev) => {
  if (!ev.data) return

  if (ev.data.type === 'LAKEB2B_PING') {
    window.postMessage({ type: 'LAKEB2B_PONG' }, '*')
  }

  // Forward pairing request to background — background POSTs to B2B Pulse directly
  if (ev.data.type === 'LAKEB2B_PAIR') {
    chrome.runtime.sendMessage({
      type: 'LAKEB2B_PAIR',
      pairing_token: ev.data.pairing_token,
      api_base: ev.data.api_base,
    })
  }

  // Forward simple li_at read request
  if (ev.data.type === 'LAKEB2B_GET_LI_AT') {
    chrome.runtime.sendMessage({ type: 'LAKEB2B_GET_LI_AT' })
  }
})

// Background → page
chrome.runtime.onMessage.addListener((msg) => {
  if (
    msg.type === 'LAKEB2B_AUTH_TOKEN' ||
    msg.type === 'LAKEB2B_LI_AT_VALUE' ||
    msg.type === 'LAKEB2B_PAIR_RESULT'
  ) {
    window.postMessage(msg, '*')
  }
})
