import { createWriteStream, existsSync, type WriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import type { ForkOptions, UtilityProcess } from 'electron'
import type { RuntimePhase, RuntimeSnapshot } from '../../shared/contracts'

export interface HarnessRuntimeOptions {
  dshEntryPath: string
  workerEntryPath: string
  dshHome: string
  logPath: string
  launchProcess(modulePath: string, args: string[], options: ForkOptions): UtilityProcess
  startupTimeoutMs?: number
  onChanged(snapshot: RuntimeSnapshot): void
}

export function buildHarnessArguments(port: number): string[] {
  return ['web', '--host', '127.0.0.1', '--port', String(port)]
}

export function buildHarnessForkOptions(
  launchDirectory: string,
  dshHome: string,
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env
): ForkOptions {
  const { ELECTRON_RUN_AS_NODE: _runAsNode, ...parentEnvironment } = environment
  const pathKey = platform === 'win32' ? 'Path' : 'PATH'

  return {
    cwd: launchDirectory,
    env: {
      ...parentEnvironment,
      DSH_HOME: dshHome,
      NO_COLOR: '1',
      [pathKey]: environment[pathKey] ?? environment.PATH ?? ''
    },
    // Cordis HMR needs access to Node's internal ESM loader. This flag is only
    // granted to the isolated Harness utility process, never to the renderer.
    execArgv: ['--expose-internals'],
    stdio: 'pipe',
    serviceName: 'DSH Harness'
  }
}

export class HarnessRuntime {
  private child?: UtilityProcess
  private logStream?: WriteStream
  private phase: RuntimePhase = 'idle'
  private message = 'Harness is not running.'
  private launchDirectory?: string
  private url?: string
  private readonly logLines: string[] = []

  constructor(private readonly options: HarnessRuntimeOptions) {}

  snapshot(): RuntimeSnapshot {
    return {
      phase: this.phase,
      message: this.message,
      launchDirectory: this.launchDirectory,
      url: this.url,
      logs: [...this.logLines]
    }
  }

  async start(launchDirectory: string): Promise<void> {
    await this.stop()
    this.launchDirectory = launchDirectory
    this.url = undefined

    if (!existsSync(this.options.dshEntryPath)) {
      this.setState('failed', `Harness entry was not found: ${this.options.dshEntryPath}`)
      return
    }
    if (!existsSync(this.options.workerEntryPath)) {
      this.setState('failed', `Harness worker was not found: ${this.options.workerEntryPath}`)
      return
    }

    await mkdir(this.options.dshHome, { recursive: true })
    await mkdir(dirname(this.options.logPath), { recursive: true })
    this.logStream = createWriteStream(this.options.logPath, { flags: 'a' })

    const port = await reservePort()
    const url = `http://127.0.0.1:${port}`
    const args = buildHarnessArguments(port)

    this.writeLog(`\n[desktop] starting ${new Date().toISOString()}`)
    this.writeLog(`[desktop] launch directory ${launchDirectory}`)
    this.writeLog(`[desktop] endpoint ${url}`)
    this.setState('starting', 'Starting DeepSeek Harness…')

    let child: UtilityProcess
    try {
      child = this.options.launchProcess(
        this.options.workerEntryPath,
        [this.options.dshEntryPath, ...args],
        buildHarnessForkOptions(launchDirectory, this.options.dshHome)
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.writeLog(`[utility] launch failed: ${message}`)
      this.setState('failed', `Harness could not start: ${message}`)
      return
    }
    this.child = child

    child.stdout?.on('data', (chunk: Buffer) => this.writeChunk('stdout', chunk))
    child.stderr?.on('data', (chunk: Buffer) => this.writeChunk('stderr', chunk))
    child.once('spawn', () => this.writeLog('[desktop] Harness utility process started'))
    child.once('error', (type, location) => {
      this.writeLog(`[utility] ${type}${location.length > 0 ? ` at ${location}` : ''}`)
    })
    child.once('exit', (code) => {
      if (this.child !== child) return
      this.child = undefined
      this.setState('failed', `Harness stopped unexpectedly (${formatExitCode(code)}).`)
    })

    const ready = await waitUntilReady(
      url,
      () => this.child === child,
      this.options.startupTimeoutMs ?? 45_000
    )

    if (this.child !== child) return
    if (!ready) {
      await this.stopChild(child)
      this.setState('failed', 'Harness did not become ready within 45 seconds.')
      return
    }

    this.url = url
    this.setState('ready', 'Harness is ready.')
  }

  async stop(): Promise<void> {
    const child = this.child
    if (!child) {
      this.closeLog()
      if (this.phase !== 'failed') this.setState('idle', 'Harness is not running.')
      return
    }

    this.setState('stopping', 'Stopping Harness…')
    this.child = undefined
    await this.stopChild(child)
    this.closeLog()
    this.url = undefined
    this.setState('idle', 'Harness is not running.')
  }

  private async stopChild(child: UtilityProcess): Promise<void> {
    if (child.pid === undefined) return
    const exitPromise = new Promise<boolean>((resolve) =>
      child.once('exit', () => resolve(true))
    )
    child.kill()
    const exited = await Promise.race([
      exitPromise,
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 4_000))
    ])
    if (!exited && child.pid !== undefined) {
      try {
        process.kill(child.pid, 'SIGKILL')
      } catch {
        // The utility process may have exited between the timeout and this check.
      }
    }
  }

  private setState(phase: RuntimePhase, message: string): void {
    this.phase = phase
    this.message = message
    this.options.onChanged(this.snapshot())
  }

  private writeChunk(source: 'stdout' | 'stderr', chunk: Buffer): void {
    for (const line of chunk.toString('utf8').split(/\r?\n/)) {
      if (line.length > 0) this.writeLog(`[${source}] ${line}`)
    }
  }

  private writeLog(line: string): void {
    this.logLines.push(line)
    if (this.logLines.length > 200) this.logLines.splice(0, this.logLines.length - 200)
    this.logStream?.write(`${line}\n`)
  }

  private closeLog(): void {
    this.logStream?.end()
    this.logStream = undefined
  }
}

export function formatExitCode(code: number): string {
  const unsigned = code >>> 0
  const hexadecimal = `0x${unsigned.toString(16).padStart(8, '0').toUpperCase()}`
  if (unsigned === 0xffff7003) {
    return `exit code ${unsigned} (${hexadecimal}, Crashpad handler unavailable)`
  }
  return `exit code ${code} (${hexadecimal})`
}

async function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', reject)
    server.listen({ host: '127.0.0.1', port: 0 }, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Could not reserve a local port.'))
        return
      }
      const { port } = address
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
}

async function waitUntilReady(
  url: string,
  isAlive: () => boolean,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline && isAlive()) {
    try {
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(1_000) })
      if (response.status >= 200 && response.status < 500) return true
    } catch {
      // The server is expected to reject connections while it is booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}
