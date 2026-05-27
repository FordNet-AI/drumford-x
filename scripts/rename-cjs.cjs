// Post-build: rename .js → .cjs in electron-dist/
// Needed because package.json has "type": "module" (for Vite)
// but Electron needs CommonJS entry points.
const fs = require('fs')
const path = require('path')

const dir = path.join(__dirname, '..', 'electron-dist')

// Also fix require paths inside the .cjs files
// (tsc outputs require("./paradb") which resolves to .js, but we need .cjs)
const files = fs.readdirSync(dir)

// Step 1: Rename .js → .cjs and .js.map → .cjs.map
for (const file of files) {
  const src = path.join(dir, file)
  if (file.endsWith('.js.map')) {
    fs.renameSync(src, path.join(dir, file.replace(/\.js\.map$/, '.cjs.map')))
  } else if (file.endsWith('.js')) {
    fs.renameSync(src, path.join(dir, file.replace(/\.js$/, '.cjs')))
  }
}

// Step 2: Fix require() paths inside .cjs files to reference .cjs instead of .js
const cjsFiles = fs.readdirSync(dir).filter(f => f.endsWith('.cjs'))
for (const file of cjsFiles) {
  const filePath = path.join(dir, file)
  let content = fs.readFileSync(filePath, 'utf-8')
  // Fix require("./paradb") → require("./paradb.cjs") etc.
  content = content.replace(/require\("\.\/(\w+)"\)/g, 'require("./$1.cjs")')
  // Fix sourceMappingURL
  content = content.replace(/\/\/# sourceMappingURL=(\w+)\.js\.map/g, '//# sourceMappingURL=$1.cjs.map')
  fs.writeFileSync(filePath, content)
}

console.log('Renamed electron-dist/*.js → *.cjs')
