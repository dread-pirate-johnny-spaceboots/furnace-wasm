(function() {
  const persistRoot = '/persist'
  const configRoot = '/persist/home/.config/furnace'
  const workspaceRoot = '/persist/workspace'

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

  const ensureDir = (FS, path) => {
    const segments = path.split('/').filter(Boolean)
    let current = ''
    for (const segment of segments) {
      current += `/${segment}`
      try {
        FS.mkdir(current)
      } catch (error) {
        const analysis = FS.analyzePath(current)
        if (!analysis.exists) {
          throw error
        }
        if (!FS.isDir(analysis.object.mode)) {
          throw new Error(`Expected ${current} to be a directory`)
        }
      }
    }
  }

  const scheduleSync = Module => {
    if (Module.__furnaceWebSyncScheduled) {
      return
    }

    Module.__furnaceWebSyncScheduled = true
    Module.__furnaceWebSyncTimer = setTimeout(() => {
      Module.__furnaceWebSyncScheduled = false
      Module.__furnaceWebSyncTimer = null
      Module.FS.syncfs(false, error => {
        if (error) {
          console.error('[furnace-gui] persistent sync failed', error)
        }
      })
    }, 750)
  }

  const installFsHooks = Module => {
    if (Module.__furnaceWebFsHooksInstalled) {
      return
    }

    const { FS } = Module
    const markDirty = () => scheduleSync(Module)
    const open = FS.open.bind(FS)
    const mkdir = FS.mkdir.bind(FS)
    const unlink = FS.unlink.bind(FS)
    const rename = FS.rename.bind(FS)
    const rmdir = FS.rmdir.bind(FS)
    const writeFile = FS.writeFile.bind(FS)

    const isWriteFlags = flags => {
      if (typeof flags === 'string') {
        return /[wa+]/.test(flags)
      }
      return flags !== 0
    }

    FS.open = function(path, flags, mode) {
      const stream = open(path, flags, mode)
      if (isWriteFlags(flags)) {
        markDirty()
      }
      return stream
    }

    FS.mkdir = function(path, mode) {
      const result = mkdir(path, mode)
      markDirty()
      return result
    }

    FS.unlink = function(path) {
      const result = unlink(path)
      markDirty()
      return result
    }

    FS.rename = function(oldPath, newPath) {
      const result = rename(oldPath, newPath)
      markDirty()
      return result
    }

    FS.rmdir = function(path) {
      const result = rmdir(path)
      markDirty()
      return result
    }

    FS.writeFile = function(path, data, options) {
      const result = writeFile(path, data, options)
      markDirty()
      return result
    }

    Module.__furnaceWebMarkFsDirty = markDirty
    Module.__furnaceWebSyncFs = callback => {
      Module.FS.syncfs(false, callback || (() => {}))
    }
    Module.__furnaceWebFsHooksInstalled = true
  }

  const failStartup = (Module, runDependencyId, message, error) => {
    console.error('[furnace-gui] startup failed', error || message)
    try {
      Module.removeRunDependency(runDependencyId)
    } catch {
    }
    if (typeof Module.abort === 'function') {
      Module.abort(message)
      return
    }
    throw new Error(message)
  }

  Module.preRun = Module.preRun || []
  Module.preRun.push(() => {
    const runDependencyId = 'furnace-idbfs-sync'
    const idbfs =
      Module.FS?.filesystems?.IDBFS ||
      (typeof IDBFS !== 'undefined' ? IDBFS : null)

    if (!idbfs) {
      failStartup(
        Module,
        runDependencyId,
        'IndexedDB filesystem support is unavailable. Rebuild the GUI runtime with -lidbfs.js.'
      )
      return
    }

    ensureDir(Module.FS, persistRoot)
    Module.FS.mount(idbfs, {}, persistRoot)
    Module.__furnaceWebPaths = {
      persistRoot,
      configRoot,
      workspaceRoot,
    }

    Module.addRunDependency(runDependencyId)
    Module.FS.syncfs(true, error => {
      if (error) {
        failStartup(
          Module,
          runDependencyId,
          `Failed to load browser workspace: ${formatError(error)}`,
          error
        )
        return
      }

      try {
        ensureDir(Module.FS, configRoot)
        ensureDir(Module.FS, workspaceRoot)
        installFsHooks(Module)
      } catch (setupError) {
        failStartup(
          Module,
          runDependencyId,
          `Failed to prepare browser workspace: ${formatError(setupError)}`,
          setupError
        )
        return
      }
      Module.removeRunDependency(runDependencyId)
    })
  })
})()
