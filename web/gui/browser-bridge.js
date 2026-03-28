import { zipSync } from 'fflate'

const sanitizeDownloadName = value => value.replace(/[\\/:*?"<>|]+/g, '_')

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

const basename = path => {
  const parts = path.split('/')
  return parts[parts.length - 1] || 'download'
}

const dirname = path => {
  const parts = path.split('/')
  parts.pop()
  return parts.join('/') || '/'
}

const withoutExtension = path => {
  const lastSlash = path.lastIndexOf('/')
  const lastDot = path.lastIndexOf('.')
  if (lastDot === -1 || lastDot < lastSlash) {
    return path
  }
  return path.slice(0, lastDot)
}

const triggerDownload = (blob, fileName) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = sanitizeDownloadName(fileName)
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const normalizeAccept = rawFilter => {
  if (!rawFilter || rawFilter === '*') {
    return ''
  }

  return rawFilter
    .split(/\s+/)
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      if (entry === '*') {
        return ''
      }
      if (entry.startsWith('*.')) {
        return entry.slice(1)
      }
      if (entry.startsWith('.')) {
        return entry
      }
      return ''
    })
    .filter(Boolean)
    .join(',')
}

const collectDirectoryEntries = (module, rootPath, relativePath, output) => {
  const entries = module.FS.readdir(rootPath).filter(entry => entry !== '.' && entry !== '..')

  for (const entry of entries) {
    const fullPath = rootPath === '/' ? `/${entry}` : `${rootPath}/${entry}`
    const nextRelative = relativePath ? `${relativePath}/${entry}` : entry
    const stat = module.FS.stat(fullPath)
    if (module.FS.isDir(stat.mode)) {
      collectDirectoryEntries(module, fullPath, nextRelative, output)
      continue
    }
    output[nextRelative] = module.FS.readFile(fullPath, { encoding: 'binary' })
  }
}

const collectPrefixEntries = (module, basePath, suffixMarker) => {
  const files = {}
  const parentDir = dirname(basePath)
  const stem = basename(withoutExtension(basePath))
  for (const entry of module.FS.readdir(parentDir)) {
    if (entry === '.' || entry === '..') {
      continue
    }
    if (!entry.startsWith(`${stem}_${suffixMarker}`)) {
      continue
    }
    const fullPath = parentDir === '/' ? `/${entry}` : `${parentDir}/${entry}`
    const stat = module.FS.stat(fullPath)
    if (module.FS.isDir(stat.mode)) {
      continue
    }
    files[entry] = module.FS.readFile(fullPath, { encoding: 'binary' })
  }
  return files
}

const collectSelectionEntries = (module, selectedPaths) => {
  const files = {}
  for (const selectedPath of selectedPaths) {
    const stat = module.FS.stat(selectedPath)
    if (module.FS.isDir(stat.mode)) {
      collectDirectoryEntries(module, selectedPath, basename(selectedPath), files)
      continue
    }
    files[basename(selectedPath)] = module.FS.readFile(selectedPath, { encoding: 'binary' })
  }
  return files
}

