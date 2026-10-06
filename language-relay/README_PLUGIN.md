# 语言转换指令中继器 · 技能与 MCP 插件 1.0.0

## 1. 变更摘要

中继器可由当前 ChatGPT 对话模型分析需求，离线工具负责结构校验、固定格式渲染、SQLite 历史与 Markdown 导出。运行本插件不需要额外模型 API Key，也不进行中继器 OAuth 登录。

保留需求理解、架构设计、模块规划、接口定义、风险与自检能力：固定七节、信息不足仅第3节且最多5题、默认假设模式、逐项来源标记、必须/可选需求、量化指标、模块与任务无循环依赖、验收覆盖。第6节独立可复制给编程 AI。

提供正式 `plugin.json`、`mcp.json`、市场目录和9个 MCP 工具。个人技能模式使用当前 Work 会话的模型及附带脚本；stdio MCP 模式由支持本地插件的客户端启动。两种模式都不把真实项目测试状态伪造成通过。

新版技能只携带离线编译代码，移除了完整 Web 应用运行包、授权令牌模块和自动依赖安装。脚本不访问网络、不运行子进程、不读取模型 Key。原 Web 应用、Windows 启动器及已有接口保留在项目中。

## 2. 文件树

```text
language-relay/
  .agents/plugins/marketplace.json
  README_PLUGIN.md
  tests/test_plugin.py
  plugins/language-relay/
    plugin.json
    mcp.json
    skills/language-relay/
      SKILL.md
      agents/openai.yaml
      references/workflow.md
      assets/runtime-manifest.json
      assets/selfcheck-reply.json
      scripts/relay_tool.py
      scripts/relay_core/
        __init__.py
        compiler.py
        errors.py
        mcp_server.py
        planning.py
        prompt.py
        schema.py
        schema.sql
        store.py
```

完整应用文件树、安装及旧版接口见 [README.md](README.md)。

## 3. 完整代码

每个新增文件均可在 `plugins/language-relay/`、`.agents/plugins/` 和 `tests/test_plugin.py` 直接查看。下载目录中的 `language-relay-plugin-full-source-1.0.0.md` 提供上述实现的逐文件完整内容，不包含账户凭据、测试数据库或私人历史。

## 4. 安装与运行

### 当前 ChatGPT Work 中使用

个人技能成功保存到账号后，在新 Work 对话中输入：

```text
使用 $language-relay：我想做一个卡牌游戏。
使用 $language-relay，使用默认假设，我需要结果。
使用 $language-relay，给中继器做一键自检。
```

技能由当前对话模型分析。无需启动 Windows 网页或重新授权 ChatGPT 计划。技能的账号保存、本地脚本可用、MCP 协议可用、正式插件目录安装是分别验证的状态。无法读取到技能时不能宣称账号已安装。

SQLite 在运行工作区中；需要跨对话历史时，由技能制作 checkpoint，并通过用户的文件保存能力保存及恢复。文件保存未成功时仅保证当前工作区历史，不声称跨对话持久化。合成自检历史不会保存为正式用户历史。

### 支持本地插件的客户端

打开本项目作为受信任项目，按官方文档在插件目录安装 `language-relay`。`.agents/plugins/marketplace.json` 使它可被发现，不等于已经完成客户端安装。含 `mcp.json` 的本地包适用于支持该能力的本地客户端，不能据此宣称网页 ChatGPT 已连接。

MCP 启动使用当前 PATH 中的 `python`，须有 `pydantic==2.13.5` 与官方 `mcp==2.3.0`。若使用虚拟环境，先激活再启动本地客户端，或把客户端 MCP 的 `command` 改成该环境 Python 的绝对路径。

Windows PowerShell 的独立测试环境可按现有 Python 3.14 创建，不强制安装3.11：

```powershell
py -V:3.14 -m venv .plugin-venv
.\.plugin-venv\Scripts\python.exe -m pip install pydantic==2.13.5 mcp==2.3.0 pytest==9.1.1 pytest-asyncio==1.4.0
.\.plugin-venv\Scripts\python.exe plugins\language-relay\skills\language-relay\scripts\relay_tool.py --workspace .plugin-state diagnose
.\.plugin-venv\Scripts\python.exe plugins\language-relay\skills\language-relay\scripts\relay_tool.py --workspace .plugin-state selfcheck
```

