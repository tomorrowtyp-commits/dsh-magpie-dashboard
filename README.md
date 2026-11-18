# dsh-magpie-dashboard

DSH 插件：在左侧栏“额度概览”中显示本机 Magpie 已绑定账号的额度。

- 账号列表直接来自 `magpie accounts --json`
- 支持 Magpie 已识别的 Codex / ChatGPT、WorkBuddy 及其他订阅账号
- 显示各额度窗口的剩余比例、重置时间、套餐与重置卡
- “账号额度”后的“Magpie”按钮在系统默认浏览器打开本机 Magpie 面板
- WorkBuddy 国内版卡片的“任务面板”按钮按守护进程实际端口打开本机任务看板
- 插件不保存 Cookie、Token、API Key，也不维护第二份账号列表

## 前置条件

本机需要已安装 Magpie，并在 Magpie 中完成账号绑定。插件按以下顺序查找可执行文件：

1. 环境变量 `MAGPIE_EXE`
2. Windows 默认部署路径 `E:\Magpie\App\magpie.exe`
3. `PATH` 中的 `magpie.exe`（其他平台为 `magpie`）

可先用以下命令确认 Magpie 能返回账号：

```bash
magpie accounts --json
```

## 安装

以本地目录安装：

```bash
dsh plugin install file:/path/to/dsh-magpie-dashboard
```

或在 DSH 插件管理中以 `file:` 规格安装该目录。安装后刷新当前 DSH 页面，左侧出现“额度概览”。

## 工作方式

进入“额度概览”时，插件先显示上次的非敏感额度快照，再调用本机 Magpie 获取最新账号与额度。之后只在点击刷新时再次读取。

额度快照保存在 `$DSH_HOME/plugins/quota-dashboard/usage-cache.json`，只包含 Magpie 返回的账号显示名、套餐、额度窗口与读取时间，不含登录凭据。旧版本的 `accounts.json` 不再读取。

## 开发

```bash
node --test test/*.test.js
```

## 许可

MIT
