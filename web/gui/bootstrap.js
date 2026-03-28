import { attachBrowserBridge } from './browser-bridge.js'

const canvas = document.getElementById('furnace-canvas')
const status = document.getElementById('status')

const setStatus = (message, state = 'info') => {
  status.hidden = !message
  status.textContent = message
  if (message) {
    status.dataset.state = state
  } else {
    delete status.dataset.state
  }
}

const formatError = error => {
  if (!error) {
    return 'Unknown error'
  }
  if (typeof error === 'string') {
    return error
  }
  if (error instanceof Error && error.message) {
    return error.message
  }

  const parts = []
  if (error.name) {
    parts.push(String(error.name))
  }
  if (error.message) {
    parts.push(String(error.message))
  }
  if (typeof error.errno !== 'undefined') {
    parts.push(`errno ${error.errno}`)
  }
  if (error.code) {
    parts.push(String(error.code))
  }
  if (error.path) {
    parts.push(String(error.path))
  }
  if (parts.length > 0) {
    return parts.join(': ')
  }

  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

const requireBrowserFeatures = () => {
  if (!window.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
    throw new Error(
      'This build requires cross-origin isolation (COOP/COEP) because Furnace GUI uses Emscripten pthreads.'
    )
  }
}

const runtimeBaseUrl = new URL('./runtime/', window.location.href)
const runtimeManifestUrl = new URL('./runtime/furnace_gui_web_manifest.json', window.location.href).href

const loadRuntimeManifest = async () => {
  try {
    const response = await fetch(runtimeManifestUrl, { cache: 'no-store' })
    if (!response.ok) {
      if (response.status === 404) {
        return { files: {} }
      }
      throw new Error(`Failed to load GUI runtime manifest: ${response.status} ${response.statusText}`)
    }
    return await response.json()
  } catch (error) {
    console.warn('[furnace-gui] runtime manifest unavailable, falling back to legacy asset names', error)
    return { files: {} }
  }
}

const syncCanvasBackingStore = () => {
  const rect = canvas.getBoundingClientRect()
  const cssWidth = Math.max(1, Math.round(rect.width || window.innerWidth || 1))
  const cssHeight = Math.max(1, Math.round(rect.height || window.innerHeight || 1))
  const dpr = Math.max(1, window.devicePixelRatio || 1)
  const pixelWidth = Math.max(1, Math.round(cssWidth * dpr))
  const pixelHeight = Math.max(1, Math.round(cssHeight * dpr))

  if (canvas.width !== pixelWidth) {
    canvas.width = pixelWidth
  }
  if (canvas.height !== pixelHeight) {
    canvas.height = pixelHeight
  }
}

const waitForLayout = () =>
  new Promise(resolve => {
    window.requestAnimationFrame(() => resolve())
  })

const boot = async () => {
  requireBrowserFeatures()
  await waitForLayout()
  syncCanvasBackingStore()

  setStatus('Loading Furnace GUI runtime...')

  const runtimeManifest = await loadRuntimeManifest()
  const resolveRuntimeFile = name => new URL(runtimeManifest.files?.[name] || name, runtimeBaseUrl).href
  const runtimeModuleUrl = resolveRuntimeFile('furnace_gui_web.js')
  const runtimeModule = await import(/* @vite-ignore */ runtimeModuleUrl)
  const createFurnaceGuiModule = runtimeModule.default
  if (typeof createFurnaceGuiModule !== 'function') {
    throw new Error('The Furnace GUI runtime did not expose a module factory')
  }

  canvas.addEventListener('pointerdown', () => canvas.focus())

  let startupAbortMessage = ''
  const module = await createFurnaceGuiModule({
    canvas,
    locateFile: resolveRuntimeFile,
    mainScriptUrlOrBlob: runtimeModuleUrl,
    print: text => console.log(text),
    printErr: text => console.error(text),
    onAbort: reason => {
      startupAbortMessage = formatError(reason)
      console.error('[furnace-gui] abort', reason)
    },
  }).catch(error => {
    console.error('[furnace-gui] module factory rejected', {
      error,
      formatted: formatError(error),
      startupAbortMessage,
      stack: error?.stack,
    })
    throw error
  })

  attachBrowserBridge({ module, canvas, status }).setStatus('Furnace GUI ready')
}

boot().catch(error => {
  const formatted = formatError(error)
  console.error('[furnace-gui] boot failed', {
    error,
    formatted,
    stack: error?.stack,
  })
  setStatus(formatted, 'error')
})
