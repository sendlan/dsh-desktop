const { pathToFileURL } = require('node:url')

const [dshEntryPath, ...dshArguments] = process.argv.slice(2)

function reportError(label, error) {
  const details = error instanceof Error ? error.stack || error.message : String(error)
  process.stderr.write(`[harness-worker] ${label}: ${details}\n`)
}

process.on('uncaughtException', (error) => reportError('uncaught exception', error))
process.on('unhandledRejection', (error) => reportError('unhandled rejection', error))

if (!dshEntryPath) {
  process.stderr.write('[harness-worker] missing DSH entry path\n')
  process.exitCode = 1
} else {
  process.stdout.write(`[harness-worker] loading ${dshEntryPath}\n`)
  process.argv = [process.execPath, dshEntryPath, ...dshArguments]
  import(pathToFileURL(dshEntryPath).href)
    .then(() => process.stdout.write('[harness-worker] DSH entry loaded\n'))
    .catch((error) => {
      reportError('could not load DSH entry', error)
      process.exitCode = 1
    })
}
