import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const files = []
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.git'].includes(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await walk(path)
    else files.push(path)
  }
}
await walk(root)

/** Patterns that must never appear in a publishable tree. */
const forbidden = [
  { name: 'private key block', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'cookie assignment', regex: /["']?\b(?:cookie|set-cookie)["']?\s*[:=]\s*["'][^"']{80,}/i },
  { name: 'bearer token literal', regex: /Bearer\s+[A-Za-z0-9._~+/=-]{30,}/ },
  { name: 'real-looking api key', regex: /\bsk-(?!test-)[A-Za-z0-9]{32,}/ },
  { name: 'dsh auth token literal', regex: /x-dsh-auth-token["']?\s*[:=]\s*["'][A-Za-z0-9+/=]{20,}/i },
  { name: 'long opaque secret field', regex: /["'](?:token|secret|apiKey|cookie|password)["']\s*:\s*["'][A-Za-z0-9._~+/=-]{30,}["']/i },
  { name: 'real user home path', regex: /[A-Za-z]:\\\\?Users\\\\?(?!me\b)[A-Za-z0-9._-]{2,}?\\\\?/i },
  { name: 'workbuddy session cookie', regex: /\bsession_?2?\s*=\s*[A-Za-z0-9%_-]{20,}/i }
]

const allowedSamples = [
  { file: /lib[\\/]client\.js$/, regex: /C:\\\\Users\\\\me\\\\\.codex/, reason: '文档示例路径' },
  { file: /test[\\/]deepseek-account\.test\.js$/, regex: /sk-test-0123456789abcdef/, reason: '测试用假 Key' }
]

const findings = []
const allowed = []
for (const file of files) {
  const name = relative(root, file).replace(/\\/g, '/')
  if (!/\.(js|mjs|cjs|json|ya?ml|md|ps1|py|txt)$/i.test(name)) continue
  const text = await readFile(file, 'utf8')
  for (const pattern of forbidden) {
    if (!pattern.regex.test(text)) continue
    const sample = pattern.regex.exec(text)[0]
    const permit = allowedSamples.find((item) => item.file.test(name) && item.regex.test(sample))
    const entry = { file: name, pattern: pattern.name, sample: sample.slice(0, 16) + '…' }
    if (permit) allowed.push({ ...entry, reason: permit.reason })
    else findings.push(entry)
  }
}

const sensitiveNames = ['accounts.json', '.credentials.yaml', '.env']
const sensitive = files.map((file) => relative(root, file).replace(/\\/g, '/')).filter((name) => sensitiveNames.includes(name.split('/').pop()))

console.log(JSON.stringify({ scanned: files.length, findings, allowed, sensitive }, null, 2))
if (findings.length || sensitive.length) process.exit(1)
