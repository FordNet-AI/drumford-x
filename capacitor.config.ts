import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor configuration for the Android build of DrumFord X.
 *
 * The renderer (src/) is shared with the Electron build untouched — Capacitor
 * just wraps the compiled `dist/` folder as a WebView-based Android app.
 *
 * Key plugin: `CapacitorHttp` (enabled below) intercepts ALL `fetch()` and
 * XHR calls inside the WebView and routes them through native HTTP, which
 * bypasses CORS. This is critical for the ParaDB browser — in Electron we
 * solved CORS by doing fetches in the main process; on Android, CapacitorHttp
 * does the same thing at a lower layer so the renderer code doesn't need to
 * know it's running on mobile.
 *
 * `webDir: 'dist'` tells Capacitor to grab whatever `npm run build:renderer`
 * produces and bundle it into the APK. No Electron main process gets included.
 */
const config: CapacitorConfig = {
  appId: 'com.fordnet.drumfordx',
  appName: 'DrumFord X',
  webDir: 'dist',
  android: {
    // Don't allow the WebView to be reused across launches — keeps audio/Web
    // Audio behaviour predictable after a fresh foreground.
    allowMixedContent: false,
  },
  plugins: {
    CapacitorHttp: {
      // ALL fetch/XHR calls automatically go through native HTTP. This is
      // what gives us paradb.net access without CORS restrictions.
      enabled: true,
    },
  },
}

export default config
