import test from 'node:test'
import assert from 'node:assert/strict'
import { parseMagpieAccounts } from '../lib/core.js'

test('other Magpie percentage providers retain their provider heading', () => {
  const [account] = parseMagpieAccounts([{ provider: 'claude', name: 'Claude', user: 'team', windows: [{ name: '5 hours', remaining: 60 }] }])
  assert.equal(account.type, 'claude')
  assert.equal(account.providerName, 'Claude')
  assert.equal(account.data.windows[0].leftPercent, 60)
})
