/**
 * Generate Android launcher icons at every density from public/icon.svg.
 *
 * Overwrites the placeholder Capacitor scaffolded into the per-density
 * mipmap folders on `cap add android`.
 *
 * Three files per density:
 *   ic_launcher.png            — standard square launcher icon
 *   ic_launcher_round.png      — used by launchers that mask icons round
 *   ic_launcher_foreground.png — for adaptive icons (Android 8+), bigger
 *                                so the platform can mask & animate it
 *
 * Densities (Android's standard ladder):
 *   mdpi    = 1×   (48px standard, 108px foreground)
 *   hdpi    = 1.5× (72px / 162px)
 *   xhdpi   = 2×   (96px / 216px)
 *   xxhdpi  = 3×   (144px / 324px)
 *   xxxhdpi = 4×   (192px / 432px)
 *
 * Run with: node scripts/generate-android-icons.cjs
 * (also exposed as `npm run android:icons` in package.json)
 */

const path = require('path')
const fs = require('fs/promises')
const sharp = require('sharp')

const ROOT = path.join(__dirname, '..')
const SVG_PATH = path.join(ROOT, 'public', 'icon.svg')
const RES_DIR = path.join(ROOT, 'android', 'app', 'src', 'main', 'res')

const DENSITIES = [
  { name: 'mdpi',    launcher: 48,  foreground: 108 },
  { name: 'hdpi',    launcher: 72,  foreground: 162 },
  { name: 'xhdpi',   launcher: 96,  foreground: 216 },
  { name: 'xxhdpi',  launcher: 144, foreground: 324 },
  { name: 'xxxhdpi', launcher: 192, foreground: 432 },
]

async function main() {
  const svg = await fs.readFile(SVG_PATH)
  console.log(`[android-icons] Source: ${SVG_PATH}`)

  for (const { name, launcher, foreground } of DENSITIES) {
    const dir = path.join(RES_DIR, `mipmap-${name}`)
    await fs.mkdir(dir, { recursive: true })

    // Three files per density. Sharp re-rasterizes the SVG at each target
    // size — gives crisp output regardless of source dimensions.
    await Promise.all([
      sharp(svg).resize(launcher, launcher).png().toFile(path.join(dir, 'ic_launcher.png')),
      sharp(svg).resize(launcher, launcher).png().toFile(path.join(dir, 'ic_launcher_round.png')),
      sharp(svg).resize(foreground, foreground).png().toFile(path.join(dir, 'ic_launcher_foreground.png')),
    ])

    console.log(`  ${name.padEnd(8)} → ${launcher}px launcher, ${foreground}px foreground`)
  }

  console.log('[android-icons] Done.')
}

main().catch((err) => {
  console.error('[android-icons] failed:', err)
  process.exit(1)
})
