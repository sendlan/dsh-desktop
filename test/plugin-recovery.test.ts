import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  profilePackageJsonPath,
  resetPluginProfile,
  uninstallPluginFromProfile
} from '../src/main/state/plugin-recovery'

describe('plugin-recovery', () => {
  const testDir = join(__dirname, '.temp-plugin-recovery-test')

  beforeEach(async () => {
    await mkdir(join(testDir, 'profiles', 'web'), { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('uninstalls specific offending plugin from package.json dependencies and bundles', async () => {
    const pkgPath = profilePackageJsonPath(testDir)
    const originalPkg = {
      name: 'dsh-profile-web',
      dependencies: {
        'dsh-better-sidebar': '^0.13.1',
        '@linxin666/dsh-web-ui-all': '^0.2.2',
        dshmarket: '1.9.0'
      },
      dsh: {
        profile: {
          bundles: [
            '@deepseek-ai/dsh-base',
            '@deepseek-ai/dsh-web-app',
            'dshmarket',
            'dsh-better-sidebar',
            '@linxin666/dsh-web-ui-all'
          ]
        }
      }
    }
    await writeFile(pkgPath, JSON.stringify(originalPkg, null, 2))

    const success = await uninstallPluginFromProfile(testDir, 'dsh-better-sidebar')
    expect(success).toBe(true)

    const updatedPkg = JSON.parse(await readFile(pkgPath, 'utf8'))
    expect(updatedPkg.dependencies).toEqual({
      '@linxin666/dsh-web-ui-all': '^0.2.2',
      dshmarket: '1.9.0'
    })
    expect(updatedPkg.dsh.profile.bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      'dshmarket',
      '@linxin666/dsh-web-ui-all'
    ])
  })

  it('returns false when package.json does not exist', async () => {
    const success = await uninstallPluginFromProfile(join(testDir, 'nonexistent'), 'some-plugin')
    expect(success).toBe(false)
  })

  it('returns false when plugin is not in package.json', async () => {
    const pkgPath = profilePackageJsonPath(testDir)
    await writeFile(
      pkgPath,
      JSON.stringify({
        dependencies: {
          dshmarket: '1.9.0'
        },
        dsh: {
          profile: {
            bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dshmarket']
          }
        }
      })
    )

    const success = await uninstallPluginFromProfile(testDir, 'non-existent-plugin')
    expect(success).toBe(false)
  })

  it('resets plugin profile by cleaning up specific failing plugin and related packages', async () => {
    const pkgPath = profilePackageJsonPath(testDir)
    const originalPkg = {
      name: 'dsh-profile-web',
      dependencies: {
        '@linxin666/dsh-web-ui-all': '^0.2.2',
        dshmarket: '1.9.0'
      },
      dsh: {
        profile: {
          bundles: [
            '@deepseek-ai/dsh-base',
            '@deepseek-ai/dsh-web-app',
            'dshmarket',
            '@linxin666/dsh-web-ui-all'
          ]
        }
      }
    }
    await writeFile(pkgPath, JSON.stringify(originalPkg, null, 2))

    const success = await resetPluginProfile(testDir, '@linxin666/dsh-client-ui-web-ui-settings')
    expect(success).toBe(true)

    const updatedPkg = JSON.parse(await readFile(pkgPath, 'utf8'))
    expect(updatedPkg.dependencies).toEqual({
      dshmarket: '1.9.0'
    })
    expect(updatedPkg.dsh.profile.bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      'dshmarket'
    ])
  })
})
