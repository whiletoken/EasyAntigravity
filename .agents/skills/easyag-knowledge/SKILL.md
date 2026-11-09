---
name: easyag-knowledge
description: >-
  EasyAntigravity (EasyAG) 架构全景与 Git 历史速查知识库。
  当需要了解项目架构、各模块职责与文件边界、分支演进、版本历史（v3 到 v4.0.4 Lite）、
  构建打包约定或避免盲目执行 git log / 无效遍历代码文件时，使用本技能。
---

# EasyAntigravity (EasyAG) 架构全景与开发历史手册

本技能为 EasyAntigravity 专属开发知识库，旨在**消除无效的 Git 历史查询**与**避免大范围盲读源代码**。在进行任何代码修改、功能新增、缺陷排查或打包发布前，请优先查阅本手册。

---

## 第一部分：Git 历史演进与分支全景（免查 Git Log）

### 1. 分支模型与用途
* **`main`**：当前主开发分支，仅维护 **v4.x Lite（超轻量版）** 代码。
* **`v3-pilot`**：历史归档分支（Tag: `v3.2.4`），保留了 Turbo Pilot、三级安全防线、ARES 风险胶囊及自定义危险命令拦截规则。
* **`cli-edition`**：独立开发的 CLI Companion 命令行辅助工具分支，不与桌面版/Lite 合并。

### 2. 核心版本演进里程碑
* **v3.2.4（历史完整防线版）**：
  - 核心功能：通过写入全局配置接管自动审批，配合 CDP 拦截高危命令并弹出风险提示胶囊。
  - 演进转折：随着官方 Antigravity 2.23+ 内置「Decide for me（自动审批）」生态，复杂的外部执行门禁不再必要，项目全面转型为轻量启动器。
* **v4.0.0 ~ v4.0.3 Lite（超轻量基座版）**：
  - 核心转型：**100% 零修改官方文件**，专注「免 TUN 代理注入」、「实时可逆 DOM 汉化」与「免重装热更新」。
  - v4.0.1：原生顶栏与面板浅色/深色主题双向联动同步。
  - v4.0.2 ~ v4.0.3：macOS 菜单栏驻留优化（关闭窗口自动隐藏 Dock 图标）、模型名称解析与输入框上下文圆环。
* **v4.0.4 Lite（当前版本）**：
  - **新增 Antigravity IDE 支持**：在启动器中支持选择「桌面版」或「IDE 版」，实现 IDE 进程代理注入。
  - **IDE 上下文圆环**：突破 IDE 单页无 URL 变化的限制，通过监听可见 Preact 组件的 `cascadeId`，读取语言服务只读 RPC，在输入框附近内嵌上下文 Token 占比与输出速度。
  - **安装路径弹窗**：支持自动发现、手动选择、路径恢复默认。
  - **构建打包重构**：引入统一的 `scripts/package.cjs` 与全动态 GitHub Actions，去除硬编码版本。

### 3. 发布物标准命名规范（勿执行猜解）
* Windows: `EasyAntigravity-${version}-${edition}-windows-x64.zip`
* macOS Apple Silicon: `EasyAntigravity-${version}-${edition}-macos-arm64-beta.zip`
* macOS Intel: `EasyAntigravity-${version}-${edition}-macos-x64-beta.zip`
* 产物统一输出至 `dist-tauri/`，附带同名 `.sha256` 校验和。

---

## 第二部分：架构分层与各模块职责边界（免盲读代码）