`setup` 只检查依赖，不下载或安装软件。诊断资源缺失、依赖、参数、编译结果、导出和恢复失败时返回 `problem_stage`、`error_code`、`message`、`next_step`；日志不会回显密码、Key、原始异常或完整历史。

直接 stdio MCP 启动：

```powershell
.\.plugin-venv\Scripts\python.exe plugins\language-relay\skills\language-relay\scripts\relay_tool.py --workspace .plugin-state mcp
```

九个工具：`relay_status`、`relay_sessions`、`relay_start`、`relay_next_task`、`relay_context`、`relay_submit`、`relay_result`、`relay_cancel`、`relay_diagnostics`。当前宿主应先读取实际 response_schema，然后生成结构化 reply，程序校验通过才保存与导出。格式初次失败后最多重试两次。

网页 MCP 安装需真实可达服务和官方账户授权；本项目不提供虚构 app ID、内部模型 Key 或权限绕过。原登录错误 `unsupported_country_region_territory` 是上游令牌交换拒绝，此离线流程不进入该阶段；不声称修复了上游资格限制。

## 5. 测试命令

```powershell
.\.plugin-venv\Scripts\python.exe -m pytest tests/test_plugin.py --noconftest -q
.\.plugin-venv\Scripts\python.exe plugins\language-relay\skills\language-relay\scripts\relay_tool.py --workspace .plugin-state selfcheck
```

`--noconftest` 用于验证独立插件，不加载原 Web 应用的 FastAPI 测试夹具。验证完整 Web 应用时安装 `requirements-dev.txt` 并执行原 README 的测试命令。

## 6. 验收自查表

2026-10-06 本次实际验证：

| 检查 | 结果 | 验证范围 |
| --- | --- | --- |
| Python3.11.16 | 18项通过 | 独立插件集成测试 |
| Python3.14.7 | 18项通过 | 独立插件集成测试；用户3.14.8未在Linux机器上直接运行 |
| Python3.12.14 | 15项通过 | 保存后个人技能自检与实际需求编译 |
| 九个 MCP 工具 | 通过 | 官方 SDK stdio initialize、list、status、start、context、submit |
| 仅第3节，问题≤5 | 通过 | 合成卡牌游戏提问流程 |
| 默认模式完整七节 | 通过 | 默认指令识别与完整结构输出 |
| 第6节十项合同 | 通过 | 角色、目标、上下文、技术栈、功能、文件、接口、验收、输出、任务 |
| 假设来源与规划覆盖 | 通过 | Schema、原规划校验器及独立库存工具编译 |
| 两次重试与安全错误定位 | 通过 | 校验失败剩余次数2/1/0，随后任务失败 |
| 历史恢复及导出一致 | 通过 | checkpoint、restore及逐字节Markdown比对 |
| 一键自检不污染用户历史 | 通过 | 临时合成数据库，用后移除 |
| 不执行额外模型请求 | 通过 | 脚本调用时禁用网络；模拟Key不回显 |
| 个人技能账号保存 | 已确认 | 安全改版 push 成功，重新拉取服务端正式技能并自检 |
| 正式 MCP 账号插件安装 | 未验证 | 协议测试和个人技能保存不能代替插件目录安装证明 |
| 用户 Windows 桌面安装 | 未实测 | 当前执行环境为Linux，不能声称操作过用户电脑 |
| 永久可用 | 不作保证 | 取决于账号技能保留、Work能力及数据保存状态 |

此次独立编译“离线家庭物品库存工具”得到3个模块、4个接口、4个任务、6个验收场景与3个风险，13项用户原话与123项假设逐项标注。通过的是需求编译与中继器工具流程，库存项目尚未实现。

参考：
- https://developers.openai.com/plugins/build/plugins
- https://learn.chatgpt.com/docs/plugins
