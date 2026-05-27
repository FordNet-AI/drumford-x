/** Type declarations for the Electron preload bridge. */

interface ParaDBSearchResult {
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

interface DownloadedSongFiles {
  folderName: string
  files: { name: string; data: ArrayBuffer; type: string }[]
}

interface ElectronAPI {
  minimize: () => void
  maximize: () => void
  close: () => void
  paradbSearch: (query: string) => Promise<ParaDBSearchResult[]>
  paradbDownload: (mapId: string) => Promise<DownloadedSongFiles>
  paradbCatalog: () => Promise<ParaDBSearchResult[]>
  onDownloadProgress: (
    callback: (data: { mapId: string; progress: number }) => void,
  ) => () => void
  onCatalogProgress: (
    callback: (data: { loaded: number }) => void,
  ) => () => void
  isElectron: true
}

interface Window {
  electronAPI?: ElectronAPI
}
