/**
 * ChampIQ LakeB2B Connector — Content Script
 *
 * Runs on ChampIQ pages. Bridges window.postMessage ↔ chrome.runtime messaging.
 */

// 1. Respond to LAKEB2B_PING from React so the app can detect the extension is installed
window.addEventListener('message', (ev) => {
  if (!ev.data) return
  if (ev.data.type === 'LAKEB2B_PING') {
    window.postMessage({ type: 'LAKEB2B_PONG' }, '*')
  }
})

// 2. When background captures an OAuth token, forward it to the React page
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'LAKEB2B_AUTH_TOKEN') {
    window.postMessage(msg, '*')
  }
})
