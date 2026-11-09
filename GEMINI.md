# EasyAntigravity Workspace Guidelines

## 1. 架构与历史知识查阅（禁止盲读 Git Log 和遍历代码）
本项目已建立专属知识库 Skill：[easyag-knowledge](file:///.agents/skills/easyag-knowledge/SKILL.md)。
- **严禁**盲目执行 `git log`、`git show` 或大范围遍历仓库搜索历史记录；
- **严禁**大范围盲读源代码文件来理解架构。
- 当需要理解代码结构、模块边界、历史版本（v3.2.4 到 v4.0.4 Lite）、分支模型（`main` / `v3-pilot` / `cli-edition`）或打包机制时，**直接查阅 `easyag-knowledge` 技能或其文件**。

## 2. 开发与验证守则
- **零侵入原则**：EasyAG 绝不直接修改 Antigravity 安装包内的任何文件，通过 CDP 与可逆 DOM 实现。
- **Trusted Types**：IDE 注入与渲染禁止使用 `innerHTML`，必须使用原生 DOM API。
- **macOS JIT 签名**：原生外壳与 Node 运行时必须具备 `Entitlements.plist` 中的 JIT 权限，否则 V8 崩溃（SIGTRAP）。
- **打包与编译**：统一使用 `npm run package`（或 `node scripts/package.cjs`），产物输出于 `dist-tauri/`。
- **回归验证**：每次改动前/后执行 `npm run check` 与 `npm test`。
