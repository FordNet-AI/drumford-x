/**
 * DrumFord Studio — Electron main process (dev window).
 *
 * Wraps the Studio renderer in a native desktop window instead of a browser
 * tab. Launched by start-studio.bat: it starts the Vite dev server (port 5273)
 * then runs `electron studio/electron-main.cjs`, which loads that URL here.
 *
 * Studio is browser-tech inside (File API, fflate, idb-keyval, Web Audio) and
 * needs no IPC/preload — so this is just a window. Packaging into a distributable
 * installer (electron-builder) is a separate, later step.
 */
const { app, BrowserWindow, shell } = require('electron')

// Allow overriding the URL (e.g. a different port); default to the dev server.
const STUDIO_URL = process.env.STUDIO_URL || 'http://localhost:5273'

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#050508',
    title: 'DrumFord Studio',
    autoHideMenuBar: true, // hide the default Electron File/Edit/View menu
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.loadURL(STUDIO_URL)

  // Open any external links (e.g. paradb.net later) in the system browser,
  // never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url)
      if (u.protocol === 'http:' || u.protocol === 'https:') shell.openExternal(url)
    } catch {
      /* ignore malformed URLs */
    }
    return { action: 'deny' }
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => app.quit())

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
