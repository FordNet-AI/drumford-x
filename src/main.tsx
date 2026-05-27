import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { isCapacitor, makeCapacitorAPI } from './lib/capacitor-bridge'

// Prevent browser from navigating when files/folders are dropped anywhere on the page.
// Without this, dropping a folder causes the browser to try to open/display it,
// unloading the app before React's onDrop handler can fire.
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())

// Install the Capacitor bridge BEFORE React mounts. Components throughout the
// app check `window.electronAPI?.x()`; by installing the shim under that same
// name, every existing call works on Android without any other code changes.
// In Electron mode, preload.ts has already populated `window.electronAPI` so
// we leave it alone. In plain-browser mode, `electronAPI` stays undefined and
// Electron-gated features (Browse ParaDB tab) hide themselves naturally.
if (isCapacitor() && !window.electronAPI) {
  window.electronAPI = makeCapacitorAPI()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
