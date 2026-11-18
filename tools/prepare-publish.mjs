/**
 * 发布前检查：确认仓库里不含真实登录信息，并验证插件基本结构。
 * 用法：node tools/prepare-publish.mjs [--commit] [--remote <url>]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const git = process.env.GIT_EXE || 'git'
const args = process.argv.slice(2)
const shouldCommit = args.includes('--commit')
const remoteIndex = args.indexOf('--remote')
const remote = remoteIndex === -1 ? null : args[remoteIndex + 1]

function run(command, commandArgs, options = {}) {
  if (options.stdio) {
    execFileSync(command, commandArgs, { cwd: root, encoding: 'utf8', ...options })
    return ''
  }
  return execFileSync(command, commandArgs, { cwd: root, encoding: 'utf8', ...options }).trim()
}

// 1. 结构检查
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
for (const field of ['name', 'version', 'main']) if (!manifest[field]) throw new Error(`package.json 缺少 ${field}`)
for (const file of ['lib/index.js', 'lib/client.js', 'lib/core.js', 'cordis.patch.yml', 'README.md', 'LICENSE', '.gitignore']) {
  if (!existsSync(join(root, file))) throw new Error(`缺少发布文件 ${file}`)
}
console.log(`manifest: ${manifest.name}@${manifest.version}`)

// 2. 登录信息扫描
run(process.execPath, ['tools/scan-secrets.mjs'], { stdio: 'inherit' })
console.log('secret scan: clean')

// 3. 初始化仓库
if (!existsSync(join(root, '.git'))) {
  run(git, ['init', '-b', 'main'])
  console.log('git: repository initialised (main)')
}

// 4. 只暂存允许发布的文件
const allow = ['package.json', 'cordis.patch.yml', 'README.md', 'LICENSE', '.gitignore', 'lib', 'test', 'tools']
run(git, ['add', '--', ...allow])
const staged = run(git, ['diff', '--cached', '--name-only']).split('\n').filter(Boolean)
const blocked = staged.filter((name) => /(^|\/)(accounts\.json|\.credentials\.yaml|\.env)$/.test(name) || name.endsWith('.tgz') || name.endsWith('interface-preview.png'))
if (blocked.length) {
  run(git, ['reset', '--', ...blocked])
  throw new Error(`以下文件禁止提交：${blocked.join(', ')}`)
}
console.log(`staged (${staged.length}):`)
for (const name of staged) console.log('  ' + name)

if (shouldCommit && staged.length) {
  run(git, ['commit', '-m', staged.includes('README.md') && !existsSync(join(root, '.git', 'refs', 'heads', 'main')) ? 'feat: DSH multi-account quota dashboard' : `chore: update quota dashboard`])
  console.log('committed: ' + run(git, ['log', '-1', '--pretty=%h %s']))
}

if (remote) {
  const hasRemote = run(git, ['remote']).split('\n').includes('origin')
  run(git, hasRemote ? ['remote', 'set-url', 'origin', remote] : ['remote', 'add', 'origin', remote])
  console.log('origin: ' + remote)
}
