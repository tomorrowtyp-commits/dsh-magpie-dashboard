import { spawn } from 'node:child_process'

const command = process.argv[2] || 'codex'
const codexHome = process.argv[3] || process.env.CODEX_HOME
const env = { ...process.env, ...(codexHome ? { CODEX_HOME: codexHome } : {}) }
const child = spawn(command, ['app-server'], { env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'inherit'] })
let buffer = ''
const timer = setTimeout(() => { child.kill(); process.exitCode = 1 }, 15000)
const send = (value) => child.stdin.write(`${JSON.stringify(value)}\n`)
child.stdout.on('data', (chunk) => {
  buffer += chunk.toString('utf8')
  let end
  while ((end = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, end)
    buffer = buffer.slice(end + 1)
    let message
    try { message = JSON.parse(line) } catch { continue }
    if (message.id === 1) {
      send({ method: 'initialized', params: {} })
      send({ id: 2, method: 'account/rateLimits/read', params: {} })
    }
    if (message.id === 2) {
      console.log(JSON.stringify(message.result, null, 2))
      clearTimeout(timer)
      child.kill()
    }
  }
})
send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'dsh_quota_inspector', title: 'DSH Quota Inspector', version: '0.1.0' } } })
