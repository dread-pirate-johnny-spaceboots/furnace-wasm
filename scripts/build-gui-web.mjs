import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoDir = path.resolve(scriptDir, '..')
const buildDir = path.join(repoDir, 'build-gui')
const webGuiRuntimeDir = path.join(repoDir, 'web', 'gui', 'runtime')
const publicGuiRuntimeDir = path.join(repoDir, 'web', 'public', 'gui', 'runtime')
const runtimeManifestName = 'furnace_gui_web_manifest.json'

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: repoDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const removeRuntimeArtifacts = targetDir => {
  if (!existsSync(targetDir)) {
    return
  }
  for (const entry of readdirSync(targetDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.startsWith('furnace_gui_web')) {
      continue
    }
    rmSync(path.join(targetDir, entry.name), { force: true })
  }
}

const getRuntimeBuildId = artifactPaths => {
  const hash = createHash('sha256')
  const orderedPaths = [...artifactPaths].sort((left, right) => path.basename(left).localeCompare(path.basename(right)))

  for (const artifactPath of orderedPaths) {
    hash.update(path.basename(artifactPath))
    hash.update('\0')
    hash.update(readFileSync(artifactPath))
    hash.update('\0')
  }

  return hash.digest('hex').slice(0, 12)
}

const writeRuntimeBundle = (targetDir, artifactPaths) => {
  const buildId = getRuntimeBuildId(artifactPaths)
  const manifest = {
    buildId,
    files: {},
  }

  removeRuntimeArtifacts(targetDir)

  for (const artifactPath of artifactPaths) {
    const artifactName = path.basename(artifactPath)
    const suffix = artifactName.slice('furnace_gui_web'.length)
    const hashedName = `furnace_gui_web.${buildId}${suffix}`
    manifest.files[artifactName] = hashedName
    cpSync(artifactPath, path.join(targetDir, hashedName))
  }

  writeFileSync(
    path.join(targetDir, runtimeManifestName),
    `${JSON.stringify(manifest, null, 2)}\n`
  )
}

mkdirSync(buildDir, { recursive: true })
mkdirSync(webGuiRuntimeDir, { recursive: true })
mkdirSync(publicGuiRuntimeDir, { recursive: true })

console.log('[gui] Configuring Emscripten build...')
const configureArgs = [
  'cmake',
  '-S',
  repoDir,
  '-B',
  buildDir,
  '-DCMAKE_BUILD_TYPE=Release',
  '-DBUILD_SHARED_LIBS=OFF',
  '-DFURNACE_WEB_BUILD_GUI=ON',
  '-DBUILD_GUI=ON',
  '-DUSE_SNDFILE=ON',
  '-DWITH_OGG=OFF',
  '-DWITH_MPEG=OFF',
  '-DUSE_RTMIDI=OFF',
  '-DWITH_JACK=OFF',
  '-DWITH_ASIO=OFF',
  '-DWITH_PORTAUDIO=OFF',
  '-DWITH_RENDER_SDL=OFF',
  '-DWITH_RENDER_OPENGL=ON',
  '-DWITH_RENDER_OPENGL1=OFF',
  '-DWITH_RENDER_DX11=OFF',
  '-DWITH_RENDER_DX9=OFF',
  '-DWITH_RENDER_METAL=OFF',
  '-DUSE_GLES=ON',
  '-DWITH_LOCALE=OFF',
  '-DWITH_DEMOS=OFF',
  '-DWITH_INSTRUMENTS=ON',
  '-DWITH_WAVETABLES=ON',
  '-DSHOW_OPEN_ASSETS_MENU_ENTRY=OFF',
  '-DUSE_BACKWARD=OFF',
  '-DSYSTEM_SDL2=OFF',
  '-DSYSTEM_ZLIB=OFF',
  '-DSYSTEM_FMT=OFF',
  '-DSYSTEM_RTMIDI=OFF',
]

if (process.env.FURNACE_WEB_GUI_FRESH === '1') {
  configureArgs.splice(5, 0, '--fresh')
}

run('emcmake', configureArgs)

console.log('[gui] Building furnace_gui_web...')
run('cmake', [
  '--build',
  buildDir,
  '--target',
  'furnace_gui_web',
  '-j4',
])

const artifacts = readdirSync(buildDir, { withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.startsWith('furnace_gui_web'))
  .map(entry => path.join(buildDir, entry.name))

if (artifacts.length === 0) {
  console.error(`ERROR: furnace_gui_web artifacts were not produced in ${buildDir}`)
  process.exit(1)
}

console.log('[gui] Copying browser runtime assets...')
writeRuntimeBundle(webGuiRuntimeDir, artifacts)
writeRuntimeBundle(publicGuiRuntimeDir, artifacts)

console.log(`[gui] Runtime ready under ${webGuiRuntimeDir}`)
console.log(`[gui] Runtime ready under ${publicGuiRuntimeDir}`)
