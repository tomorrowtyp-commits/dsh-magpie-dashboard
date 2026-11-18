window.__ModuleLoader__.load({
  id: 'dsh-magpie-dashboard',
  factory: (require) => {
    const module = { exports: {} }
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback } = React
    const API = 'api/quota-dashboard/'
    const url = (path) => new URL(API + path, document.baseURI).href
    const palette = { ink: 'var(--dsh-text-primary, #e7e9ef)', muted: 'var(--dsh-text-secondary, #9ca4b5)', panel: 'var(--dsh-surface, #202632)', border: 'var(--dsh-border, #41495a)', blue: '#657eff', teal: '#13bda1', red: '#ec7981' }
    const row = { display: 'flex', alignItems: 'center', gap: 10 }
    const button = { color: palette.ink, background: 'transparent', border: `1px solid ${palette.border}`, borderRadius: 9, padding: '8px 12px', cursor: 'pointer', font: 'inherit' }
    const providerHeading = { color: palette.muted, fontSize: 12 }
    // Agents exposed by the Magpie browser sign-in route.
    const ADD_AGENT_OPTIONS = [
      { agent: 'workbuddy', label: 'WorkBuddy 国内版' },
      { agent: 'workbuddy-ai', label: 'WorkBuddy 国际版' },
      { agent: 'claude', label: 'Claude' },
      { agent: 'codex', label: 'ChatGPT / Codex' },
      { agent: 'gemini', label: 'Google / Gemini CLI' },
      { agent: 'antigravity', label: 'Antigravity' },
      { agent: 'copilot', label: 'GitHub Copilot' }
    ]
    async function call(path, payload) {
      const response = await fetch(url(path), payload === undefined
        ? { credentials: 'same-origin', cache: 'no-store' }
        : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
      return data
    }
    const time = (value) => value ? new Date(value).toLocaleString() : '未知'
    const compactTime = (value) => value ? new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '未知时间'
    const codexWindowLabel = (window) => window.minutes == null ? window.label : window.minutes <= 360 ? `${Math.round(window.minutes / 60)}h` : window.minutes >= 10080 ? 'week' : window.label
    function Glyph({ active }) {
      return h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, style: { opacity: active ? 1 : .75 } },
        h('rect', { x: 3, y: 4, width: 18, height: 16, rx: 3 }), h('path', { d: 'M7 15v-4m5 4V8m5 7v-3' }))
    }
    function RefreshGlyph() {
      return h('svg', { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M20 6v5h-5' }), h('path', { d: 'M4 18v-5h5' }), h('path', { d: 'M6.1 9a7 7 0 0 1 11.2-2.6L20 9M4 15l2.7 2.6A7 7 0 0 0 17.9 15' }))
    }
    function Bar({ left, total, color }) {
      const percent = total > 0 ? Math.max(0, Math.min(100, left / total * 100)) : 0
      return h('div', { style: { height: 6, background: palette.border, borderRadius: 999, overflow: 'hidden', margin: '8px 0 5px' }, role: 'progressbar', 'aria-valuenow': Math.round(percent), 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('div', { style: { height: '100%', width: `${percent}%`, background: color, borderRadius: 999 } }))
    }
    function domesticSummary(accounts) {
      return accounts.reduce((summary, account) => {
        if (account.status !== 'ok' || !account.data) return summary
        summary.okCount += 1
        summary.total += Number(account.data.total) || 0
        summary.left += Number(account.data.left) || 0
        summary.reserved += Number(account.data.reserved) || 0
        return summary
      }, { okCount: 0, total: 0, left: 0, reserved: 0 })
    }
    function WorkBuddyGroup({ title, accounts, onRemove, onOpenTasks, tasksOpening, tasksDisabled }) {
      const summary = domesticSummary(accounts)
      return h('article', { style: { boxSizing: 'border-box', background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 14, padding: 18, minWidth: 0, height: '100%', boxShadow: '0 6px 18px rgba(0,0,0,.06)' } },
        h('div', { style: { ...row, justifyContent: 'space-between', flexWrap: 'wrap' } },
          h('div', { style: { ...row, flexWrap: 'wrap', gap: 8 } },
            h('div', { style: providerHeading }, title),
            onOpenTasks && h('button', { type: 'button', onClick: onOpenTasks, disabled: tasksDisabled, 'aria-busy': tasksOpening, title: tasksOpening ? '正在打开 WorkBuddy 任务看板' : '在本地浏览器打开 WorkBuddy 任务看板', style: { ...button, fontSize: 11, padding: '3px 8px', opacity: tasksDisabled ? .55 : 1 } }, tasksOpening ? '正在打开…' : '任务面板')),
          summary.okCount > 0
            ? h('strong', { title: '全部账号剩余积分 / 总积分', style: { fontSize: 15, fontVariantNumeric: 'tabular-nums' } }, `${summary.left.toLocaleString()} / ${summary.total.toLocaleString()}`)
            : h('span', { style: { color: palette.muted } }, '— / —')),
        h('div', { style: { marginTop: 14 } },
          accounts.map((account, index) => h('section', { key: account.id, style: { borderTop: index === 0 ? 0 : `1px solid ${palette.border}`, padding: `${index === 0 ? 0 : 14}px 0 7px`, minWidth: 0 } },
            h('div', { style: { ...row, justifyContent: 'space-between', minHeight: 24 } },
              account.accountName ? h('strong', { style: { fontSize: 13, overflowWrap: 'anywhere' } }, account.accountName) : h('span', null),
              h('div', { style: row },
                account.status === 'ok' && h('strong', { style: { fontSize: 13 } }, `${account.data.left.toLocaleString()} / ${account.data.total.toLocaleString()}`),
                onRemove && h(RemoveButton, { account, onRemove }))),
            account.status === 'error'
              ? h('p', { role: 'alert', style: { color: palette.red, fontSize: 12, lineHeight: 1.5, margin: '8px 0 0' } }, account.error)
              : account.status !== 'ok'
                ? h('p', { style: { color: palette.muted, fontSize: 12, margin: '8px 0 0' } }, account.status === 'empty' ? '暂无缓存' : '读取中…')
                : h(Bar, { left: account.data.left, total: account.data.total, color: palette.teal })))))
    }
    function RemoveButton({ account, onRemove }) {
      return h('button', {
        type: 'button',
        onClick: () => onRemove(account),
        title: '移除账号',
        style: { ...button, fontSize: 11, padding: '3px 8px', color: palette.muted, borderColor: palette.border }
      }, '移除账号')
    }
    function Card({ account, onRemove }) {
      const isBuddy = account.type === 'workbuddy'
      const isDeepSeek = account.data?.kind === 'deepseek'
      const heading = isBuddy ? `WorkBuddy · ${account.region === 'global' ? '国际' : '国内'}` : isDeepSeek ? (account.type === 'deepseek-account' ? 'DeepSeek · DSH 账号' : 'DeepSeek · API Key') : (account.providerName || (account.type === 'codex' ? 'Codex' : account.type))
      const data = account.data
      return h('article', { style: { boxSizing: 'border-box', background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 14, padding: 18, minWidth: 0, height: '100%', boxShadow: '0 6px 18px rgba(0,0,0,.06)' } },
        h('div', { style: { ...row, justifyContent: 'space-between', alignItems: 'flex-start' } },
          h('div', { style: { minWidth: 0 } }, h('div', { style: providerHeading }, heading), h('strong', { style: { display: 'block', marginTop: 3, fontSize: 15, lineHeight: 1.35, overflowWrap: 'anywhere' } }, account.accountName || account.label)),
          onRemove && h(RemoveButton, { account, onRemove })),
        account.status === 'error'
          ? h('p', { role: 'alert', style: { color: palette.red, fontSize: 13, lineHeight: 1.6 } }, account.error)
          : account.status !== 'ok'
            ? h('p', { style: { color: palette.muted } }, account.status === 'empty' ? '暂无缓存，请点击“刷新额度”。' : '读取中…')
            : isBuddy
              ? h('div', { style: { marginTop: 16 } },
                data.plan && h('div', { style: { color: palette.muted, fontSize: 13 } }, data.plan),
                h('div', { style: { ...row, justifyContent: 'space-between', marginTop: 9 } }, h('span', null, '剩余额度'), h('strong', { style: { fontSize: 24 } }, data.left.toLocaleString())),
                h(Bar, { left: data.left, total: data.total, color: palette.teal }),
                h('div', { style: { color: palette.muted, fontSize: 12 } }, `共 ${data.total.toLocaleString()} credits · 已预留 ${data.reserved.toLocaleString()}`))
              : isDeepSeek
                ? h('div', { style: { marginTop: 12 } },
                  data.available === false && h('p', { style: { color: palette.red, fontSize: 13 } }, '余额不足，无法继续调用 API'),
                  data.balances.map((balance) => h('div', { key: balance.currency, style: { margin: '14px 0' } },
                    h('div', { style: { ...row, justifyContent: 'space-between', alignItems: 'flex-end' } },
                      h('span', { style: { color: palette.muted, fontSize: 13 } }, `余额 / 充值总额 · ${balance.currency}`),
                      h('strong', { style: { fontSize: 17, lineHeight: 1.35, textAlign: 'right', fontVariantNumeric: 'tabular-nums' } }, `${balance.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / ${balance.toppedUp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)),
                    h(Bar, { left: balance.total, total: balance.toppedUp, color: palette.teal }),
                    h('div', { style: { color: palette.muted, fontSize: 12, marginTop: 5 } }, `赠送 ${balance.granted.toLocaleString(undefined, { maximumFractionDigits: 2 })}${balance.used ? ` · 已消费 ${balance.used.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ''}`))))
                : h('div', { style: { marginTop: 14 } },
                  data.allowed === false && h('p', { style: { color: palette.red } }, '当前已达到使用上限'),
                  data.windows.map((window, index) => h('div', { key: `${window.name}-${window.label}-${index}`, style: { margin: '14px 0' } },
                    h('div', { style: { ...row, justifyContent: 'space-between', gap: 14, fontSize: 13 } },
                      h('span', { style: { color: palette.muted } }, codexWindowLabel(window)),
                      h('strong', { style: { textAlign: 'right' } }, `${Math.round(window.leftPercent)}% · ${compactTime(window.resetsAt)} 重置`)),
                    h(Bar, { left: window.leftPercent, total: 100, color: palette.blue }))),
                  data.resetCredits && h('div', { style: { borderTop: `1px solid ${palette.border}`, paddingTop: 12, marginTop: 15, color: palette.muted, fontSize: 12 } }, `重置卡：${data.resetCredits.count} 张${data.resetCredits.expiresAt ? ` · ${compactTime(data.resetCredits.expiresAt)} 到期` : ''}`)))
    }
    function QuotaPage() {
      const [accounts, setAccounts] = useState([])
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState('')
      const [refreshing, setRefreshing] = useState(false)
      const [refreshedAt, setRefreshedAt] = useState(null)
      const [adding, setAdding] = useState(false)
      const [addMessage, setAddMessage] = useState(null)
      const [removeNotice, setRemoveNotice] = useState(null)
      const [openingPanel, setOpeningPanel] = useState('')
      const refresh = useCallback(async (isAlive = () => true) => {
        if (!isAlive()) return
        setRefreshing(true)
        try {
          const result = await call('usage/refresh', {})
          if (!isAlive()) return
          setAccounts(result.accounts); setRefreshedAt(result.refreshedAt); setError('')
        } catch (failure) { if (isAlive()) setError(failure.message) }
        finally { if (isAlive()) { setRefreshing(false); setLoading(false) } }
      }, [])
      useEffect(() => {
        let alive = true
        ;(async () => {
          try { const result = await call('usage'); if (alive) { setAccounts(result.accounts); setRefreshedAt(result.refreshedAt) } }
          catch { /* refresh below provides the actionable error */ }
          finally { if (alive) setLoading(false) }
          if (alive) await refresh(() => alive)
        })()
        return () => { alive = false }
      }, [refresh])
      // Magpie holds the OAuth state; the server opens the system browser.
      async function addAccount(agent) {
        if ((agent === 'workbuddy' || agent === 'workbuddy-ai') && !window.confirm('腾讯可能限制通过其他工具使用的 WorkBuddy 账号；国际版已有封禁案例。确认继续在浏览器中登录？')) return
        setAdding(true); setAddMessage(null); setRemoveNotice(null)
        try {
          const result = await call('accounts/add', { agent })
          const label = (ADD_AGENT_OPTIONS.find((option) => option.agent === result.agent) || {}).label || result.agent
          setAddMessage({ error: false, text: `已在默认浏览器打开 ${label} 登录页。完成后点“刷新额度”查看新账号。` })
        } catch (failure) { setAddMessage({ error: true, text: failure.message }) }
        finally { setAdding(false) }
      }
      async function openPanel(panel, label) {
        if (openingPanel) return
        setOpeningPanel(panel); setAddMessage(null); setRemoveNotice(null)
        try {
          await call('panels/open', { panel })
          setAddMessage({ error: false, text: `已在默认浏览器打开${label}。` })
        } catch (failure) { setAddMessage({ error: true, text: failure.message }) }
        finally { setOpeningPanel('') }
      }
      // Remove account is a placeholder for now: Magpie exposes no delete command.
      function removeAccount(account) {
        setAddMessage(null)
        setRemoveNotice({ error: false, text: `“移除账号”暂未接入：Magpie 目前没有删除账号的命令。需要移除 ${account.accountName || account.label || account.id} 时，请在 Magpie 中处理，或先在此处登记需求。` })
      }
      const domesticAccounts = accounts.filter((account) => account.type === 'workbuddy' && account.region !== 'global')
      const globalAccounts = accounts.filter((account) => account.type === 'workbuddy' && account.region === 'global')
      const standaloneAccounts = accounts.filter((account) => account.type !== 'workbuddy')
      return h('section', { style: { height: '100%', overflowY: 'auto', color: palette.ink, boxSizing: 'border-box', padding: '28px clamp(16px, 3.5vw, 44px) 42px', fontFamily: 'inherit', fontSize: 13 } },
        h('div', { style: { maxWidth: 1040, margin: '0 auto' } },
          h('header', { style: { ...row, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, paddingBottom: 18, borderBottom: `1px solid ${palette.border}` } },
            h('div', null, h('h1', { style: { fontSize: 25, lineHeight: 1.25, letterSpacing: '-.015em', margin: 0 } }, '额度概览'), h('p', { style: { color: palette.muted, margin: '6px 0 0', fontSize: 12, lineHeight: 1.55 } }, `WorkBuddy、DeepSeek 与 Codex · 进入时自动获取一次${refreshedAt ? ` · 上次 ${time(refreshedAt)}` : ''}`)),
            h('button', { type: 'button', onClick: () => refresh(), disabled: refreshing, 'aria-label': '刷新额度', title: refreshing ? '刷新中…' : '刷新额度', style: { ...button, width: 36, height: 36, padding: 0, display: 'grid', placeItems: 'center', opacity: refreshing ? .55 : 1 } }, h(RefreshGlyph))),
          h('div', { style: { ...row, flexWrap: 'wrap', gap: 8, marginTop: 14 } },
            h('span', { style: { color: palette.muted, fontSize: 12 } }, '添加账号：'),
            ADD_AGENT_OPTIONS.map((option) => h('button', {
              key: option.agent,
              type: 'button',
              disabled: adding,
              onClick: () => addAccount(option.agent),
              title: `在浏览器中登录 ${option.label}`,
              style: { ...button, fontSize: 12, padding: '6px 10px', opacity: adding ? .55 : 1 }
            }, option.label))),
          addMessage && h('p', { role: 'status', 'aria-live': 'polite', style: { color: addMessage.error ? palette.red : palette.teal, fontSize: 12, lineHeight: 1.6, margin: '10px 0 0' } }, addMessage.text),
          removeNotice && h('p', { role: 'status', 'aria-live': 'polite', style: { color: removeNotice.error ? palette.red : palette.muted, fontSize: 12, lineHeight: 1.6, margin: '10px 0 0' } }, removeNotice.text),
          error && h('p', { role: 'alert', style: { color: palette.red, margin: '16px 0 0' } }, error),
          !loading && h('div', { style: { ...row, flexWrap: 'wrap', gap: 8, margin: '20px 0 10px' } },
            h('h2', { style: { fontSize: 12, color: palette.muted, fontWeight: 500, margin: 0, letterSpacing: '.04em' } }, '账号额度'),
            h('button', { type: 'button', onClick: () => openPanel('magpie', ' Magpie 面板'), disabled: Boolean(openingPanel), 'aria-busy': openingPanel === 'magpie', title: openingPanel === 'magpie' ? '正在打开 Magpie 面板' : '在本地浏览器打开 Magpie 面板', style: { ...button, fontSize: 11, padding: '3px 8px', opacity: openingPanel ? .55 : 1 } }, openingPanel === 'magpie' ? '正在打开…' : 'Magpie')),
          loading ? h('p', { style: { color: palette.muted, marginTop: 25 } }, '正在读取账号…')
            : accounts.length ? h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))', alignItems: 'stretch', gap: 16 } },
              domesticAccounts.length ? h(WorkBuddyGroup, { key: 'workbuddy-cn', title: 'WorkBuddy 国内版', accounts: domesticAccounts, onRemove: removeAccount, onOpenTasks: () => openPanel('workbuddy-tasks', ' WorkBuddy 任务看板'), tasksOpening: openingPanel === 'workbuddy-tasks', tasksDisabled: Boolean(openingPanel) }) : null,
              globalAccounts.length ? h(WorkBuddyGroup, { key: 'workbuddy-global', title: 'WorkBuddy 国际版', accounts: globalAccounts, onRemove: removeAccount }) : null,
              standaloneAccounts.map((account) => h(Card, { key: account.id, account, onRemove: removeAccount })))
              : h('div', { style: { marginTop: 25, color: palette.muted } }, 'Magpie 中还没有可显示的绑定账号。'),
          h('p', { style: { color: palette.muted, fontSize: 12, lineHeight: 1.7, maxWidth: 650 } }, '账号与额度由本机 Magpie 提供。Codex 订阅额度与 OpenAI API 费用分开计算。各平台调整接口或登录失效时，会在账号卡片中显示错误。')))
    }
    function apply(ctx) {
      ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'quota-dashboard' }, QuotaPage)), 'quota-dashboard: panel')
      ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'quota-dashboard', order: 40, label: '额度概览' }, Glyph)), 'quota-dashboard: sidebar')
    }
    module.exports = { apply, inject: ['slots'], domesticSummary }
    return module.exports
  }
})
