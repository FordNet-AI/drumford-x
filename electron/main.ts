import { app, BrowserWindow, ipcMain, shell, screen } from 'electron'
import path from 'path'
import { searchParaDB, downloadAndExtract, fetchAllMaps } from './paradb'

let mainWindow: BrowserWindow | null = null

const isDev = !app.isPackaged

function createWindow() {
  // Fit within the available work area (excludes taskbar)
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize
  const winW = Math.min(1280, screenW)
  const winH = Math.min(800, screenH)

  mainWindow = new BrowserWindow({
    width: winW,
    height: winH,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#050508',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Center on screen
  mainWindow.center()

  // Dev: load from Vite dev server. Prod: load built files.
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Open external links in the system browser, but only if they point at
  // one of the domains the app legitimately links out to. The renderer is
  // sandboxed, but `setWindowOpenHandler` will fire for *any* window.open
  // (including ones triggered by malformed chart data or future bugs) — so
  // we allow-list rather than open whatever URL shows up.
  const ALLOWED_EXTERNAL_HOSTS = new Set([
    'paradb.net',
    'www.paradb.net',
    'paradiddleapp.com',
    'www.paradiddleapp.com',
    'github.com',
    'www.github.com',
  ])
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (
        (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
        ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname.toLowerCase())
      ) {
        shell.openExternal(url)
      } else {
        console.warn('[electron] Blocked window.open to non-allow-listed URL:', url)
      }
    } catch {
      // Malformed URL — block silently
    }
    return { action: 'deny' }
  })
}

// ── Window control IPC ──────────────────────────────────────────────

ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})
ipcMain.on('window:close', () => mainWindow?.close())

// ── ParaDB IPC ──────────────────────────────────────────────────────

ipcMain.handle('paradb:search', async (_event, query: string) => {
  try {
    return await searchParaDB(query)
  } catch (err) {
    console.error('[paradb] Search failed:', err)
    throw err
  }
})

ipcMain.handle(
  'paradb:download',
  async (event, mapId: string) => {
    try {
      const result = await downloadAndExtract(mapId, (progress) => {
        // Send progress updates back to renderer
        event.sender.send('paradb:download-progress', { mapId, progress })
      })
      return result
    } catch (err) {
      console.error('[paradb] Download failed:', err)
      throw err
    }
  },
)

ipcMain.handle('paradb:catalog', async (event) => {
  try {
    // Stream a loaded-count event per page so the renderer can render a
    // progress bar while the catalog is paginated in.
    return await fetchAllMaps((loaded) => {
      event.sender.send('paradb:catalog-progress', { loaded })
    })
  } catch (err) {
    console.error('[paradb] Catalog fetch failed:', err)
    throw err
  }
})

// ── App lifecycle ───────────────────────────────────────────────────

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
