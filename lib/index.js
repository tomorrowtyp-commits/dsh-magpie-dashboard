import { spawn } from 'node:child_process'
import { access, chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseCachedAccounts, parseMagpieAccounts } from './core.js'

export const inject = ['connection']
const API = '/api/quota-dashboard'
const ROOT = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'plugins', 'quota-dashboard')
const USAGE_CACHE = join(ROOT, 'usage-cache.json')
const reply = (value, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
const text = (value, length = 240) => String(value ?? '').slice(0, length)

async function loadUsageCache() {
  try {
    const data = JSON.parse((await readFile(USAGE_CACHE, 'utf8')).replace(/^\uFEFF/, ''))
    if (data?.version !== 2 || data?.source !== 'magpie') return null
    try {
      return { accounts: parseCachedAccounts(data.accounts), refreshedAt: Number(data.refreshedAt) || null }
    } catch { return null }
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null
    throw error
  }
}

async function saveUsageCache(accounts) {
  await mkdir(ROOT, { recursive: true })
  const snapshot = { version: 2, source: 'magpie', refreshedAt: Date.now(), accounts }
  const temporary = join(ROOT, `${randomUUID()}.usage.tmp`)
  await writeFile(temporary, JSON.stringify(snapshot), { mode: 0o600, flag: 'wx' })
  await chmod(temporary, 0o600)
  await rename(temporary, USAGE_CACHE)
  await chmod(USAGE_CACHE, 0o600)
  return snapshot
}

function executableCandidates() {
  return [...new Set([
    process.env.MAGPIE_EXE,
    process.platform === 'win32' ? 'E:\\Magpie\\App\\magpie.exe' : null,
    process.platform === 'win32' ? 'magpie.exe' : 'magpie'
  ].filter(Boolean))]
}

function terminate(child) {
  child.stdout?.destroy()
  child.stderr?.destroy()
  if (!child.pid || child.exitCode !== null) return
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
    killer.unref()
  } else {
    try { child.kill('SIGKILL') } catch { /* process already exited */ }
  }
}

function run(command, args, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let settled = false
    let timer
    const abort = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      terminate(child)
      reject(error)
    }
    child.once('error', abort)
    child.stdout.on('data', (chunk) => {
      if (settled) return
      stdout += chunk.toString('utf8')
      if (stdout.length > 2_000_000) abort(new Error('Magpie 返回的数据过大'))
    })
    child.stderr.on('data', (chunk) => {
      if (settled) return
      stderr += chunk.toString('utf8')
      if (stderr.length > 100_000) stderr = stderr.slice(-100_000)
    })
    child.once('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) reject(new Error(text(stderr.trim() || `Magpie 退出码 ${code}`)))
      else resolve(stdout)
    })
    timer = setTimeout(() => abort(new Error('Magpie 读取超时')), timeoutMs)
  })
}

async function magpie(args, timeoutMs) {
  let lastError
  for (const command of executableCandidates()) {
    if (/[/\\]/.test(command)) {
      try { await access(command) } catch { continue }
    }
    try { return await run(command, args, timeoutMs) }
    catch (error) {
      lastError = error
      if (error.code !== 'ENOENT') throw error
    }
  }
  throw lastError || new Error('未找到 Magpie，请设置 MAGPIE_EXE 或安装 magpie 命令')
}

async function readMagpieAccounts() {
  const raw = await magpie(['accounts', '--json'])
  let payload
  try { payload = JSON.parse(raw.replace(/^\uFEFF/, '')) }
  catch { throw new Error('Magpie 返回了无法识别的账号数据') }
  return parseMagpieAccounts(payload)
}

// Only these known agents may reach Magpie's local browser sign-in API.
const ADDABLE_AGENTS = new Set(['workbuddy', 'workbuddy-ai', 'claude', 'codex', 'gemini', 'antigravity', 'copilot'])

async function commandFor() {
  for (const command of executableCandidates()) {
    if (!/[/\\]/.test(command)) return command
    try { await access(command); return command } catch { /* try next */ }
  }
  throw new Error('未找到 Magpie，请设置 MAGPIE_EXE 或安装 magpie 命令')
}

