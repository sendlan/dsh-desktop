window.__ModuleLoader__.load({
  id: 'dsh-desktop-market-installer',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')

    const NS = 'settings.desktopMarketInstaller'
    const STATUS_PATH = '/dsh-desktop/market-installer/status'
    const INSTALL_PATH = '/dsh-desktop/market-installer/install'
    const MARKET_REPOSITORY = 'https://github.com/dsh-market/dsh-market'

    const en = {
      nav: 'Plugin market',
      title: 'Plugin market',
      intro: 'Install dsh-market to browse, search, install, and manage community plugins inside DSH Desktop.',
      community: 'dsh-market is maintained by its community. Installing and using community plugins requires network access, and those plugins are not reviewed by DSH Desktop.',
      version: 'Recommended version',
      install: 'Install plugin market',
      installing: 'Installing plugin market…',
      installingHint: 'This can take a few minutes. Keep DSH Desktop open while pnpm downloads and configures the plugin.',
      installed: 'Plugin market installed',
      installedHint: 'Restart Harness once to load the complete market interface.',
      restart: 'Restart Harness',
      restarting: 'Restarting…',
      retry: 'Try again',
      incomplete: 'The previous installation is incomplete. Run the installer again to repair it.',
      failed: 'Plugin market could not be installed.',
      statusFailed: 'Could not read installation status.',
      repository: 'View dsh-market on GitHub',
      futureUpdates: 'After installation, dsh-market will notify you when its own updates are available.'
    }

    const zh = {
      nav: '插件市场',
      title: '插件市场',
      intro: '安装 dsh-market，在 DSH Desktop 内浏览、搜索、安装并管理社区插件。',
      community: 'dsh-market 由社区维护。安装和使用社区插件需要联网，这些插件不由 DSH Desktop 审核。',
      version: '推荐版本',
      install: '安装插件市场',
      installing: '正在安装插件市场…',
      installingHint: '下载和配置可能需要几分钟，请保持 DSH Desktop 处于打开状态。',
      installed: '插件市场已安装',
      installedHint: '重启一次 Harness，即可加载完整的插件市场界面。',
      restart: '重启 Harness',
      restarting: '正在重启…',
      retry: '重试',
      incomplete: '上一次安装没有完成，请重新运行安装以修复。',
      failed: '插件市场安装失败。',
      statusFailed: '无法读取安装状态。',
      repository: '在 GitHub 查看 dsh-market',
      futureUpdates: '安装后，dsh-market 会在有新版本时提示并提供升级。'
    }

    const css = `
      .dshDesktopMarketSection{box-sizing:border-box;max-width:720px;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:16px}
      .dshDesktopMarketTitle{margin:0;font-size:20px;font-weight:600;line-height:30px}
      .dshDesktopMarketIntro{margin:0;color:var(--dsw-alias-label-secondary);font-size:14px;line-height:22px}
      .dshDesktopMarketCard{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-module-platform);border-radius:14px;padding:22px;display:flex;flex-direction:column;gap:18px}
      .dshDesktopMarketMark{width:46px;height:46px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);display:grid;grid-template-columns:repeat(2,10px);grid-auto-rows:10px;place-content:center;gap:4px}
      .dshDesktopMarketMark span{display:block;border-radius:3px;background:var(--dsw-alias-label-primary)}
      .dshDesktopMarketMark span:nth-child(4){opacity:.28}
      .dshDesktopMarketHead{display:flex;align-items:flex-start;gap:14px}
      .dshDesktopMarketIdentity{min-width:0;display:flex;flex-direction:column;gap:3px}
      .dshDesktopMarketName{font-size:16px;font-weight:600;line-height:24px}
      .dshDesktopMarketVersion{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
      .dshDesktopMarketNotice{margin:0;padding-top:16px;border-top:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:19px}
      .dshDesktopMarketStatus{display:flex;flex-direction:column;gap:5px}
      .dshDesktopMarketStatusTitle{font-size:14px;font-weight:600;line-height:22px}
      .dshDesktopMarketStatusDetail{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;overflow-wrap:anywhere}
      .dshDesktopMarketActions{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
      .dshDesktopMarketButton{box-sizing:border-box;height:36px;padding:0 16px;border:1px solid transparent;border-radius:18px;font:inherit;font-size:14px;font-weight:500;cursor:pointer}
      .dshDesktopMarketPrimary{color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-button-primary-fill)}
      .dshDesktopMarketPrimary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
      .dshDesktopMarketButton:disabled{cursor:default;opacity:.5}
      .dshDesktopMarketButton:focus-visible,.dshDesktopMarketLink:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}
      .dshDesktopMarketLink{color:var(--dsw-alias-label-secondary);border-radius:6px;padding:5px 4px;font-size:13px;line-height:20px;text-decoration:none}
      .dshDesktopMarketLink:hover{color:var(--dsw-alias-label-primary);text-decoration:underline}
      .dshDesktopMarketSpinner{box-sizing:border-box;width:16px;height:16px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-label-primary);border-radius:50%;animation:dshDesktopMarketSpin .75s linear infinite}
      .dshDesktopMarketBusy{display:flex;align-items:center;gap:9px}
      .dshDesktopMarketError{color:var(--dsw-alias-state-error-primary)}
      @keyframes dshDesktopMarketSpin{to{transform:rotate(360deg)}}
      @media (prefers-reduced-motion:reduce){.dshDesktopMarketSpinner{animation:none}}
    `

    function installStyles() {
      if (document.querySelector('style[data-plugin-css="dsh-desktop-market-installer"]')) return
      const style = document.createElement('style')
      style.dataset.plugin = 'dsh-desktop-market-installer'
      style.dataset.pluginCss = 'dsh-desktop-market-installer'
      style.textContent = css
      document.head.appendChild(style)
    }

    function marketAlreadyComposed() {
      const entries = globalThis.__DSH_BOOT__?.entries
      return Array.isArray(entries) && entries.some((entry) => entry?.id === 'dshmarket')
    }

    async function readStatus() {
      const response = await fetch(STATUS_PATH, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store'
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`)
      return payload
    }

    function MarketInstallerSection({ t }) {
      const [status, setStatus] = React.useState()
      const [error, setError] = React.useState()
      const [restarting, setRestarting] = React.useState(false)

      React.useEffect(() => {
        let disposed = false
        const load = async () => {
          try {
            const next = await readStatus()
            if (disposed) return
            setStatus(next)
            setError(undefined)
          } catch (failure) {
            if (!disposed) setError(failure instanceof Error ? failure.message : String(failure))
          }
        }
        void load()
        return () => {
          disposed = true
        }
      }, [])

      React.useEffect(() => {
        if (status?.phase !== 'installing') return
        let disposed = false
        let timer
        const poll = async () => {
          try {
            const next = await readStatus()
            if (disposed) return
            setStatus(next)
            setError(undefined)
            if (next.phase === 'installing') timer = setTimeout(poll, 850)
          } catch (failure) {
            if (disposed) return
            setError(failure instanceof Error ? failure.message : String(failure))
            timer = setTimeout(poll, 1_500)
          }
        }
        timer = setTimeout(poll, 850)
        return () => {
          disposed = true
          clearTimeout(timer)
        }
      }, [status?.phase])

      const install = async () => {
        setError(undefined)
        setStatus((current) => ({
          ...current,
          phase: 'installing',
          recommendedVersion: current?.recommendedVersion || '1.9.0'
        }))
        try {
          const response = await fetch(INSTALL_PATH, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { accept: 'application/json' }
          })
          const payload = await response.json()
          if (!response.ok && response.status !== 409) {
            throw new Error(payload?.error || `HTTP ${response.status}`)
          }
          setStatus(payload)
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
        }
      }

      const restart = async () => {
        const bridge = globalThis.dshDesktop
        if (!bridge || typeof bridge.restartHarness !== 'function') {
          setError('Harness > Restart Harness')
          return
        }
        setRestarting(true)
        setError(undefined)
        try {
          await bridge.restartHarness()
        } catch (failure) {
          setRestarting(false)
          setError(failure instanceof Error ? failure.message : String(failure))
        }
      }

      const phase = status?.phase
      const busy = phase === 'installing'
      const installed = phase === 'installed'
      const failed = phase === 'error' || phase === 'incomplete' || Boolean(error)
      const version = status?.recommendedVersion || '1.9.0'

      return React.createElement(
        'section',
        { className: 'dshDesktopMarketSection' },
        React.createElement('h2', { className: 'dshDesktopMarketTitle' }, t('title')),
        React.createElement('p', { className: 'dshDesktopMarketIntro' }, t('intro')),
        React.createElement(
          'div',
          { className: 'dshDesktopMarketCard' },
          React.createElement(
            'div',
            { className: 'dshDesktopMarketHead' },
            React.createElement(
              'div',
              { className: 'dshDesktopMarketMark', 'aria-hidden': 'true' },
              React.createElement('span'),
              React.createElement('span'),
              React.createElement('span'),
              React.createElement('span')
            ),
            React.createElement(
              'div',
              { className: 'dshDesktopMarketIdentity' },
              React.createElement('span', { className: 'dshDesktopMarketName' }, 'dsh-market'),
              React.createElement(
                'span',
                { className: 'dshDesktopMarketVersion' },
                `${t('version')} · ${version}`
              )
            )
          ),
          busy
            ? React.createElement(
                'div',
                { className: 'dshDesktopMarketStatus' },
                React.createElement(
                  'div',
                  { className: 'dshDesktopMarketBusy' },
                  React.createElement('span', {
                    className: 'dshDesktopMarketSpinner',
                    'aria-hidden': 'true'
                  }),
                  React.createElement(
                    'span',
                    { className: 'dshDesktopMarketStatusTitle' },
                    t('installing')
                  )
                ),
                React.createElement(
                  'p',
                  { className: 'dshDesktopMarketStatusDetail' },
                  status?.detail || t('installingHint')
                )
              )
            : installed
              ? React.createElement(
                  'div',
                  { className: 'dshDesktopMarketStatus' },
                  React.createElement(
                    'span',
                    { className: 'dshDesktopMarketStatusTitle' },
                    t('installed')
                  ),
                  React.createElement(
                    'p',
                    { className: 'dshDesktopMarketStatusDetail' },
                    t('installedHint')
                  )
                )
              : failed
                ? React.createElement(
                    'div',
                    { className: 'dshDesktopMarketStatus' },
                    React.createElement(
                      'span',
                      { className: 'dshDesktopMarketStatusTitle dshDesktopMarketError' },
                      phase === 'incomplete' ? t('incomplete') : t('failed')
                    ),
                    error || status?.detail
                      ? React.createElement(
                          'p',
                          { className: 'dshDesktopMarketStatusDetail dshDesktopMarketError' },
                          error || status?.detail
                        )
                      : null
                  )
                : null,
          React.createElement(
            'div',
            { className: 'dshDesktopMarketActions' },
            installed
              ? React.createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'dshDesktopMarketButton dshDesktopMarketPrimary',
                    disabled: restarting,
                    onClick: () => void restart()
                  },
                  restarting ? t('restarting') : t('restart')
                )
              : React.createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'dshDesktopMarketButton dshDesktopMarketPrimary',
                    disabled: busy || (!status && !error),
                    onClick: () => void install()
                  },
                  failed ? t('retry') : t('install')
                ),
            React.createElement(
              'a',
              {
                className: 'dshDesktopMarketLink',
                href: MARKET_REPOSITORY,
                target: '_blank',
                rel: 'noopener noreferrer'
              },
              t('repository')
            )
          ),
          React.createElement('p', { className: 'dshDesktopMarketNotice' }, t('community')),
          React.createElement('p', { className: 'dshDesktopMarketNotice' }, t('futureUpdates'))
        )
      )
    }

    const inject = ['slots', 'locale']
    function apply(ctx) {
      if (marketAlreadyComposed()) return
      installStyles()
      ctx.effect(
        () => ctx.locale.register(NS, { zh, en }),
        'dsh-desktop-market-installer: copy dictionaries'
      )
      const t = ctx.locale.bind(NS)
      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: 'market',
            order: 40,
            label: () => t('nav'),
            inject: () => ({ t })
          },
          MarketInstallerSection
        )
      )
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
