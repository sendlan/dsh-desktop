import { describe, expect, it } from 'vitest'
import { buildHarnessArguments, buildNodeArguments } from '../src/main/runtime/harness-runtime'
import { canGrantWindowPermission, isTrustedAppUrl } from '../src/main/security-policy'
import { shouldLoadHarnessUrl } from '../src/main/window-navigation'

describe('Harness launch contract', () => {
  it('binds the web server to a random loopback port', () => {
    expect(buildHarnessArguments(43127)).toEqual([
      'web',
      '--host',
      '127.0.0.1',
      '--port',
      '43127'
    ])
  })

  it('grants Node internals only to the Harness child process', () => {
    expect(buildNodeArguments('/runtime/dsh.js', 43127)).toEqual([
      '--expose-internals',
      '/runtime/dsh.js',
      'web',
      '--host',
      '127.0.0.1',
      '--port',
      '43127'
    ])
  })
})

describe('navigation trust boundary', () => {
  it('only trusts the launcher and loopback HTTP pages', () => {
    expect(isTrustedAppUrl('file:///app/index.html')).toBe(true)
    expect(isTrustedAppUrl('http://127.0.0.1:43127')).toBe(true)
    expect(isTrustedAppUrl('http://localhost:43127')).toBe(true)
    expect(isTrustedAppUrl('https://127.0.0.1:43127')).toBe(false)
    expect(isTrustedAppUrl('http://example.com')).toBe(false)
    expect(isTrustedAppUrl('javascript:alert(1)')).toBe(false)
  })

  it('only grants clipboard writes from the trusted main frame', () => {
    expect(
      canGrantWindowPermission(
        'clipboard-sanitized-write',
        'http://127.0.0.1:43127/session',
        true
      )
    ).toBe(true)
    expect(
      canGrantWindowPermission(
        'clipboard-sanitized-write',
        'http://localhost:43127/session',
        true
      )
    ).toBe(true)
    expect(
      canGrantWindowPermission('clipboard-read', 'http://127.0.0.1:43127/session', true)
    ).toBe(false)
    expect(
      canGrantWindowPermission(
        'clipboard-sanitized-write',
        'http://127.0.0.1:43127/session',
        false
      )
    ).toBe(false)
    expect(
      canGrantWindowPermission(
        'clipboard-sanitized-write',
        'https://example.com/session',
        true
      )
    ).toBe(false)
    expect(
      canGrantWindowPermission('clipboard-sanitized-write', 'file:///tmp/app.html', true)
    ).toBe(false)
  })
})

describe('Harness window activation', () => {
  it('preserves the current page when the existing Harness instance is focused again', () => {
    expect(
      shouldLoadHarnessUrl(
        'http://127.0.0.1:43127/settings/models',
        'http://127.0.0.1:43127'
      )
    ).toBe(false)
  })

  it('loads the page for a new window or a restarted Harness instance', () => {
    expect(shouldLoadHarnessUrl('about:blank', 'http://127.0.0.1:43127')).toBe(true)
    expect(
      shouldLoadHarnessUrl('http://127.0.0.1:43127/settings', 'http://127.0.0.1:43128')
    ).toBe(true)
  })
})