// A private Magpie web instance owns the OAuth state. Its per-process web key
// is used server-side for OAuth calls. When the user explicitly opens the Magpie
// panel, the same local entry URL signs the browser in and immediately redirects
// to '/', so the key does not remain in the address bar.
function startMagpieWeb(command, onChild) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, ['web', '--addr', '127.0.0.1:0', '--no-open'], {
      shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
    })
    onChild(child)
    let output = ''
    let ready = false
    const timer = setTimeout(() => fail(new Error('Magpie 网页服务启动超时')), 15000)
    function fail(error) {
      if (ready) return
      ready = true
      clearTimeout(timer)
      terminate(child)
      reject(error)
    }
    child.once('error', fail)
    child.once('close', (code) => fail(new Error(`Magpie 网页服务已退出（${code}）`)))
    child.stderr.on('data', () => { /* drain without logging any secrets */ })
    child.stdout.on('data', (chunk) => {
      if (ready) return
      output = (output + chunk.toString('utf8')).slice(-8192)
      const match = output.match(/magpie web on (http:\/\/127\.0\.0\.1:\d+\/\?k=([a-zA-Z0-9._~-]+))/)
      if (!match) return
      ready = true
      clearTimeout(timer)
      resolve({ child, base: new URL(match[1]).origin, key: match[2], entryUrl: match[1] })
    })
  })
}

async function magpiePost(web, path, body) {
  const response = await fetch(`${web.base}/api/${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: web.cookie },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000)
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(text(payload?.error || `Magpie HTTP ${response.status}`))
  return payload
}

// Windows ShellExecute opens the default browser outside DSH's embedded page.
// Encode the script so OAuth query parameters cannot be interpreted by a shell.
async function openDefaultBrowser(url) {
  if (process.platform !== 'win32') throw new Error('当前系统暂不支持自动打开浏览器')
  const script = `$ErrorActionPreference = 'Stop'; Start-Process -FilePath '${url.replaceAll("'", "''")}'`
  try {
    await run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], 15000)
  } catch { throw new Error('系统无法打开默认浏览器，请检查浏览器的默认应用设置') }
}

const WORKBUDDY_DASHBOARD = join('workbuddy-tasks', 'state', 'daemon.json')

async function workBuddyDashboardUrl() {
  const configDirs = [...new Set([
    process.env.WB_CONFIG_DIR,
    process.env.MAGPIE_CONFIG_DIR,
    process.env.XDG_CONFIG_HOME ? join(process.env.XDG_CONFIG_HOME, 'magpie') : null,
    join(homedir(), '.config', 'magpie')
  ].filter(Boolean))]
  const candidates = []
  for (const configDir of configDirs) {
    try {
      const info = JSON.parse((await readFile(join(configDir, WORKBUDDY_DASHBOARD), 'utf8')).replace(/^\uFEFF/, ''))
      const port = Number(info?.port)
      if (Number.isInteger(port) && port >= 1 && port <= 65535) candidates.push(port)
    } catch { /* try the next Magpie config location */ }
  }
  candidates.push(4390)
  for (const port of new Set(candidates)) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/hello`, { signal: AbortSignal.timeout(1500) })
      const hello = response.ok ? await response.json() : null
      if (hello?.name === 'workbuddy-tasks') return `http://127.0.0.1:${port}/`
    } catch { /* stale daemon info or dashboard not running */ }
  }
  throw new Error('WorkBuddy 任务看板未运行，请先在 Magpie 中启用 WorkBuddy 任务插件')
}

function validateMutation(request) {
  if (!request?.headers?.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return reply({ error: '请发送 JSON 数据' }, 415)
  }
  const origin = request.headers.get('origin')
  if (origin) {
    let expected
    try { expected = new URL(request.url).origin } catch { return reply({ error: '请求来源无效' }, 403) }
    if (origin !== expected) return reply({ error: '拒绝跨站请求' }, 403)
  }
  return null
}