### 1. 分层架构图
```text
┌────────────────────────────────────────────────────────┐
│                   原生外壳 (Tauri v2 + Rust)            │
│  src-tauri/src/main.rs (窗口、托盘、Dock 隐藏、单实例)     │
└───────────────────────────┬────────────────────────────┘
                            │ stdin / stdout (JSON RPC)
┌───────────────────────────▼────────────────────────────┐
│              宿主组装与 API 服务 (Node.js CommonJS)      │
│  desktop/application.js (组装服务)                      │
│  desktop/api.js (本地回环 HTTP + SSE API)                │
│  desktop/host.js (与 Rust 进行 IPC 管道通信)            │
│  ui/ (Webview 面板前端：launcher.js, launcher.css)      │
└─────────────┬────────────────────────────┬─────────────┘
              │                            │
┌─────────────▼───────────────┐ ┌──────────▼─────────────┐
│       核心层 (core/)        │ │      功能特性 (features/) │
│ session.js (会话状态机)      │ │ proxy.js (代理参数拼装)  │
│ settings.js (配置存储与锁定) │ │ i18n.js (可逆 DOM 翻译)  │
│ storage.js (原子文件读写)   │ │ context-monitor.js(监控)│
│ events.js (全局事件总线)     │ │ context-widget.js(圆环) │
│                             │ │ updater.js (热更新引擎)  │
└─────────────┬───────────────┘ └──────────┬─────────────┘
              │                            │
┌─────────────▼────────────────────────────▼─────────────┐
│                  适配器层 (adapters/desktop/)           │
│ discovery.js (探测 AG 桌面端与 IDE 安装路径及进程)        │
│ cdp.js (WebSocket CDP 调试协议连接、脚本注入与重连)      │
│ language-service-discovery.js & language-service.js     │
│ (探测 IDE 对话后台进程 PID，探测回环只读 RPC 接口)        │
│ renderer.js (安全脚本序列化与注入代码生成)              │
└───────────────────────────┬────────────────────────────┘
                            │ CDP / RPC
┌───────────────────────────▼────────────────────────────┐
│           目标程序：Antigravity Desktop / IDE          │
└────────────────────────────────────────────────────────┘
```

### 2. 模块与文件职责明细速查

#### `core/` —— 核心服务层（无平台依赖，纯状态与逻辑）
- `session.js`：目标程序（桌面版 / IDE）生命周期状态机。负责防重复启动锁定、子进程 `spawn`、进程退出清理与恢复。
- `settings.js`：读取与验证 `settings.json`（代理端口、目标版本、自启动等）；**运行期间自动锁定配置禁止改动**。
- `storage.js`：提供带原子落盘机制的 JSON 文件读写工具函数。
- `events.js`：进程内全局 `EventEmitter`，分发运行日志、连接状态、上下文指标。

#### `features/` —— 业务特性层
- `proxy.js`：根据设置拼接 `--proxy-server=http://127.0.0.1:<port>` 参数，注入直连或免 TUN 代理。
- `i18n.js`：**可逆 DOM 汉化引擎**。通过 MutationObserver 动态替换文本节点，严格保留原文 Map；**关闭汉化即刻恢复英文**；**绝对跳过 `<code>`、`<pre>`、可编辑区与属性**。
- `context-monitor.js`：上下文使用率统计器。合并并发请求，抽取 Token 占用、模型采样名称、生成速度（tok/s）和首字延迟（TTFT）。
- `context-widget.js`：上下文指示圆环前端渲染脚本。**严格遵守 Trusted Types，禁止 `innerHTML`**，使用原生 DOM/SVG 插入在输入框旁。
- `conversation-context.js`：管理当前激活的会话 ID（`conversationId` / `cascadeId`）与上下文生命周期。
- `updater.js`：**零重装热更新器**。通过本地代理拉取 `update-manifest.json`，强校验 SHA-256 后增量热替换词典与后台 JS 补丁，校验失败自动回滚。

#### `adapters/desktop/` —— 目标宿主适配层
- `discovery.js`：扫描系统注册表、应用目录，自动定位 Antigravity 桌面端与 IDE 的可执行文件路径；支持跨平台路径标准化（Windows UNC 路径清洗）。
- `cdp.js`：基于 `ws` 库封装 Chrome DevTools Protocol 客户端。监听回环端口（如 `DevToolsActivePort`），负责 Attach 页面、脚本注入、网络与 DOM 监听、断开重连。
- `language-service-discovery.js` & `language-service.js`：针对 IDE 的专用适配器。通过进程树过滤掉代码补全（`--enable_lsp`），精确定位对话后台进程，探测专属回环端口并查询只读指标。
- `renderer.js`：负责将汉化词典、监控脚本安全序列化为可注入的 JavaScript 字符串。

