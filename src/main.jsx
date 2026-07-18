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
