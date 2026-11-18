import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

test('client bundle registers a sidebar entry and matching main panel', async () => {
  const script = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  let definition
  runInNewContext(script, { window: { __ModuleLoader__: { load: (item) => { definition = item } } } })
  assert.equal(definition.id, 'dsh-magpie-dashboard')
  const plugin = definition.factory((id) => {
    assert.equal(id, 'react')
    return { createElement: () => null, useState: () => null, useEffect: () => null, useCallback: () => null }
  })
  const registered = []
  const ctx = { effect: (fn) => fn(), slots: { inject: (_name, fn) => fn(), register: (entry) => registered.push(entry) } }
  plugin.apply(ctx)
  assert.deepEqual(registered.map((entry) => entry.name), ['main', 'sidebar.panellist'])
  assert.equal(registered[0].key, registered[1].id)
})

test('panel shows the cached snapshot, fetches once on mount, and does not poll', async () => {
  const script = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  let definition
  const calls = []
  const effects = []
  // 沙箱需要提供 document 与 fetch：client.js 在模块作用域里直接引用它们。
  const sandbox = {
    window: { __ModuleLoader__: { load: (item) => { definition = item } } },
    document: { baseURI: 'http://localhost/' },
    fetch: async (target, init = {}) => {
      calls.push({ path: String(target), method: init.method || 'GET' })
      const body = String(target).endsWith('usage/refresh') ? { accounts: [], refreshedAt: 2 } : { accounts: [], refreshedAt: 1 }
      return { ok: true, status: 200, json: async () => body }
    },
    setTimeout,
    URL
  }
  runInNewContext(script, sandbox)
  const fakeReact = {
    // 只渲染面板 QuotaPage 本身；带 props 的函数组件（如图标、卡片）不渲染。
    createElement: (tag, props, ...children) => ({ tag, props, children }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useCallback: (fn) => fn,
    useEffect: (fn) => { effects.push(fn) }
  }
  const plugin = definition.factory(() => fakeReact)
  const registered = []
  const renders = []
  const ctx = {
    effect: (fn) => fn(),
    slots: {
      // inject 的回调才是真正的渲染入口：执行它就能拿到面板组件 QuotaPage。
      inject: (_name, fn) => fn(),
      // slots.register(元数据, 组件)：第二个参数才是面板组件 QuotaPage。
      register: (entry, component) => {
        registered.push(entry)
        if (typeof component === 'function') renders.push(component)
        return entry
      }
    }
  }
  plugin.apply(ctx)
  // 渲染面板 QuotaPage：收集它注册的副作用。
  const panel = renders.find((component) => component.name === 'QuotaPage')
  assert.ok(panel, '主面板组件应被注册')
  const tree = panel()
  // 面板只有一个副作用：进入时的那次加载，且不含定时器。
  assert.equal(effects.length, 1)
  assert.doesNotMatch(String(effects[0]), /setInterval|setTimeout/)
  const cleanup = effects[0]()
  // 该副作用返回清理函数，用于面板卸载后停止写入状态。
  assert.equal(typeof cleanup, 'function')
  await new Promise((resolve) => setTimeout(resolve, 50))
  // 先读缓存快照，再自动获取一次额度；没有重复或定时刷新。
  assert.deepEqual(calls, [
    { path: 'http://localhost/api/quota-dashboard/usage', method: 'GET' },
    { path: 'http://localhost/api/quota-dashboard/usage/refresh', method: 'POST' }
  ])
  const buttons = []
  function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk)
    if (!node || typeof node !== 'object') return
    if (node.tag === 'button') buttons.push(node)
    node.children.forEach(walk)
  }
  walk(tree)
  const reload = buttons.find((button) => button.props['aria-label'] === '刷新额度')
  assert.ok(reload)
  await reload.props.onClick({ type: 'click' })
  assert.equal(calls.length, 3)
  assert.deepEqual(calls[2], { path: 'http://localhost/api/quota-dashboard/usage/refresh', method: 'POST' })
  cleanup()
})

test('panel identifies Magpie as its account source and offers add and remove entry points', async () => {
  const script = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.match(script, /账号与额度由本机 Magpie 提供/)
  // 添加账号：直接调用后端，由 Magpie 自己完成登录，面板不收集任何账号数据。
  assert.match(script, /添加账号/)
  assert.match(script, /accounts\/add/)
  assert.match(script, /agent: 'workbuddy', label: 'WorkBuddy 国内版'/)
  assert.match(script, /agent: 'workbuddy-ai', label: 'WorkBuddy 国际版'/)
  assert.doesNotMatch(script, /window\.open\(/)
  assert.match(script, /已在默认浏览器打开/)
  assert.match(script, /'Magpie'/)
  assert.match(script, /'任务面板'/)
  assert.match(script, /openPanel\('magpie'/)
  assert.match(script, /openPanel\('workbuddy-tasks'/)
  assert.doesNotMatch(script, /window\.open\(/)
  // 移除账号：入口存在，暂为占位，不做本地删除。
  assert.match(script, /移除账号/)
  assert.doesNotMatch(script, /function Form|type: 'password'|input\b/)
  assert.match(script, /WorkBuddy 国内版/)
  assert.match(script, /WorkBuddy 国际版/)
  assert.doesNotMatch(script, /签到|workbuddy\/checkin/)
})

test('WorkBuddy group headings reuse the Codex provider heading style', async () => {
  const script = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.match(script, /const providerHeading = \{ color: palette\.muted, fontSize: 12 \}/)
  assert.match(script, /h\('div', \{ style: providerHeading \}, title\)/)
  assert.match(script, /h\('div', \{ style: providerHeading \}, heading\)/)
})