#### `desktop/` —— 桌面组装与通讯层
- `application.js`：中央组装器。实例化 session、settings、adapters、features，协调启动与销毁全流程。
- `api.js`：轻量回环 HTTP 服务器，为 UI 面板提供 REST 接口与 Server-Sent Events (SSE) 实时事件推流。
- `host.js`：监听 stdin 并输出 JSON 到 stdout，处理与 Tauri 原生 Rust 进程的底层 IPC 信号。

#### `ui/` —— 前端交互面板
- `launcher.js` & `launcher.css` & `api.js`：纯原生 Web 面板。提供启动按钮、目标切换（桌面/IDE）、代理开关与端口配置、路径弹窗、更新检查与深浅主题自适应。

#### `dicts/` —— 词典资源
- `common.json`：高频基础词条。
- `ui_v2.json`：3,000+ 条针对 Antigravity 深度校对的精准翻译词典。

#### `src-tauri/` —— 原生桌面外壳
- `src/main.rs`：Tauri 主入口。处理系统托盘菜单、单实例互斥锁（Single Instance）、窗口隐藏/还原、macOS Dock 图标隐藏。
- `Entitlements.plist`：**macOS 签名特权配置**。必须声明 `com.apple.security.cs.allow-jit` 和 `allow-unsigned-executable-memory`，否则 Node V8 在 Apple Silicon 上直接因 SIGTRAP（退出码 133）崩溃。
- `tauri.conf.json`：Tauri 构建与窗口配置。

#### `scripts/` —— 工程化与构建脚本
- `package.cjs`：**统一跨平台打包主脚本**。负责前置测试、运行时提取、Tauri 编译、macOS JIT 签名、Windows 绿色归档与 SHA256 输出。
- `prepare-tauri.cjs`：在构建前将当前平台 Node 运行时复制为 `easyag-node` 并预签名。
- `backend-resources.cjs`：定义打进分发包中的白名单文件与目录列表。
- `check.cjs`：语法与模块依赖静态健康检查。
- `build-update-manifest.cjs`：计算词典与文件的 SHA-256 并更新热更新清单。
- `bump-version.cjs`：**原子化版本升级脚本**。同步更新 `package.json`、`package-lock.json`、`tauri.conf.json`、`Cargo.toml`、`index.html` 并重新生成 `update-manifest.json`，支持 patch/minor/major 及 GitHub Actions 打包自动提版。

---

## 第三部分：核心设计准则与开发防踩坑手册

1. **绝对不要破坏零侵入原则**：
   - EasyAG 绝不直接改动 Antigravity 安装目录中的任何核心文件。汉化、监控全靠运行时 CDP 注入。
2. **IDE 注入必须遵循 Trusted Types**：
   - Antigravity IDE 开启了 CSP Trusted Types。动态创建 DOM 时禁止拼接 `innerHTML`，必须使用 `document.createElement`、`setAttribute` 与 SVG API。
3. **macOS 打包与运行签名铁律**：
   - 只要替换或重编了 `easyag-node` 或打包了 App，必须使用 `codesign --force --options runtime --sign - --entitlements src-tauri/Entitlements.plist` 进行签名，否则无法启动 V8。
4. **测试与语法验证前置**：
   - 修改任何代码后，请优先运行 `npm run check`（快速模块检查）和 `npm test`（40 项核心测试覆盖）。
5. **打包命令**：
   - 本地构建与打包请直接运行 `npm run package`（或 `node scripts/package.cjs`），产物输出于 `dist-tauri/`。