export const attachBrowserBridge = ({ module, canvas, status }) => {
  const hasMouseBridge =
    typeof module._furnace_gui_web_mouse_move === 'function' &&
    typeof module._furnace_gui_web_mouse_down === 'function' &&
    typeof module._furnace_gui_web_mouse_up === 'function' &&
    typeof module._furnace_gui_web_mouse_wheel === 'function' &&
    typeof module._furnace_gui_web_mouse_leave === 'function'

  let lastMousePosition = null

  const toCanvasCoords = event => {
    const rect = canvas.getBoundingClientRect()
    const width = Math.max(1, rect.width || 1)
    const height = Math.max(1, rect.height || 1)
    const x = Math.max(0, Math.min(canvas.width, Math.round(((event.clientX - rect.left) / width) * canvas.width)))
    const y = Math.max(0, Math.min(canvas.height, Math.round(((event.clientY - rect.top) / height) * canvas.height)))
    return { x, y }
  }

  const toGuiButton = button => {
    if (button === 0) return 0
    if (button === 2) return 1
    if (button === 1) return 2
    if (button === 3) return 3
    if (button === 4) return 4
    return -1
  }

  const syncCanvasBackingStore = () => {
    const rect = canvas.getBoundingClientRect()
    const cssWidth = Math.max(1, Math.round(rect.width || window.innerWidth || 1))
    const cssHeight = Math.max(1, Math.round(rect.height || window.innerHeight || 1))
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const pixelWidth = Math.max(1, Math.round(cssWidth * dpr))
    const pixelHeight = Math.max(1, Math.round(cssHeight * dpr))
    let changed = false

    if (canvas.width !== pixelWidth) {
      canvas.width = pixelWidth
      changed = true
    }
    if (canvas.height !== pixelHeight) {
      canvas.height = pixelHeight
      changed = true
    }

    if (changed) {
      window.dispatchEvent(new Event('resize'))
    }
  }

  const importInput = document.createElement('input')
  importInput.type = 'file'
  importInput.hidden = true
  document.body.appendChild(importInput)

  const resizeObserver = new ResizeObserver(() => {
    syncCanvasBackingStore()
  })
  resizeObserver.observe(canvas)
  window.addEventListener('resize', syncCanvasBackingStore)
  syncCanvasBackingStore()

  if (hasMouseBridge) {
    canvas.addEventListener('mousemove', event => {
      const position = toCanvasCoords(event)
      const xrel = lastMousePosition ? position.x - lastMousePosition.x : 0
      const yrel = lastMousePosition ? position.y - lastMousePosition.y : 0
      lastMousePosition = position
      module._furnace_gui_web_mouse_move(position.x, position.y, xrel, yrel)
    })

    canvas.addEventListener('mousedown', event => {
      const button = toGuiButton(event.button)
      if (button < 0) {
        return
      }
      const position = toCanvasCoords(event)
      lastMousePosition = position
      canvas.focus()
      module._furnace_gui_web_mouse_down(position.x, position.y, button)
      event.preventDefault()
    })

    canvas.addEventListener('mouseup', event => {
      const button = toGuiButton(event.button)
      if (button < 0) {
        return
      }
      const position = toCanvasCoords(event)
      lastMousePosition = position
      module._furnace_gui_web_mouse_up(position.x, position.y, button)
      event.preventDefault()
    })

    canvas.addEventListener('mouseleave', () => {
      lastMousePosition = null
      module._furnace_gui_web_mouse_leave()
    })

    canvas.addEventListener('wheel', event => {
      const stepX = event.deltaX === 0 ? 0 : (event.deltaX > 0 ? -1 : 1)
      const stepY = event.deltaY === 0 ? 0 : (event.deltaY > 0 ? -1 : 1)
      module._furnace_gui_web_mouse_wheel(stepX, stepY)
      event.preventDefault()
    }, { passive: false })

    canvas.addEventListener('contextmenu', event => {
      event.preventDefault()
    })
  }

  const importState = {
    phase: 'idle',
    message: '',
  }

  const setStatus = (message, state = 'info', sticky = false) => {
    if (!message) {
      status.hidden = true
      status.textContent = ''
      delete status.dataset.state
      return
    }

    status.hidden = false
    status.dataset.state = state
    status.textContent = message

    if (!sticky && state !== 'error') {
      window.clearTimeout(setStatus.timeoutId)
      setStatus.timeoutId = window.setTimeout(() => {
        if (status.dataset.state !== 'error') {
          setStatus('')
        }
      }, 2500)
    }
  }

  const markFsDirty = () => {
    if (typeof module.__furnaceWebMarkFsDirty === 'function') {
      module.__furnaceWebMarkFsDirty()
    }
  }

  const writeImportedFiles = async (targetDir, fileList) => {
    for (const file of fileList) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const targetPath = `${targetDir.replace(/\/$/, '')}/${file.name}`
      module.FS.writeFile(targetPath, bytes)
    }
    markFsDirty()
  }

  module.furnaceWebRequestImport = (targetDir, rawFilter, allowMultiple) => {
    if (importState.phase === 'pending') {
      return 0
    }

    importState.phase = 'pending'
    importState.message = ''
    importInput.accept = normalizeAccept(rawFilter)
    importInput.multiple = !!allowMultiple
    importInput.onchange = async event => {
      const files = Array.from(event.target.files || [])
      if (files.length === 0) {
        importState.phase = 'idle'
        importState.message = ''
        return
      }

      try {
        await writeImportedFiles(targetDir, files)
        importState.phase = 'completed'
        importState.message = `Imported ${files.length} file${files.length === 1 ? '' : 's'} into the browser workspace`
        setStatus(importState.message)
      } catch (error) {
        importState.phase = 'failed'
        importState.message = formatError(error)
        setStatus(`Import failed:\n${importState.message}`, 'error', true)
      } finally {
        importInput.value = ''
        canvas.focus()
      }
    }
    importInput.click()
    return 1
  }

  module.furnaceWebConsumeImportState = () => {
    if (importState.phase === 'completed') {
      importState.phase = 'idle'
      importState.message = ''
      return 1
    }
    if (importState.phase === 'failed') {
      importState.phase = 'idle'
      return -1
    }
    if (importState.phase === 'pending') {
      return 2
    }
    return 0
  }

  module.furnaceWebConsumeImportMessage = () => {
    const message = importState.message
    importState.message = ''
    return message
  }

  module.furnaceWebDownloadFile = path => {
    const bytes = module.FS.readFile(path, { encoding: 'binary' })
    triggerDownload(new Blob([bytes]), basename(path))
    setStatus(`Downloaded ${basename(path)}`)
  }

  module.furnaceWebDownloadDirectory = (path, archiveName) => {
    const files = {}
    collectDirectoryEntries(module, path, '', files)
    const zipBytes = zipSync(files, { level: 0 })
    const downloadName = archiveName || `${basename(path)}.zip`
    triggerDownload(new Blob([zipBytes], { type: 'application/zip' }), downloadName)
    setStatus(`Downloaded ${downloadName}`)
  }

  module.furnaceWebDownloadPrefix = (basePath, suffixMarker) => {
    const files = collectPrefixEntries(module, basePath, suffixMarker)
    const fileEntries = Object.entries(files)
    if (fileEntries.length === 0) {
      return
    }
    if (fileEntries.length === 1) {
      const [name, bytes] = fileEntries[0]
      triggerDownload(new Blob([bytes]), name)
      setStatus(`Downloaded ${name}`)
      return
    }

    const zipBytes = zipSync(files, { level: 0 })
    const stem = basename(withoutExtension(basePath))
    const archiveName = `${stem}_${suffixMarker}.zip`
    triggerDownload(new Blob([zipBytes], { type: 'application/zip' }), archiveName)
    setStatus(`Downloaded ${archiveName}`)
  }

  module.furnaceWebDownloadSelection = (pathList, archiveName) => {
    const selectedPaths = pathList
      .split('\n')
      .map(entry => entry.trim())
      .filter(Boolean)

    if (selectedPaths.length === 0) {
      return
    }
    if (selectedPaths.length === 1) {
      const [selectedPath] = selectedPaths
      const stat = module.FS.stat(selectedPath)
      if (module.FS.isDir(stat.mode)) {
        module.furnaceWebDownloadDirectory(selectedPath, archiveName)
        return
      }
      module.furnaceWebDownloadFile(selectedPath)
      return
    }

    const files = collectSelectionEntries(module, selectedPaths)
    const fileEntries = Object.entries(files)
    if (fileEntries.length === 0) {
      return
    }
    const downloadName = archiveName || 'workspace-selection.zip'
    const zipBytes = zipSync(files, { level: 0 })
    triggerDownload(new Blob([zipBytes], { type: 'application/zip' }), downloadName)
    setStatus(`Downloaded ${downloadName}`)
  }

  module.furnaceWebFocusCanvas = () => {
    canvas.focus()
  }

  window.addEventListener('pagehide', () => {
    if (typeof module.__furnaceWebSyncFs === 'function') {
      module.__furnaceWebSyncFs()
    }
  })

  return {
    setStatus,
  }
}
