/**
 * Side-effect-only module that installs the Capacitor → ElectronAPI shim
 * synchronously on import.
 *
 * Why this exists as a separate file (not just inlined in main.tsx):
 * ES modules evaluate their imports DEPTH-FIRST before any top-level
 * statements in the importing module run. So if main.tsx looks like:
 *
 *     import App from './App'   // evaluates the whole component tree
 *     if (isCapacitor()) { ...install shim... }   // runs AFTER imports
 *
 * …then any module under `./App` that reads `window.electronAPI` at module
 * scope (library-tabs.tsx, song-library.tsx, title-bar.tsx all do) sees it
 * as `undefined` and gates Electron-only features off — including the
 * Browse ParaDB tab on Android.
 *
 * The fix: put the shim install in its own module and `import` it FIRST
 * in main.tsx, before App. The import statement evaluates this file's top
 * level, which installs the shim, then App's modules load and see the
 * shim already present.
 */

import { isCapacitor, makeCapacitorAPI } from './capacitor-bridge'

if (isCapacitor() && !window.electronAPI) {
  window.electronAPI = makeCapacitorAPI()
}
