import { contextBridge, ipcRenderer } from 'electron'

export interface ParaDBSearchResult {
  id: string
  title: string
  artist: string
  creator: string
  difficulty: string
  complexity: number
  description: string
  downloadCount: number
  uploadedAt: string
  coverUrl: string | null
}

export interface DownloadedSongFiles {
  folderName: string
  files: { name: string; data: ArrayBuffer; type: string }[]
}

const electronAPI = {
  // ── Window controls ─────────────────────────
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // ── ParaDB ──────────────────────────────────
  paradbSearch: (query: string): Promise<ParaDBSearchResult[]> =>
    ipcRenderer.invoke('paradb:search', query),

  paradbDownload: (mapId: string): Promise<DownloadedSongFiles> =>
    ipcRenderer.invoke('paradb:download', mapId),

  paradbCatalog: (): Promise<ParaDBSearchResult[]> =>
    ipcRenderer.invoke('paradb:catalog'),

  onDownloadProgress: (
    callback: (data: { mapId: string; progress: number }) => void,
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { mapId: string; progress: number }) =>
      callback(data)
    ipcRenderer.on('paradb:download-progress', handler)
    // Return cleanup function
    return () => ipcRenderer.removeListener('paradb:download-progress', handler)
  },

  onCatalogProgress: (
    callback: (data: { loaded: number }) => void,
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { loaded: number }) =>
      callback(data)
    ipcRenderer.on('paradb:catalog-progress', handler)
    return () => ipcRenderer.removeListener('paradb:catalog-progress', handler)
  },

  // ── Platform detection ──────────────────────
  isElectron: true as const,
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// Type declaration for renderer use
export type ElectronAPI = typeof electronAPI
