/**
 * Small Fordnet brand mark for the top-right of the library header.
 * Loads the official FordNetAi wordmark from public/fordnet-logo.jpg.
 *
 * The file is served at the site root by Vite (in dev) and bundled into
 * dist/ for production builds. Sized via the height attribute so it scales
 * proportionally regardless of the source dimensions.
 *
 * Note the leading `./` on the src — without it, Electron's file:// loader
 * resolves the absolute `/fordnet-logo.jpg` against the drive root instead
 * of the directory containing index.html, and the image 404s in production.
 */
export function FordnetLogo() {
  return (
    <img
      src="./fordnet-logo.jpg"
      alt="FordNet Ai"
      height={26}
      className="h-[26px] w-auto select-none rounded-sm opacity-85 hover:opacity-100 transition-opacity"
      title="Fordnet Ai"
      draggable={false}
    />
  )
}
