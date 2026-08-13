import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createWriteStream, existsSync, type WriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import type { RuntimePhase, RuntimeSnapshot } from '../../shared/contracts'

export interface HarnessRuntimeOptions {
  dshEntryPath: string
  dshHome: string
  logPath: string
  nodeExecutable: string
  startupTimeoutMs?: number
  onChanged(snapshot: RuntimeSnapshot): void
}

export function buildHarnessArguments(port: number): string[] {
  return ['web', '--host', '127.0.0.1', '--port', String(port)]
}

export function buildNodeArguments(dshEntryPath: string, port: number): string[] {
  // Cordis HMR needs access to Node's internal ESM loader. This flag is only
  // granted to the isolated Harness child process, never to the renderer.
  return ['--expose-internals', dshEntryPath, ...buildHarnessArguments(port)]
}

export class HarnessRuntime {
  private child?: ChildProcessWithoutNullStreams
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

    await mkdir(this.options.dshHome, { recursive: true })
    await mkdir(dirname(this.options.logPath), { recursive: true })
    this.logStream = createWriteStream(this.options.logPath, { flags: 'a' })

    const port = await reservePort()
    const url = `http://127.0.0.1:${port}`
    const args = buildNodeArguments(this.options.dshEntryPath, port)
    const pathKey = process.platform === 'win32' ? 'Path' : 'PATH'

    this.writeLog(`\n[desktop] starting ${new Date().toISOString()}`)
    this.writeLog(`[desktop] launch directory ${launchDirectory}`)
    this.writeLog(`[desktop] endpoint ${url}`)
    this.setState('starting', 'Starting DeepSeek Harness…')

    const child = spawn(this.options.nodeExecutable, args, {
      cwd: launchDirectory,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        DSH_HOME: this.options.dshHome,
        NO_COLOR: '1',
        [pathKey]: process.env[pathKey] ?? process.env.PATH ?? ''
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })
    this.child = child

    child.stdout.on('data', (chunk: Buffer) => this.writeChunk('stdout', chunk))
    child.stderr.on('data', (chunk: Buffer) => this.writeChunk('stderr', chunk))
    child.once('error', (error) => {
      if (this.child !== child) return
      this.child = undefined
      this.setState('failed', `Harness could not start: ${error.message}`)
    })
    child.once('exit', (code, signal) => {
      if (this.child !== child) return
      this.child = undefined
      const detail = signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`
      this.setState('failed', `Harness stopped unexpectedly (${detail}).`)
    })

    const ready = await waitUntilReady(
      url,
      () => this.child === child && child.exitCode === null,
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

  private async stopChild(child: ChildProcessWithoutNullStreams): Promise<void> {
    if (child.exitCode !== null) return
    child.kill('SIGTERM')
    const exited = await Promise.race([
      new Promise<boolean>((resolve) => child.once('exit', () => resolve(true))),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 4_000))
    ])
    if (!exited && child.exitCode === null) child.kill('SIGKILL')
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