export function apply(ctx) {
  let refresh = Promise.resolve()
  let webChild = null
  let webStart = null
  let disposed = false
  const getWeb = () => {
    if (disposed) return Promise.reject(new Error('登录服务已停止'))
    if (!webStart) {
      let startingChild = null
      const pending = (async () => {
        const web = await startMagpieWeb(await commandFor(), (child) => {
          startingChild = child
          webChild = child
          child.once('close', () => {
            if (webChild === child) {
              webChild = null
              if (webStart === pending) webStart = null
            }
          })
        })
        let cookie
        let status = '连接中'
        for (let attempt = 0; attempt < 30 && !cookie && !disposed; attempt += 1) {
          try {
            const auth = await fetch(`${web.base}/?k=${encodeURIComponent(web.key)}`, { redirect: 'manual', signal: AbortSignal.timeout(2000) })
            status = auth.status
            if (auth.ok || (auth.status >= 300 && auth.status < 400)) cookie = auth.headers.get('set-cookie')?.split(';')[0]
          } catch { /* wait until the listener is ready */ }
          if (!cookie) await new Promise((resolve) => setTimeout(resolve, 150))
        }
        if (disposed || webChild !== web.child) throw new Error('登录服务已停止')
        if (!cookie) throw new Error(`Magpie 网页服务认证失败（HTTP ${status}）`)
        return { base: web.base, cookie, entryUrl: web.entryUrl }
      })()
      webStart = pending
      pending.catch(() => {
        if (webStart === pending) webStart = null
        if (startingChild && webChild === startingChild) { webChild = null; terminate(startingChild) }
      })
    }
    return webStart
  }
  ctx.effect(() => () => { disposed = true; if (webChild) terminate(webChild); webChild = null; webStart = null }, 'quota-dashboard: Magpie browser sign-in service')
  const serial = (task) => {
    const next = refresh.then(task)
    refresh = next.catch(() => {})
    return next
  }

  ctx.effect(() => ctx.connection.fetch.register({
    path: `${API}/usage`, methods: ['GET'], requestBody: 'buffered',
    fetch: async () => {
      try {
        const cached = await loadUsageCache()
        return reply(cached || { accounts: [], refreshedAt: null })
      } catch { return reply({ error: '读取额度缓存失败' }, 500) }
    }
  }), 'quota-dashboard: cached Magpie usage')

  ctx.effect(() => ctx.connection.fetch.register({
    path: `${API}/usage/refresh`, methods: ['POST'], requestBody: 'buffered',
    fetch: async (request) => {
      const denied = validateMutation(request)
      if (denied) return denied
      return serial(async () => {
        try { return reply(await saveUsageCache(await readMagpieAccounts())) }
        catch (error) { return reply({ error: text(error.message) }, 500) }
      })
    }
  }), 'quota-dashboard: refresh Magpie usage')

  ctx.effect(() => ctx.connection.fetch.register({
    path: `${API}/panels/open`, methods: ['POST'], requestBody: 'buffered',
    fetch: async (request) => {
      const denied = validateMutation(request)
      if (denied) return denied
      let panel
      try { panel = String(JSON.parse(await request.text() || '{}')?.panel ?? '') }
      catch { return reply({ error: '请发送 JSON 数据' }, 400) }
      if (panel !== 'magpie' && panel !== 'workbuddy-tasks') return reply({ error: '不支持的本地面板' }, 400)
      try {
        const target = panel === 'magpie' ? (await getWeb()).entryUrl : await workBuddyDashboardUrl()
        await openDefaultBrowser(target)
        return reply({ ok: true, panel })
      } catch (error) { return reply({ error: text(error.message) }, 500) }
    }
  }), 'quota-dashboard: open local panels')

  ctx.effect(() => ctx.connection.fetch.register({
    path: `${API}/accounts/add`, methods: ['POST'], requestBody: 'buffered',
    fetch: async (request) => {
      const denied = validateMutation(request)
      if (denied) return denied
      let agent
      try {
        const body = JSON.parse(await request.text() || '{}')
        agent = String(body?.agent ?? '').toLowerCase()
      } catch { return reply({ error: '请发送 JSON 数据' }, 400) }
      if (!ADDABLE_AGENTS.has(agent)) {
        return reply({ error: `不支持的账号类型：${text(agent, 40) || '（空）'}` }, 400)
      }
      try {
        const web = await getWeb()
        let result
        if (agent === 'workbuddy' || agent === 'workbuddy-ai') {
          const prompt = await magpiePost(web, 'plugin-signin/prompt', { provider: agent, method: 0, inputs: {} })
          if (prompt.prompt) throw new Error('此账号需要在 Magpie 网页中填写额外登录信息')
          result = await magpiePost(web, 'plugin-signin', { provider: agent, method: 0, inputs: prompt.inputs || {} })
        } else {
          result = await magpiePost(web, 'signin', { agent })
        }
        try {
          if (!result.url) throw new Error('Magpie 未返回浏览器登录地址，请在 Magpie 中添加此账号')
          const authorization = new URL(result.url)
          if (authorization.protocol !== 'https:') throw new Error('Magpie 返回的登录地址不安全')
          if (agent === 'workbuddy' && authorization.hostname !== 'www.workbuddy.cn') throw new Error('WorkBuddy 登录地址不匹配')
          if (agent === 'workbuddy-ai' && authorization.hostname !== 'www.workbuddy.ai') throw new Error('WorkBuddy AI 登录地址不匹配')
          await openDefaultBrowser(authorization.href)
          return reply({ ok: true, agent })
        } catch (error) {
          if (result.id) await magpiePost(web, `signin/${encodeURIComponent(result.id)}/cancel`, {}).catch(() => {})
          throw error
        }
      } catch (error) { return reply({ error: text(error.message) }, 500) }
    }
  }), 'quota-dashboard: open Magpie account sign-in')
}
