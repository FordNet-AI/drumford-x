/**
 * Generate Google Play Store listing graphics from public/icon.svg.
 *
 *   icon-512.png            — 512×512 high-res app icon (Play listing requirement)
 *   feature-graphic-1024x500.png — landscape banner shown at the top of the
 *                                  Play listing (required)
 *
 * Output: docs/play-assets/
 * Run: node scripts/generate-play-assets.cjs
 *
 * Note: the feature graphic renders the wordmark in a generic bold sans
 * (Orbitron isn't installed for the SVG rasterizer) — close enough for an
 * alpha listing; refine later if desired.
 */

const path = require('path')
const fs = require('fs/promises')
const sharp = require('sharp')

const ROOT = path.join(__dirname, '..')
const SVG_PATH = path.join(ROOT, 'public', 'icon.svg')
const OUT_DIR = path.join(ROOT, 'docs', 'play-assets')

const BG = '#0d1424'
const CYAN = '#00e5ff'
const RED = '#ff3a5c'
const GREY = '#8a8a99'
const SUBTLE = '#aab'

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true })
  const svg = await fs.readFile(SVG_PATH)

  // 1) 512×512 app icon
  await sharp(svg).resize(512, 512).png().toFile(path.join(OUT_DIR, 'icon-512.png'))
  console.log('  icon-512.png')

  // 2) 1024×500 feature graphic: dark bg + icon on the left + wordmark/tagline
  const iconPx = 320
  const iconBuf = await sharp(svg).resize(iconPx, iconPx).png().toBuffer()

  const textSvg = Buffer.from(`
    <svg width="1024" height="500" xmlns="http://www.w3.org/2000/svg">
      <style>
        .word { font-family: 'Orbitron','Segoe UI',Arial,sans-serif; font-weight: 800; font-size: 70px; letter-spacing: 3px; }
        .tag  { font-family: 'Segoe UI',Arial,sans-serif; font-weight: 500; font-size: 28px; letter-spacing: 1px; }
      </style>
      <text x="458" y="248" class="word">
        <tspan fill="${CYAN}">DRUM</tspan><tspan fill="${RED}">FORD</tspan><tspan fill="${GREY}" font-size="48px"> X</tspan>
      </text>
      <text x="462" y="298" class="tag" fill="${SUBTLE}">Drum charts for real kits</text>
    </svg>
  `)

  await sharp({
    create: { width: 1024, height: 500, channels: 4, background: BG },
  })
    .composite([
      { input: iconBuf, left: 90, top: Math.round((500 - iconPx) / 2) },
      { input: textSvg, left: 0, top: 0 },
    ])
    .png()
    .toFile(path.join(OUT_DIR, 'feature-graphic-1024x500.png'))
  console.log('  feature-graphic-1024x500.png')

  console.log('[play-assets] Done →', OUT_DIR)
}

main().catch((err) => {
  console.error('[play-assets] failed:', err)
  process.exit(1)
})
