import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { applyAppearance, getNovaTheme, getCalm } from './theme.js'

// Stamp the persisted theme on <html> before first paint so a non-default
// theme never flashes the Command tokens for a frame.
applyAppearance(getNovaTheme(), getCalm())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Native-feeling auto-update. registerType:'autoUpdate' installs a new service
// worker when a deploy lands, but the already-open app keeps serving the cached
// old assets until it reloads — on iOS that meant waiting for a full cold
// relaunch, so new features "didn't show up". Fix: (1) reload once when a new
// worker takes control (guarded so a first install never reloads, and never
// loops), and (2) nudge the worker to check for an update every time Nova comes
// to the foreground. So just opening the app pulls the latest — no manual
// close/reopen. An in-progress workout is already mirrored to storage, so a
// refresh mid-session is safe.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return
    reloading = true
    window.location.reload()
  })
  let lastCheck = 0
  const checkForUpdate = () => {
    if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 20000) return
    lastCheck = Date.now()
    navigator.serviceWorker.getRegistration().then((reg) => reg && reg.update()).catch(() => {})
  }
  document.addEventListener('visibilitychange', checkForUpdate)
  window.addEventListener('focus', checkForUpdate)
}
