import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCachedAccounts, parseMagpieAccounts } from '../lib/core.js'

test('maps Magpie Codex data to the existing dashboard card contract', () => {
  const [account] = parseMagpieAccounts([{
    agent: 'codex', user: 'person@example.com', plan: 'plus',
    windows: [{ name: '5 hours', used: 12, remaining: 88, resetsAt: '2026-11-11T04:04:11+08:00' }],
    readAt: '2026-11-10T23:16:43+08:00', resets: { count: 2, until: '2026-11-30T19:08:41Z' }
  }])
  assert.equal(account.type, 'codex')
  assert.equal(account.accountName, 'person@example.com')
  assert.equal(account.status, 'ok')
  assert.equal(account.data.kind, 'codex')
  assert.equal(account.data.windows[0].leftPercent, 88)
  assert.equal(account.data.windows[0].minutes, 300)
  assert.equal(account.data.resetCredits.count, 2)
  assert.equal(JSON.stringify(account).includes('token'), false)
})

test('maps Magpie WorkBuddy data to the existing grouped summary contract', () => {
  const [domestic, global, empty] = parseMagpieAccounts([
    { agent: 'workbuddy', user: 'today', plan: 'Free', windows: [{ name: 'Total credits', display: '125 / 500', remaining: 75 }] },
    { agent: 'workbuddy-ai', user: 'global', windows: [{ name: 'Credits', display: '20 / 100', remaining: 80 }] },
    { agent: 'claude', user: 'other', windows: [] }
  ])
  assert.deepEqual({ type: domestic.type, region: domestic.region, total: domestic.data.total, left: domestic.data.left }, { type: 'workbuddy', region: 'cn', total: 500, left: 375 })
  assert.equal(global.region, 'global')
  assert.equal(global.data.left, 80)
  assert.equal(empty.status, 'empty')
})

test('revalidates cached card data and drops credential-like fields', () => {
  const [account] = parseCachedAccounts([{
    type: 'codex', providerName: 'Codex', accountName: 'person@example.com', token: 'must-not-leak',
    data: { kind: 'codex', windows: [{ name: '5 hours', label: '5 hours', leftPercent: 80, minutes: 300, secret: 'hidden' }] }
  }])
  assert.equal(account.accountName, 'person@example.com')
  assert.equal(account.data.windows[0].leftPercent, 80)
  assert.equal(JSON.stringify(account).includes('must-not-leak'), false)
  assert.equal(JSON.stringify(account).includes('hidden'), false)
  assert.throws(() => parseCachedAccounts([null]), /账号无效/)
  assert.throws(() => parseCachedAccounts([{ type: 'codex' }]), /结构无效/)
})

test('rejects malformed Magpie output', () => {
  assert.throws(() => parseMagpieAccounts({}), /账号列表/)
  assert.throws(() => parseMagpieAccounts([{ agent: 'codex' }]), /缺少来源或账号名/)
})
