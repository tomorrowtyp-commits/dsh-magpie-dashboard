const number = (value) => {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

const string = (value, length = 160) => typeof value === 'string' && value.trim()
  ? value.trim().slice(0, length)
  : null

const timestamp = (value) => {
  const parsed = typeof value === 'number'
    ? (value > 1000000000000 ? value : value * 1000)
    : typeof value === 'string' ? Date.parse(value) : null
  return Number.isFinite(parsed) ? parsed : null
}

function amount(value) {
  if (typeof value !== 'string') return null
  const match = /^\s*([\d,.]+)\s*([KMB])?\s*$/i.exec(value)
  if (!match) return null
  const base = Number(match[1].replace(/,/g, ''))
  const scale = { K: 1e3, M: 1e6, B: 1e9 }[String(match[2] || '').toUpperCase()] || 1
  return Number.isFinite(base) ? base * scale : null
}

function displayedUsage(window) {
  if (typeof window?.display !== 'string') return null
  const parts = window.display.split('/')
  if (parts.length !== 2) return null
  const used = amount(parts[0])
  const total = amount(parts[1].replace(/^~/, ''))
  return used === null || total === null ? null : { used, total }
}

function windowMinutes(name) {
  const value = String(name || '').toLowerCase()
  const count = number(value.match(/[\d.]+/)?.[0])
  if (count === null) return null
  if (/hour|小时|\bh\b/.test(value)) return count * 60
  if (/day|天/.test(value)) return count * 1440
  if (/week|周/.test(value)) return count * 10080
  return null
}

function codexWindow(window, index) {
  if (!window || typeof window !== 'object') return null
  const leftPercent = number(window.remaining)
  if (leftPercent === null) return null
  const minutes = windowMinutes(window.name)
  return {
    name: string(window.name, 100) || `window-${index + 1}`,
    label: string(window.name, 100) || `额度 ${index + 1}`,
    leftPercent: Math.min(100, leftPercent),
    resetsAt: timestamp(window.resetsAt),
    minutes
  }
}

function workBuddyData(entry) {
  const windows = Array.isArray(entry.windows) ? entry.windows : []
  const target = windows.find((item) => /^total credits$/i.test(item?.name))
    || windows.find((item) => /^credits$/i.test(item?.name))
  const displayed = displayedUsage(target)
  const total = displayed?.total ?? number(target?.limit)
  const used = displayed?.used ?? number(target?.amount)
  if (total === null || used === null) return null
  return {
    kind: 'workbuddy',
    total,
    left: Math.max(0, total - used),
    reserved: 0,
    plan: string(entry.plan, 100)
  }
}

function codexData(entry) {
  const windows = (Array.isArray(entry.windows) ? entry.windows : []).map(codexWindow).filter(Boolean)
  if (!windows.length) return null
  const resets = entry.resets && typeof entry.resets === 'object'
    ? { count: number(entry.resets.count) ?? 0, expiresAt: timestamp(entry.resets.until) }
    : null
  return {
    kind: 'codex',
    windows,
    allowed: !string(entry.error, 240) && windows.some((item) => item.leftPercent > 0),
    credits: null,
    resetCredits: resets
  }
}

/** Convert Magpie output to the dashboard's existing account/card data contract. */
export function parseMagpieAccounts(payload) {
  if (!Array.isArray(payload)) throw new Error('Magpie 未返回账号列表')
  return payload.map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new Error(`Magpie 第 ${index + 1} 个账号无效`)
    const provider = string(entry.agent || entry.provider, 80)
    const accountName = string(entry.user, 160)
    if (!provider || !accountName) throw new Error(`Magpie 第 ${index + 1} 个账号缺少来源或账号名`)
    const isBuddy = provider === 'workbuddy' || provider === 'workbuddy-ai'
    const data = isBuddy ? workBuddyData(entry) : codexData(entry)
    const error = string(entry.error, 240)
    return {
      id: `${provider}:${accountName}:${index}`,
      type: isBuddy ? 'workbuddy' : provider,
      providerName: string(entry.name, 100) || (provider === 'codex' ? 'Codex' : provider),
      region: isBuddy ? (provider === 'workbuddy-ai' ? 'global' : 'cn') : null,
      accountName,
      label: accountName,
      status: error ? 'error' : data ? 'ok' : 'empty',
      error,
      fetchedAt: timestamp(entry.readAt) ?? Date.now(),
      data
    }
  })
}

/** Re-validate persisted snapshots while preserving the existing UI data contract. */
export function parseCachedAccounts(payload) {
  if (!Array.isArray(payload)) throw new Error('缓存未包含账号列表')
  return payload.map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new Error(`缓存中的第 ${index + 1} 个账号无效`)
    const type = string(entry.type, 80)
    const accountName = string(entry.accountName, 160)
    if (!type || !accountName) throw new Error(`缓存中的第 ${index + 1} 个账号结构无效`)
    const isBuddy = type === 'workbuddy'
    const data = entry.data && typeof entry.data === 'object'
      ? isBuddy
        ? {
            kind: 'workbuddy',
            total: number(entry.data.total) ?? 0,
            left: number(entry.data.left) ?? 0,
            reserved: number(entry.data.reserved) ?? 0,
            plan: string(entry.data.plan, 100)
          }
        : {
            kind: 'codex',
            windows: (Array.isArray(entry.data.windows) ? entry.data.windows : []).map((item, windowIndex) => ({
              name: string(item?.name, 100) || `window-${windowIndex + 1}`,
              label: string(item?.label, 100) || `额度 ${windowIndex + 1}`,
              leftPercent: Math.min(100, number(item?.leftPercent) ?? 0),
              resetsAt: timestamp(item?.resetsAt),
              minutes: number(item?.minutes)
            })),
            allowed: entry.data.allowed !== false,
            credits: null,
            resetCredits: entry.data.resetCredits && typeof entry.data.resetCredits === 'object'
              ? { count: number(entry.data.resetCredits.count) ?? 0, expiresAt: timestamp(entry.data.resetCredits.expiresAt) }
              : null
          }
      : null
    const error = string(entry.error, 240)
    return {
      id: `${type}:${accountName}:${index}`,
      type,
      providerName: string(entry.providerName, 100) || (type === 'codex' ? 'Codex' : type),
      region: isBuddy ? (entry.region === 'global' ? 'global' : 'cn') : null,
      accountName,
      label: accountName,
      status: error ? 'error' : data ? 'ok' : 'empty',
      error,
      fetchedAt: timestamp(entry.fetchedAt) ?? Date.now(),
      data
    }
  })
}
