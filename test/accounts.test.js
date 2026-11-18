import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('registers Magpie-backed routes and a guarded account sign-in route', async () => {
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = join(tmpdir(), `dsh-quota-test-${randomUUID()}`)
  try {
    const { apply } = await import(`../lib/index.js?test=${randomUUID()}`)
    const routes = new Map()
    apply({ effect: (fn) => fn(), connection: { fetch: { register: (route) => { routes.set(route.path, route); return () => {} } } } })
    assert.equal(routes.has('/api/quota-dashboard/accounts'), false)
    assert.equal(routes.has('/api/quota-dashboard/usage'), true)
    assert.equal(routes.has('/api/quota-dashboard/usage/refresh'), true)
    assert.equal(routes.has('/api/quota-dashboard/workbuddy/checkin'), false)
    assert.equal(routes.has('/api/quota-dashboard/accounts/add'), true)
    assert.equal(routes.has('/api/quota-dashboard/panels/open'), true)
    const cached = await (await routes.get('/api/quota-dashboard/usage').fetch()).json()
    assert.deepEqual(cached, { accounts: [], refreshedAt: null })

    const refresh = routes.get('/api/quota-dashboard/usage/refresh')
    const form = await refresh.fetch(new Request('http://localhost/api/quota-dashboard/usage/refresh', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'x=1'
    }))
    assert.equal(form.status, 415)
    const crossSite = await refresh.fetch(new Request('http://localhost/api/quota-dashboard/usage/refresh', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}'
    }))
    assert.equal(crossSite.status, 403)
    const panels = routes.get('/api/quota-dashboard/panels/open')
    const invalidPanel = await panels.fetch(new Request('http://localhost/api/quota-dashboard/panels/open', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ panel: 'https://evil.example' })
    }))
    assert.equal(invalidPanel.status, 400)
    const crossSitePanel = await panels.fetch(new Request('http://localhost/api/quota-dashboard/panels/open', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: JSON.stringify({ panel: 'magpie' })
    }))
    assert.equal(crossSitePanel.status, 403)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  }
})

test('account sign-in route only accepts known agents and never runs on cross-site posts', async () => {
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = join(tmpdir(), `dsh-quota-add-test-${randomUUID()}`)
  try {
    const { apply } = await import(`../lib/index.js?add=${randomUUID()}`)
    const routes = new Map()
    apply({ effect: (fn) => fn(), connection: { fetch: { register: (route) => { routes.set(route.path, route); return () => {} } } } })
    const add = routes.get('/api/quota-dashboard/accounts/add')
    const post = (body, headers = {}) => add.fetch(new Request('http://localhost/api/quota-dashboard/accounts/add', {
      method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body)
    }))

    // 任意参数都不得透传给 Magpie 可执行文件。
    assert.equal((await post({ agent: '--version' })).status, 400)
    assert.equal((await post({ agent: 'rm' })).status, 400)
    assert.equal((await post({})).status, 400)
    assert.equal((await post('not json')).status, 400)
    assert.equal((await post({ agent: 'claude' }, { origin: 'https://evil.example' })).status, 403)
    assert.equal((await add.fetch(new Request('http://localhost/api/quota-dashboard/accounts/add', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'agent=claude'
    }))).status, 415)

  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  }
})

test('WorkBuddy browser sign-in uses Magpie plugin OAuth and validates returned URL', async () => {
  const source = await readFile(new URL('../lib/index.js', import.meta.url), 'utf8')
  assert.match(source, /ADDABLE_AGENTS = new Set\(\['workbuddy', 'workbuddy-ai'/)
  assert.match(source, /'plugin-signin\/prompt'/)
  assert.match(source, /'plugin-signin'/)
  assert.match(source, /method: 0/)
  assert.match(source, /authorization\.protocol !== 'https:'/)
  assert.match(source, /authorization\.hostname !== 'www\.workbuddy\.ai'/)
  assert.match(source, /Start-Process -FilePath/)
  assert.match(source, /await openDefaultBrowser\(authorization\.href\)/)
  assert.doesNotMatch(source, /stdio: 'inherit'/)
})

test('local panel routes are allowlisted and resolve the live task port', async () => {
  const source = await readFile(new URL('../lib/index.js', import.meta.url), 'utf8')
  assert.match(source, /panel !== 'magpie' && panel !== 'workbuddy-tasks'/)
  assert.match(source, /\(await getWeb\(\)\)\.entryUrl/)
  assert.match(source, /workbuddy-tasks.*state.*daemon\.json/)
  assert.match(source, /hello\?\.name === 'workbuddy-tasks'/)
  assert.match(source, /await openDefaultBrowser\(target\)/)
})

test('cached snapshots are whitelisted before the API returns them', async () => {
  const previous = process.env.DSH_HOME
  const home = join(tmpdir(), `dsh-quota-cache-test-${randomUUID()}`)
  process.env.DSH_HOME = home
  try {
    const root = join(home, 'plugins', 'quota-dashboard')
    await mkdir(root, { recursive: true })
    await writeFile(join(root, 'usage-cache.json'), JSON.stringify({
      version: 2, source: 'magpie', refreshedAt: 123,
      accounts: [{ type: 'codex', providerName: 'Codex', accountName: 'safe@example.com', token: 'must-not-leak', data: { kind: 'codex', windows: [] } }]
    }))
    const { apply } = await import(`../lib/index.js?cache=${randomUUID()}`)
    const routes = new Map()
    apply({ effect: (fn) => fn(), connection: { fetch: { register: (route) => { routes.set(route.path, route); return () => {} } } } })
    const response = await routes.get('/api/quota-dashboard/usage').fetch()
    const body = await response.json()
    assert.equal(body.accounts[0].accountName, 'safe@example.com')
    assert.equal(JSON.stringify(body).includes('must-not-leak'), false)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  }
})
