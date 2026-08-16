import { describe, expect, it } from 'vitest'
import { renderMobilePage } from '../src/main/mobile/lan-mobile-pages'

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
    expect(html).toContain('>Sessions</button>')
    expect(html).toContain('class=\"skeleton\"')
    expect(html).toContain('},500)')
    expect(html).toContain("t==='user/message'")
    expect(html).toContain("message.source?.kind!=='user'")
    expect(html).toContain("t==='assistant/message'")
    expect(html).not.toContain('id=\"stop\"')
    expect(html).toContain('id=\"cancel\"')
  })
})
