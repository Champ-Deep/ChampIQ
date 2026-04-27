/**
 * ChampIQ LakeB2B Connector — Content Script
 * Bridges window.postMessage ↔ chrome.runtime messaging.
 */

// LAKEB2B_PING → LAKEB2B_PONG (extension detection)
// LAKEB2B_SAVE_LI_AT → forward to background (background reads cookie and POSTs to API)
window.addEventListener('message', (ev) => {
  if (!ev.data) return
  if (ev.data.type === 'LAKEB2B_PING') {
    window.postMessage({ type: 'LAKEB2B_PONG' }, '*')
  }
  if (ev.data.type === 'LAKEB2B_SAVE_LI_AT') {
    chrome.runtime.sendMessage({
      type: 'LAKEB2B_SAVE_LI_AT',
      credential_id: ev.data.credential_id,
      champiq_origin: window.location.origin,
    })
  }
})

// Forward messages from background → page
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'LAKEB2B_AUTH_TOKEN' || msg.type === 'LAKEB2B_LI_AT_RESULT') {
    window.postMessage(msg, '*')
  }
})
