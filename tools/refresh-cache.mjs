import { apply } from '../lib/index.js'

const routes = new Map()
apply({
  effect: (fn) => fn(),
  connection: { fetch: { register: (route) => { routes.set(route.path, route); return () => {} } } }
})
const route = routes.get('/api/quota-dashboard/usage/refresh')
const response = await route.fetch(new Request('http://localhost/api/quota-dashboard/usage/refresh', { method: 'POST' }))
const payload = await response.json()
if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`)
console.log(JSON.stringify({ refreshedAt: payload.refreshedAt, accounts: payload.accounts.map((account) => ({ type: account.type, status: account.status, resetCredits: account.data?.resetCredits ?? null })) }, null, 2))
