import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { projectRoot } from './patch-path'

// The Harness resolves its native system primitives through
// @deepseek-ai/node-addon-system/<subpath>, whose per-arch package
// (@deepseek-ai/node-addon-system-<platform>-<arch>) npm does not publish for
// linux-loong64. Without it every session write dies with
// "Cannot find module '@deepseek-ai/node-addon-system-linux-loong64/package.json'".
// The loong64 branch therefore commits a prebuilt tarball and declares it as a
// file: dependency. These assertions pin the tarball to the exact package name,
// subpaths and machine architecture the runtime loader requires, so a wrong or
// truncated artifact fails CI instead of the shipped app.
const PLATFORM_PACKAGE = '@deepseek-ai/node-addon-system-linux-loong64'
const TARBALL = join(projectRoot, 'platform-pkgs', 'system.tgz')
const EM_LOONGARCH = 258

function tarEntries(archive: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>()
  let offset = 0
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512)
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
    if (name === '') break
    const sizeField = header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim()
    const size = Number.parseInt(sizeField, 8) || 0
    const dataStart = offset + 512
    entries.set(name, archive.subarray(dataStart, dataStart + size))
    offset = dataStart + Math.ceil(size / 512) * 512
  }
  return entries
}

function elfMachine(buffer: Buffer | undefined): number | undefined {
  if (!buffer || buffer.length < 20) return undefined
  const isElf =
    buffer.readUInt8(0) === 0x7f &&
    buffer.readUInt8(1) === 0x45 &&
    buffer.readUInt8(2) === 0x4c &&
    buffer.readUInt8(3) === 0x46
  return isElf ? buffer.readUInt16LE(18) : undefined
}

const entries = tarEntries(gunzipSync(readFileSync(TARBALL)))

function entry(name: string): Buffer {
  const value = entries.get(name)
  if (!value) throw new Error(`missing ${name} in ${TARBALL}`)
  return value
}

describe('loong64 node-addon-system tarball', () => {
  it('carries the per-arch package name the loader resolves', () => {
    const manifest = JSON.parse(entry('package/package.json').toString('utf8')) as {
      name: string
      os: string[]
      cpu: string[]
    }
    expect(manifest.name).toBe(PLATFORM_PACKAGE)
    expect(manifest.os).toEqual(['linux'])
    expect(manifest.cpu).toEqual(['loong64'])
  })

  it('provides the glibc flock addon the runtime loads (bin/glibc/system.node)', () => {
    const addon = entry('package/bin/glibc/system.node')
    expect(elfMachine(addon)).toBe(EM_LOONGARCH)
    expect(addon.readUInt16LE(16)).toBe(3) // ET_DYN: a shared object, not an executable
  })

  it('provides the Landlock launcher (bin/landlock-run) for the sandbox seam', () => {
    expect(elfMachine(entry('package/bin/landlock-run'))).toBe(EM_LOONGARCH)
  })

  it('is declared as a file dependency so electron-builder keeps it in the deb', () => {
    const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(pkg.dependencies[PLATFORM_PACKAGE]).toBe('file:platform-pkgs/system.tgz')
  })

  it('is injected by the packaging script and built by the setup script', () => {
    const pack = readFileSync(join(projectRoot, 'scripts', 'loong64-package.sh'), 'utf8')
    expect(pack).toMatch(/ensure_system_addon_loong64\b/)
    expect(pack).toMatch(/^ {2}ensure_system_addon_loong64$/m)
    const setup = readFileSync(join(projectRoot, 'scripts', 'loong64-setup.sh'), 'utf8')
    expect(setup).toMatch(/pack_tgz "\$PKGS\/system-loong64" "\$PKGS\/system\.tgz"/)
  })
})
