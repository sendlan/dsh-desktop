import { describe, expect, it } from 'vitest'
import {
  renderDesktopPairingPage,
  renderMobilePage,
  renderPairingWaitPage
} from '../src/main/mobile/lan-mobile-pages'

describe('LAN mobile page', () => {
  it('emits parseable browser JavaScript', () => {
    const html = renderMobilePage({ locale: 'zh' })
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]!)
    expect(scripts).not.toHaveLength(0)
    for (const script of scripts) expect(() => new Function(script)).not.toThrow()
  })

  it('uses the DSH brand color and follows system dark mode', () => {
    const html = renderMobilePage({ locale: 'en' })
    expect(html).toContain('--brand:#4d6bfe')
    expect(html).toContain('prefers-color-scheme:dark')
    expect(html).toContain('/brand-logo/light')
    expect(html).toContain('id="chatTitle"')
    expect(html).toContain('class=\"skeleton\"')
    expect(html).toContain('agentRunning?250:750')
    expect(html).toContain("t==='user/message'")
    expect(html).toContain("message.source?.kind==='user'")
    expect(html).toContain("t==='assistant/message'")
    expect(html).not.toContain('id=\"stop\"')
    expect(html).toContain('id=\"cancel\"')
    expect(html).toContain("chunk.type==='text-delta'")
    expect(html).toContain("block?.type==='text'")
    expect(html).toContain('font-size:16px')
    expect(html).toContain('maximum-scale=1')
    expect(html).toContain("chunk.type!=='reasoning-delta'")
    expect(html).toContain('class=\"thinking\"')
    expect(html).toContain("streamKey=kind+':'+String(chunk.index??0)")
    expect(html).toContain("(streaming?' open':'')")
    expect(html).toContain('key=JSON.stringify(messages)')
    expect(html).toContain('class=\"tool\"')
    expect(html).toContain('function markdown(text)')
    expect(html).toContain('function tableCells(line)')
    expect(html).toContain('class=\"table-wrap\"')
    expect(html).toContain('.message.assistant+.message.assistant{margin-top:-8px}')
    expect(html).toContain('visualViewport')
    expect(html).toContain('var(--app-height,100dvh)')
    expect(html).toContain('id=\"workspaceHint\"')
    expect(html).toContain('id=\"newSession\" class=\"new-session\" disabled')
    expect(html).toContain('@keyframes connectedPulse')
    expect(html).not.toContain('Connected on local network')
  })

  it('uses DSH styling on both pairing surfaces', () => {
    const desktop = renderDesktopPairingPage({
      qrSvg: '<svg></svg>',
      pairingUrl: 'http://192.168.1.2/pair?token=test',
      expiresAt: Date.now() + 60_000
    })
    const phone = renderPairingWaitPage('pairing-id')
    for (const html of [desktop, phone]) {
      expect(html).toContain('--brand:#4d6bfe')
      expect(html).toContain('/brand-logo/light')
      for (const script of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
        (match) => match[1]!
      ))
        expect(() => new Function(script)).not.toThrow()
    }
  })
})
