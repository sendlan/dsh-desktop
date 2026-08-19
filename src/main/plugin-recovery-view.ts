import type { RuntimeSnapshot } from '../shared/contracts'

export type PluginRecoveryLocale = 'en' | 'zh'

export interface PluginRecoveryViewModel {
  locale: PluginRecoveryLocale
  brand: string
  badge: string
  status: string
  heading: string
  summary: string
  reasonTitle: string
  reasonDetail: string
  plugins: string[]
  removedPlugins: string[]
  progress?: string
  notice?: string
  safetyNote: string
  primaryLabel: string
  primaryBusyLabel: string
  logLabel: string
  advancedLabel: string
  technicalLabel: string
  launchDirectoryLabel: string
  launchDirectory?: string
  rawError: string
  quitLabel: string
  canUninstall: boolean
}

interface FailureDescription {
  title: string
  detail: string
}

function latestAttemptText(logs: readonly string[]): string {
  let startIndex = -1
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    if (logs[index]?.trimStart().startsWith('[desktop] starting ')) {
      startIndex = index
      break
    }
  }
  return logs.slice(startIndex + 1).join('\n')
}

export function describePluginFailure(
  logs: readonly string[],
  locale: PluginRecoveryLocale
): FailureDescription {
  const text = latestAttemptText(logs)
  const duplicateRoute = text.match(/duplicate prefix route ["']([^"']+)["']/i)?.[1]

  if (duplicateRoute) {
    return locale === 'zh'
      ? {
          title: '多个插件占用了同一个服务入口',
          detail: `它们都尝试使用 ${duplicateRoute}，Harness 无法判断应该由哪个插件处理。`
        }
      : {
          title: 'Multiple plugins claimed the same service route',
          detail: `They all tried to use ${duplicateRoute}, so Harness could not decide which plugin should handle it.`
        }
  }

  if (/cannot resolve profile bundle/i.test(text)) {
    return locale === 'zh'
      ? {
          title: '插件没有完整安装',
          detail: '配置中仍然引用了这个插件，但本地找不到对应的插件包。'
        }
      : {
          title: 'The plugin is not fully installed',
          detail: 'The profile still references this plugin, but its package cannot be found locally.'
        }
  }

  if (/declares no dsh\.bundle/i.test(text)) {
    return locale === 'zh'
      ? {
          title: '安装的包不是兼容的 DSH 插件',
          detail: '这个包缺少 DSH 插件所需的入口声明，因此 Harness 无法加载。'
        }
      : {
          title: 'The package is not a compatible DSH plugin',
          detail: 'It does not declare the entry point required by Harness.'
        }
  }

  if (/failed to import loader entry/i.test(text)) {
    return locale === 'zh'
      ? {
          title: '插件代码加载失败',
          detail: '插件文件可能损坏、缺少依赖，或与当前 Harness 版本不兼容。'
        }
      : {
          title: 'The plugin code could not be loaded',
          detail: 'Its files may be damaged, missing a dependency, or incompatible with this Harness version.'
        }
  }

  return locale === 'zh'
    ? {
        title: '插件启动时发生错误',
        detail: 'DSH Desktop 已定位到可能导致 Harness 无法启动的插件。'
      }
    : {
        title: 'A plugin failed during startup',
        detail: 'DSH Desktop identified the plugin or plugins that may be preventing Harness from starting.'
      }
}

export function buildPluginRecoveryViewModel(options: {
  snapshot: RuntimeSnapshot
  plugins: readonly string[]
  removedPlugins: readonly string[]
  locale: PluginRecoveryLocale
  notice?: string
}): PluginRecoveryViewModel {
  const { snapshot, locale, notice } = options
  const plugins = [...new Set(options.plugins)]
  const removedPlugins = [...new Set(options.removedPlugins)]
  const canUninstall = plugins.length > 0
  const description = describePluginFailure(snapshot.logs, locale)
  const multiple = plugins.length > 1

  if (locale === 'zh') {
    return {
      locale,
      brand: 'DSH Desktop',
      badge: '启动修复',
      status: '需要处理',
      heading: canUninstall
        ? multiple
          ? `发现 ${plugins.length} 个可能冲突的插件`
          : '发现一个可能冲突的插件'
        : 'Harness 暂时无法启动',
      summary: canUninstall
        ? '确认后只会移除下方列出的插件，然后自动重新启动并继续检查。'
        : '目前还无法定位到具体插件。请打开 Harness 日志查看详细错误。',
      reasonTitle: description.title,
      reasonDetail: description.detail,
      plugins,
      removedPlugins,
      progress: removedPlugins.length > 0
        ? `已处理 ${removedPlugins.length} 个插件，正在继续检查剩余问题。`
        : undefined,
      notice,
      safetyNote: '工作区、会话、模型配置和其他插件不会被删除。',
      primaryLabel: canUninstall
        ? multiple
          ? `卸载这 ${plugins.length} 个插件并继续检测`
          : '卸载此插件并继续检测'
        : '打开 Harness 日志',
      primaryBusyLabel: canUninstall ? '正在处理并重新检测…' : '正在打开日志…',
      logLabel: '打开 Harness 日志',
      advancedLabel: '高级排查',
      technicalLabel: '技术详情',
      launchDirectoryLabel: '启动目录',
      launchDirectory: snapshot.launchDirectory,
      rawError: snapshot.message,
      quitLabel: '退出 DSH Desktop',
      canUninstall
    }
  }

  return {
    locale,
    brand: 'DSH Desktop',
    badge: 'Startup recovery',
    status: 'Action required',
    heading: canUninstall
      ? multiple
        ? `${plugins.length} potentially conflicting plugins found`
        : 'A potentially conflicting plugin was found'
      : 'Harness could not start',
    summary: canUninstall
      ? 'Only the plugins listed below will be removed. Harness will then restart and continue checking.'
      : 'No specific plugin could be identified. Open the Harness log to inspect the detailed error.',
    reasonTitle: description.title,
    reasonDetail: description.detail,
    plugins,
    removedPlugins,
    progress: removedPlugins.length > 0
      ? `${removedPlugins.length} plugin${removedPlugins.length === 1 ? '' : 's'} handled. Checking for remaining issues.`
      : undefined,
    notice,
    safetyNote: 'Your workspaces, sessions, model settings, and other plugins will not be removed.',
    primaryLabel: canUninstall
      ? multiple
        ? `Remove these ${plugins.length} plugins and continue`
        : 'Remove this plugin and continue'
      : 'Open Harness log',
    primaryBusyLabel: canUninstall ? 'Removing and checking again…' : 'Opening log…',
    logLabel: 'Open Harness log',
    advancedLabel: 'Advanced troubleshooting',
    technicalLabel: 'Technical details',
    launchDirectoryLabel: 'Launch directory',
    launchDirectory: snapshot.launchDirectory,
    rawError: snapshot.message,
    quitLabel: 'Quit DSH Desktop',
    canUninstall
  }
}
