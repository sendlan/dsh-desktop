import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export function profilePackageJsonPath(dshHome: string): string {
  return join(dshHome, 'profiles', 'web', 'package.json')
}

export function profileCordisPatchPath(dshHome: string): string {
  return join(dshHome, 'profiles', 'web', 'cordis.patch.yml')
}

interface ProfileManifest {
  name?: string
  private?: boolean
  dependencies?: Record<string, string>
  dsh?: {
    profile?: {
      bundles?: string[]
    }
  }
}

export async function uninstallPluginFromProfile(
  dshHome: string,
  pluginName: string
): Promise<boolean> {
  const manifestPath = profilePackageJsonPath(dshHome)
  if (!existsSync(manifestPath)) return false

  try {
    const raw = await readFile(manifestPath, 'utf8')
    const manifest = JSON.parse(raw) as ProfileManifest
    let modified = false

    if (manifest.dependencies && pluginName in manifest.dependencies) {
      delete manifest.dependencies[pluginName]
      modified = true
    }

    if (manifest.dsh?.profile?.bundles) {
      const originalLength = manifest.dsh.profile.bundles.length
      manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(
        (bundle) => bundle !== pluginName
      )
      if (manifest.dsh.profile.bundles.length !== originalLength) {
        modified = true
      }
    }

    if (modified) {
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
      return true
    }
  } catch {
    return false
  }

  return false
}

export async function resetPluginProfile(
  dshHome: string,
  failingPlugin?: string
): Promise<boolean> {
  const manifestPath = profilePackageJsonPath(dshHome)
  if (!existsSync(manifestPath)) return false

  try {
    const raw = await readFile(manifestPath, 'utf8')
    const manifest = JSON.parse(raw) as ProfileManifest

    if (failingPlugin) {
      const scope = failingPlugin.startsWith('@') ? failingPlugin.split('/')[0] : undefined
      if (manifest.dependencies) {
        delete manifest.dependencies[failingPlugin]
        for (const dep of Object.keys(manifest.dependencies)) {
          if (
            failingPlugin.includes(dep) ||
            dep.includes(failingPlugin) ||
            (scope && dep.startsWith(scope))
          ) {
            delete manifest.dependencies[dep]
          }
        }
      }
      if (manifest.dsh?.profile?.bundles) {
        manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(
          (b) =>
            b !== failingPlugin &&
            !failingPlugin.includes(b) &&
            !b.includes(failingPlugin) &&
            (!scope || !b.startsWith(scope))
        )
      }
    } else {
      // If no specific plugin given, reset bundles to safe core bundles
      const safeBundles = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']
      if (manifest.dependencies?.dshmarket) safeBundles.push('dshmarket')
      if (manifest.dsh?.profile?.bundles) {
        manifest.dsh.profile.bundles = safeBundles
      }
    }

    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')

    // Reset cordis.patch.yml to clean state
    const patchPath = profileCordisPatchPath(dshHome)
    if (existsSync(patchPath)) {
      await writeFile(patchPath, '[]\n', 'utf8')
    }

    return true
  } catch {
    return false
  }
}
