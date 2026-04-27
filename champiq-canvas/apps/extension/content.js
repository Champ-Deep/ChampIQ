/**
 * ChampIQ LakeB2B Connector — Content Script
 * Bridges window.postMessage (page) ↔ chrome.runtime (background).
 * All API calls happen in the PAGE context — not here, not in background.
 */

// Page → background
window.addEventListener('message', (ev) => {
  if (!ev.data) return
  if (ev.data.type === 'LAKEB2B_PING') {
    window.postMessage({ type: 'LAKEB2B_PONG' }, '*')
  }
  if (ev.data.type === 'LAKEB2B_GET_LI_AT') {
    // Page wants li_at — ask background to read cookies
    chrome.runtime.sendMessage({ type: 'LAKEB2B_GET_LI_AT' })
  }
})

// Background → page
chrome.runtime.onMessage.addListener((msg) => {
  if (
    msg.type === 'LAKEB2B_AUTH_TOKEN' ||
    msg.type === 'LAKEB2B_LI_AT_VALUE'
  ) {
    window.postMessage(msg, '*')
  }
})
