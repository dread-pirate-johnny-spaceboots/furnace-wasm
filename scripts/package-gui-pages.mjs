import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoDir = path.resolve(scriptDir, '..')
const distDir = path.join(repoDir, 'dist')
const distGuiDir = path.join(repoDir, 'dist-gui')
const sourceGuiIndex = path.join(distDir, 'gui', 'index.html')
const sourceAssetsDir = path.join(distDir, 'assets')
const sourceRuntimeDir = path.join(distDir, 'gui', 'runtime')

if (!existsSync(sourceGuiIndex)) {
  console.error(`ERROR: GUI build output not found at ${sourceGuiIndex}`)
  process.exit(1)
}

if (!existsSync(sourceAssetsDir)) {
  console.error(`ERROR: GUI asset output not found at ${sourceAssetsDir}`)
  process.exit(1)
}

if (!existsSync(sourceRuntimeDir)) {
  console.error(`ERROR: GUI runtime output not found at ${sourceRuntimeDir}`)
  process.exit(1)
}

rmSync(distGuiDir, { recursive: true, force: true })
mkdirSync(distGuiDir, { recursive: true })

let indexHtml = readFileSync(sourceGuiIndex, 'utf8')
indexHtml = indexHtml.replaceAll('../assets/', './assets/')
writeFileSync(path.join(distGuiDir, 'index.html'), indexHtml)

cpSync(sourceAssetsDir, path.join(distGuiDir, 'assets'), { recursive: true })
cpSync(sourceRuntimeDir, path.join(distGuiDir, 'runtime'), { recursive: true })

const headers = `/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/runtime/*
  Cache-Control: public, max-age=31536000, immutable
`

writeFileSync(path.join(distGuiDir, '_headers'), headers)

console.log(`[gui] Standalone Pages bundle ready under ${distGuiDir}`)
