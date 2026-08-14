import { app, BrowserWindow, dialog, powerMonitor, type MessageBoxOptions } from 'electron'
import electronUpdater from 'electron-updater'
import {
  shouldCheckAfterResume,
  supportsAutoUpdates,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_STARTUP_DELAY_MS,
  UPDATE_STARTUP_JITTER_MS
} from './update-policy'

const { autoUpdater } = electronUpdater

let prepareToInstall: (() => Promise<void>) | undefined
let startupTimer: NodeJS.Timeout | undefined
let intervalTimer: NodeJS.Timeout | undefined
let checkPromise: Promise<unknown> | undefined
let lastCheckedAt = 0
let manualCheck = false
let updateInProgress = false
let downloadedVersion: string | undefined
let promptedVersion: string | undefined
let installing = false
let started = false

export function startUpdateManager(options: { prepareToInstall: () => Promise<void> }): void {
  prepareToInstall = options.prepareToInstall
  if (started) return
  started = true
  if (!supportsUpdates()) return

  configureUpdater()
  startupTimer = setTimeout(
    () => void checkForUpdates(),
    UPDATE_STARTUP_DELAY_MS + Math.random() * UPDATE_STARTUP_JITTER_MS
  )
  intervalTimer = setInterval(() => void checkForUpdates(), UPDATE_CHECK_INTERVAL_MS)
  powerMonitor.on('resume', checkAfterResume)
}

export async function checkForUpdates(manual = false): Promise<void> {
  if (!supportsUpdates()) {
    if (manual) await showMessage(unsupportedDialog())
    return
  }
  if (downloadedVersion) {
    if (manual) await promptToInstall(downloadedVersion, true)
    return
  }
  if (checkPromise || updateInProgress) return

  manualCheck = manual
  lastCheckedAt = Date.now()
  checkPromise = autoUpdater.checkForUpdates()
  try {
    await checkPromise
  } catch (error) {
    console.error('[updater] update check failed', error)
  } finally {
    checkPromise = undefined
  }
}

export function stopUpdateManager(): void {
  if (startupTimer) clearTimeout(startupTimer)
  if (intervalTimer) clearInterval(intervalTimer)
  startupTimer = undefined
  intervalTimer = undefined
  if (started && app.isReady()) powerMonitor.removeListener('resume', checkAfterResume)
}

function configureUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  autoUpdater.logger = {
    info: (...args: unknown[]) => console.info('[updater]', ...args),
    warn: (...args: unknown[]) => console.warn('[updater]', ...args),
    error: (...args: unknown[]) => console.error('[updater]', ...args),
    debug: (...args: unknown[]) => console.debug('[updater]', ...args)
  }

  autoUpdater.on('checking-for-update', () => console.info('[updater] checking for update'))
  autoUpdater.on('update-available', (info) => {
    updateInProgress = true
    console.info(`[updater] downloading version ${info.version}`)
  })
  autoUpdater.on('download-progress', (progress) => {
    console.info(`[updater] download ${progress.percent.toFixed(1)}%`)
  })
  autoUpdater.on('update-not-available', () => void handleNoUpdate())
  autoUpdater.on('update-downloaded', (info) => void handleDownloaded(info.version))
  autoUpdater.on('error', (error) => void handleError(error))
}

async function handleNoUpdate(): Promise<void> {
  updateInProgress = false
  if (!manualCheck) return
  manualCheck = false
  await showMessage({
    type: 'info',
    title: 'DSH Desktop Update',
    message: 'DSH Desktop is up to date.',
    detail: `You are running version ${app.getVersion()}.`,
    buttons: ['OK']
  })
}

async function handleDownloaded(version: string): Promise<void> {
  updateInProgress = false
  downloadedVersion = version
  const forcePrompt = manualCheck
  manualCheck = false
  await promptToInstall(version, forcePrompt)
}

async function handleError(error: Error): Promise<void> {
  updateInProgress = false
  console.error('[updater]', error)
  if (!manualCheck) return
  manualCheck = false
  await showMessage({
    type: 'error',
    title: 'DSH Desktop Update',
    message: 'Unable to check for updates.',
    detail: error.message,
    buttons: ['OK']
  })
}

async function promptToInstall(version: string, force = false): Promise<void> {
  if (!force && promptedVersion === version) return
  promptedVersion = version
  const result = await showMessage({
    type: 'info',
    title: 'DSH Desktop Update',
    message: `DSH Desktop ${version} is ready to install.`,
    detail: 'Restart now to install the update, or install it automatically when you quit.',
    buttons: ['Restart and Install', 'Later'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  })
  if (result.response === 0) await installDownloadedUpdate()
}

async function installDownloadedUpdate(): Promise<void> {
  if (!downloadedVersion || installing) return
  installing = true
  try {
    await prepareToInstall?.()
    autoUpdater.quitAndInstall(false, true)
  } catch (error) {
    installing = false
    const message = error instanceof Error ? error.message : String(error)
    await showMessage({
      type: 'error',
      title: 'DSH Desktop Update',
      message: 'Unable to install the downloaded update.',
      detail: message,
      buttons: ['OK']
    })
  }
}

function checkAfterResume(): void {
  if (shouldCheckAfterResume(lastCheckedAt)) void checkForUpdates()
}

function supportsUpdates(): boolean {
  return supportsAutoUpdates(app.isPackaged, process.platform)
}

function unsupportedDialog(): MessageBoxOptions {
  return {
    type: 'info',
    title: 'DSH Desktop Update',
    message: 'Update checks are available in installed macOS and Windows builds.',
    buttons: ['OK']
  }
}

function showMessage(options: MessageBoxOptions): ReturnType<typeof dialog.showMessageBox> {
  const owner = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  return owner && !owner.isDestroyed()
    ? dialog.showMessageBox(owner, options)
    : dialog.showMessageBox(options)
}
