/**
 * Generate public/icon.ico from public/icon.svg.
 *
 * Renders the SVG at the standard ICO sizes (256, 128, 64, 48, 32, 16) via
 * sharp, then bundles them into a single multi-resolution .ico via png-to-ico.
 * Electron Windows builds prefer multi-size ICOs so the icon stays crisp
 * everywhere from the taskbar (16px) to the installer (256px).
 *
 * Run with: node scripts/generate-icon.cjs
 */

const path = require('path')
const fs = require('fs/promises')
const sharp = require('sharp')

// png-to-ico v3+ is ESM-only — use dynamic import from this CJS script
async function loadPngToIco() {
  const mod = await import('png-to-ico')
  return mod.default
}

const PUBLIC_DIR = path.join(__dirname, '..', 'public')
const SVG_PATH = path.join(PUBLIC_DIR, 'icon.svg')
const ICO_PATH = path.join(PUBLIC_DIR, 'icon.ico')

// Sizes Windows actually picks from — 16 to 256. Above 256 wastes space.
const SIZES = [256, 128, 64, 48, 32, 16]

async function main() {
  const pngToIco = await loadPngToIco()
  const svg = await fs.readFile(SVG_PATH)

  console.log(`[generate-icon] Reading ${SVG_PATH}`)
  const pngBuffers = await Promise.all(
    SIZES.map(async (size) => {
      const buf = await sharp(svg)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
      console.log(`[generate-icon]   rendered ${size}×${size} → ${buf.length} bytes`)
      return buf
    }),
  )

  const ico = await pngToIco(pngBuffers)
  await fs.writeFile(ICO_PATH, ico)
  console.log(`[generate-icon] Wrote ${ICO_PATH} (${ico.length} bytes, ${SIZES.length} sizes)`)
}

main().catch((err) => {
  console.error('[generate-icon] failed:', err)
  process.exit(1)
})
