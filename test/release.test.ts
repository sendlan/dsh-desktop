import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = path.resolve(import.meta.dirname, '..')

const releaseAssets = [
  'dsh-desktop-linux-loong64.deb'
]

describe('GitHub release contract', () => {
  it('keeps the package and lockfile versions aligned', async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(projectRoot, 'package.json'), 'utf8')
    ) as { version: string }
    const packageLock = JSON.parse(
      await readFile(path.join(projectRoot, 'package-lock.json'), 'utf8')
    ) as { version: string; packages: Record<string, { version?: string }> }

    expect(packageLock.version).toBe(packageJson.version)
    expect(packageLock.packages['']?.version).toBe(packageJson.version)
  })

  it('declares required DSH peer packages as production dependencies', async () => {
    const packageLock = JSON.parse(
      await readFile(path.join(projectRoot, 'package-lock.json'), 'utf8')
    ) as {
      packages: Record<string, { dev?: boolean; peer?: boolean }>
    }

    const peerOnlyRuntimePackages = Object.entries(packageLock.packages)
      .filter(
        ([location, metadata]) =>
          location.startsWith('node_modules/@deepseek-ai/') &&
          metadata.peer === true &&
          metadata.dev !== true
      )
      .map(([location]) => location.replace('node_modules/', ''))

    expect(peerOnlyRuntimePackages).toEqual([])
  })

  it('uses stable platform-specific artifact names', async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(projectRoot, 'package.json'), 'utf8')
    ) as {
      build: {
        artifactName: string
        extraResources: Array<{ from: string; to: string }>
        linux: { target: Array<{ target: string }> }
        win: { target: Array<{ target: string; arch: string[] }> }
        nsis: { artifactName: string; include: string }
        portable?: unknown
      }
    }

    expect(packageJson.build.artifactName).toBe('dsh-desktop-${os}-${arch}.${ext}')
    expect(packageJson.build.extraResources).toContainEqual({
      from: 'build/app-icon.png',
      to: 'icon.png'
    })
    expect(packageJson.build.extraResources).toContainEqual({
      from: 'build/splash.html',
      to: 'splash.html'
    })
    expect(packageJson.build.extraResources).toContainEqual({
      from: 'build/dsh-loader.gif',
      to: 'dsh-loader.gif'
    })
    expect(packageJson.build.extraResources).toContainEqual({
      from: 'build/dsh-desktop.patch.yml',
      to: 'dsh-desktop.patch.yml'
    })
    expect(packageJson.build.nsis.artifactName).toBe(
      'dsh-desktop-windows-${arch}-setup.${ext}'
    )
    expect(packageJson.build.nsis.include).toBe('build/installer.nsh')
    expect(packageJson.build.win.target).toEqual([{ target: 'nsis', arch: ['x64'] }])
    expect(packageJson.build.portable).toBeUndefined()
    // The loong64 release ships the installable .deb plus the unpacked dir.
    expect(packageJson.build.linux.target).toEqual([
      { target: 'dir' },
      { target: 'deb' }
    ])
  })

  it('turns a selected Windows drive root into an application directory', async () => {
    const installer = await readFile(
      path.join(projectRoot, 'build', 'installer.nsh'),
      'utf8'
    )

    expect(installer).toContain('!define MUI_PAGE_CUSTOMFUNCTION_SHOW DshDirectoryPageShow')
    expect(installer).toContain('${NSD_OnChange} $DshDirectoryEdit DshDirectoryChanged')
    expect(installer).toContain('StrCpy $3 "$0\\${APP_FILENAME}"')
    expect(installer).toContain('StrCpy $3 "$0${APP_FILENAME}"')
    expect(installer).toContain('${NSD_SetText} $DshDirectoryEdit $3')
  })

  it('shows a packaged startup surface and pins the Electron directory picker surface', async () => {
    const main = await readFile(path.join(projectRoot, 'src', 'main', 'index.ts'), 'utf8')
    const splash = await readFile(path.join(projectRoot, 'build', 'splash.html'), 'utf8')
    const patch = await readFile(
      path.join(projectRoot, 'build', 'dsh-desktop.patch.yml'),
      'utf8'
    )

    expect(main).toContain("desktopResourcePath('splash.html')")
    expect(main).toContain('await showSplash()')
    expect(splash).toContain('Starting DSH Desktop')
    expect(splash).toContain('src="dsh-loader.gif"')
    expect(splash).not.toContain('class="track"')
    expect(patch).toMatch(/id: directory-picker\r?\n  disabled: true/)
    expect(patch).not.toContain("name: '@deepseek-ai/dsh-host-directory-picker-native'")
    expect(patch).toContain("name: '@deepseek-ai/dsh-client-ui-directory-picker-native'")
  })

  it('keeps the generic update provider for installed desktop builds', async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(projectRoot, 'package.json'), 'utf8')
    ) as {
      dependencies: Record<string, string>
      build: {
        publish: Array<{ provider: string; url?: string; owner?: string; repo?: string }>
        win: { verifyUpdateCodeSignature: boolean }
      }
    }

    expect(packageJson.dependencies['electron-updater']).toBeTruthy()
    expect(packageJson.build.publish).toEqual([
      { provider: 'generic', url: 'https://dshdesktop.com/updates/latest/' }
    ])
    expect(packageJson.build.win.verifyUpdateCodeSignature).toBe(false)
  })

  it('keeps builder jobs from attempting implicit tag publishing', async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(projectRoot, 'package.json'), 'utf8')
    ) as { scripts: Record<string, string> }

    for (const script of [
      'package:mac',
      'package:mac:arm64',
      'package:mac:x64',
      'package:win',
      'package:linux:loong64'
    ]) {
      expect(packageJson.scripts[script]).toContain('--publish never')
    }
  })

  it('downloads the electron runtime only on loongarch64 hosts', async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(projectRoot, 'package.json'), 'utf8')
    ) as { scripts: Record<string, string> }

    // The electron mirror is loong64-only, so hosted x64 runners must not try
    // to download the electron binary during npm ci.
    expect(packageJson.scripts.postinstall).toContain('loong64-setup.sh')
    expect(packageJson.scripts.postinstall).toContain(
      'if [ "$(uname -m)" = "loongarch64" ]; then install-electron --no; fi'
    )
  })

  it('packages an isolated development channel from the current workspace', async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(projectRoot, 'package.json'), 'utf8')
    ) as { scripts: Record<string, string> }
    const developmentConfig = await readFile(
      path.join(projectRoot, 'electron-builder.dev.cjs'),
      'utf8'
    )
    const main = await readFile(path.join(projectRoot, 'src', 'main', 'index.ts'), 'utf8')

    expect(packageJson.scripts['package:dev:dir']).toContain('npm run build')
    expect(packageJson.scripts['package:dev:dir']).toContain('electron-builder.dev.cjs')
    expect(packageJson.scripts['package:dev:win']).toContain('verify-target.mjs win32 x64')
    expect(packageJson.scripts['package:dev:win']).toContain('electron-builder.dev.cjs')
    expect(packageJson.scripts['package:dev:win']).toContain('--publish never')
    expect(developmentConfig).toContain("appId: 'io.dsh.desktop.dev'")
    expect(developmentConfig).toContain("productName: 'DSH Desktop Dev'")
    expect(developmentConfig).toContain("output: 'dist-dev'")
    expect(developmentConfig).toContain("dshDesktopChannel: 'development'")
    expect(developmentConfig).toContain(
      "artifactName: 'dsh-desktop-dev-windows-${arch}-setup.${ext}'"
    )
    expect(main).toContain("app.setPath('userData', join(app.getPath('appData'), 'dsh-desktop-dev'))")
    expect(main).toContain("app.setPath('userData', join(app.getPath('appData'), 'dsh-desktop'))")
    expect(main).toContain('if (!developmentBuild)')
  })

  it('runs quality checks on hosted runners and publishes loong64 releases only', async () => {
    const workflow = await readFile(
      path.join(projectRoot, '.github', 'workflows', 'release.yml'),
      'utf8'
    )

    // Quality gate on GitHub-hosted runners.
    expect(workflow).toContain('runs-on: ubuntu-latest')
    expect(workflow).not.toContain('ELECTRON_MIRROR')
    expect(workflow).toContain('npm ci')
    expect(workflow).toContain('npm test')
    expect(workflow).toContain('npm run typecheck')

    // Publish-only release flow (the .deb is built on a real loong64 machine).
    expect(workflow).toContain('gh release create')
    expect(workflow).toContain('--verify-tag')
    expect(workflow).toContain('gh release upload')
    expect(workflow).toContain('dsh-desktop-linux-loong64.deb')
    expect(workflow).toContain('release_tag:')
    expect(workflow).toContain('COS_SECRET_ID')
    expect(workflow).toContain('coscli')
    for (const asset of releaseAssets) expect(workflow).toContain(asset)
  })

  it('no longer builds or signs macOS/Windows packages', async () => {
    const workflow = await readFile(
      path.join(projectRoot, '.github', 'workflows', 'release.yml'),
      'utf8'
    )

    expect(workflow).not.toContain('runs-on: macos-15')
    expect(workflow).not.toContain('runs-on: macos-15-intel')
    expect(workflow).not.toContain('runs-on: windows-2022')
    expect(workflow).not.toContain('package:dev:win')
    expect(workflow).not.toContain('Smoke test packaged Windows Harness')
    expect(workflow).not.toContain('npm run package:mac')
    expect(workflow).not.toContain('npm run package:win')
    expect(workflow).not.toContain('DESKTOP_CSC_LINK')
    expect(workflow).not.toContain('DESKTOP_APPLE_API_KEY')
    expect(workflow).not.toContain('xcrun notarytool')
    expect(workflow).not.toContain('latest-mac-arm64.yml')
    expect(workflow).not.toContain('npm version')
  })

  it('keeps host-side synchronization out of GitHub Actions', async () => {
    await expect(
      readFile(path.join(projectRoot, '.github', 'workflows', 'sync-upstream.yml'), 'utf8')
    ).rejects.toThrow()
  })

  it('routes the published download through the official website', async () => {
    const readmes = await Promise.all(
      ['README.md', 'README.zh.md'].map((file) =>
        readFile(path.join(projectRoot, file), 'utf8')
      )
    )

    for (const readme of readmes) {
      expect(readme).toContain('https://www.dshdesktop.com/#download')
      expect(readme).not.toContain('| Platform | Package | Download |')
      expect(readme).not.toContain('| 平台 | 安装包 | 下载 |')
      expect(readme).not.toContain('Coming soon')
      expect(readme).not.toContain('即将发布')
      expect(readme).not.toContain('github.com/dataelement/dsh-desktop/releases')
      for (const asset of releaseAssets) {
        expect(readme).not.toContain(`releases/latest/download/${asset}`)
      }
    }
  })
})
