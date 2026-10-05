# 语言转换指令中继器 · 私人版 1.2.0

一个本机运行、单用户使用的中文 Web 应用。你输入模糊想法，应用通过 OpenAI GPT 把它整理成可交给编程 AI 的开发指令。应用本身不生成项目源码。

## 1. 变更摘要

- 优化需求理解：明确使用者、操作闭环、约束、首版排除范围与待验证项；追问按影响排序，保留最新修订和否定要求。
- 需求清单统一编号：R 为必须做、O 为可选做、Q 为量化指标。第 4 / 6 节复用同一清单，模块、接口、任务和验收引用统一编号。
- 增加架构选择、备选、理由、代价与调整条件，以及数据流、失败路径、数据实体和状态约束。小项目优先最小可运行方案。
- 增加模块职责、文件归属、依赖与任务交付/验证；拒绝未知引用、循环依赖、冲突文件、不完整覆盖和混合必做/可选任务。
- 完整接口契约支持 HTTP、内部函数、事件和 CLI：参数与校验、返回、错误、权限、重复调用、成功与失败例子；不强制给离线工具添加服务器。
- 增加具体风险及处理/降级、需求映射表，区分实际程序结构检查与尚待执行的项目实现验证；第 6 节独立复制仍包含架构、约束、接口、风险和验证。
- 规划失败时，在原有两次重试与 28 秒预算内给模型反馈允许列出的具体检查问题，不把原始生成内容或异常加入系统指令。
- 增加 `QUALITY.md` 和五组真实模型验收案例。离线列出案例不联网；显式 `--live` 才调用所选模型，结果保存本机并保留人工内容评审。


- 修正所有 HTTP 403 被统一归为账户、地区或工作区限制的问题。普通拒绝保留具体失败阶段；只有明确的资格错误码才显示资格限制。不能仅凭旧提示确定你的实际账户问题。
- 增加页面“一键自检并导出”、复制诊断报告，以及无需第三方依赖的 `diagnose.py` / Windows `diagnose.bat`。旧版或页面打不开时也能收集本机环境与安全反馈。
- 记录回调、客户端注册、授权码交换、身份配置、公钥、签名、计划权限、本机保存和模型列表各阶段；保存 HTTP 状态、响应形状、允许记录的错误码和安全请求 ID，不保存原始错误正文。
- 首次失败原因不会被后续刷新模型的“尚未授权”覆盖；刷新和实际进程重启后仍可导出。已签发的客户端注册在交换失败后保留，但不会因此显示已登录或已授权。
- 可选网络自检只检查 OpenAI 官方公开身份接口，以及已有未过期授权的模型列表；不调用模型、不消耗模型生成额度、不刷新令牌或改变设置。自检使用独立锁，不阻塞官方登录回调。
- 诊断报告字段严格筛选，不含密钥、令牌、授权码、回调参数、邮箱、账户/工作区 ID、本机用户路径、代理地址、想法、历史或原始日志；只在本机保存，不自动上传。
- 旧版未保存的上游细节无法事后还原，报告明确提示升级并重新完成一次登录。自检发现权限限制时保留真实状态，不伪造连接成功。

- 修复“官方页面已登录，应用仍显示未登录”：账号身份登录、模型调用授权、等待回调和授权失败分别显示；身份已经验证但没有计划授权时保留账户信息。
- 登录等待期间刷新页面会继续检查结果；短暂的状态请求失败自动恢复检查。发起登录后立即保存连接方式，不会因刷新回到 API Key 模式。
- 重复点击登录沿用当前未过期的授权请求，避免第一次回调因第二次点击失效；增加“检查登录状态”和“取消本次登录”。
- 登录失败原因保存在本机，刷新、重新打开设置和服务重启后仍能看到。服务在等待授权时重启，会明确提示重新登录；不会伪造授权成功。

- 增加“导入并检测”：粘贴密钥或选择 `.txt`、`.env`、JSON 文件后，自动保存并发送一条简短连接测试；不上传会话历史，不在页面或接口回显密钥。
- 区分密钥缺失、无效、API 额度不足、权限限制、模型配置、网络失败和超时；保存成功与检测通过分别提示。检测失败保留已导入密钥，格式错误保留原配置。
- 增加官方“使用 ChatGPT 登录”连接方式，无须手动配置 API Key。采用官方动态注册、PKCE、身份签名验证、授权刷新和撤销；账户资格、地区、工作区、模型权限与额度以官方结果为准。
- ChatGPT 模型列表来自账户接口；请求使用官方 Responses API，不读取浏览器 Cookie。没有授权或不符合使用条件时给出提示，不自动切换为收费的 API Key 连接。
- 两种连接方式共用同一中继规则：信息不足仅第 3 节、最多 5 个问题；要求默认假设或结果时完整 1–7 节；未核验的内容逐项标记“假设”。
- 第 6 节固定包含角色、目标、上下文、技术栈、功能清单、文件结构、接口定义、验收标准、输出格式、分步任务；必须做与可选做分开，模糊要求量化。
- 会话创建、查看、删除、重命名、输入与历史持久化；复制全文或第 6 节，导出所选版本的 Markdown；草稿、刷新恢复、失败重试与深色模式保留。
- 暂时的生成失败最多自动重试 2 次；授权刷新、生成调用与等待共用默认 28 秒预算。永久的认证、权限或额度错误直接提示处理方法。
- 静态资源在本机加载，应用只连接 OpenAI 官方授权与模型接口；凭据保存在本机，正式启动入口不记录带授权码的请求网址。
- 保留 Windows / macOS / Linux 启动文件、依赖自检与修复、端口占用处理、Dockerfile 和测试。支持用户现有 Python 3.14.8，无须另外安装 3.11。

技术实现为 Python 3.11+（已验证 3.11 和 3.14.8）、FastAPI、Uvicorn、Pydantic、SQLAlchemy、SQLite、OpenAI Python SDK、Jinja2、HTMX、Tailwind 和原生 JavaScript。

**资源加载调整：** 为同时满足“除 OpenAI API 外不向第三方上传数据”和“首屏 ≤1 秒”，没有在浏览器中使用 Tailwind CDN。交付包提供编译后的 Tailwind CSS 和完整 HTMX 文件，不需要 Node.js，也没有远程字体、统计脚本或其他运行时 CDN 请求。

## 2. 完整文件树

```text
language-relay/
  app/
    api/
      __init__.py
      routes.py
    prompts/
      __init__.py
      relay_prompt.py
    services/
      __init__.py
      chatgpt_auth.py
      connection_service.py
      diagnostics_service.py
      llm_client.py
      planning_service.py
      relay_service.py
      session_service.py
      settings_service.py
    __init__.py
    config.py
    db.py
    errors.py
    main.py
    models.py
    schemas.py
  static/
    vendor/
      HTMX-LICENSE.txt
      TAILWIND-LICENSE.txt
      htmx.min.js
      tailwind.css
    app.css
    app.js
    icon.svg
  templates/
    index.html
    session_list.html
  tests/
    __init__.py
    conftest.py
    fakes.py
    test_api.py
    test_bootstrap.py
    test_connection.py
    test_diagnostics.py
    test_key_recovery.py
    test_planning_service.py
    test_quality_check.py
    test_relay_service.py
  tools/
    browser_check.py
    live_check.py
    quality_check.py
    tailwind.input.css
  .dockerignore
  .env.example
  .gitignore
  ACCEPTANCE.md
  Dockerfile
  README.md
  QUALITY.md
  bootstrap.py
  diagnose.bat
  diagnose.py
  pytest.ini
  requirements-dev.txt
  requirements.txt
  ruff.toml
  run.py
  start.bat
  start.sh
  tailwind.config.cjs
  安装说明.txt
  诊断使用说明.txt
```

运行后会出现 `.data/`，它不是交付源码的一部分。其中 `relay.sqlite3` 存储会话、消息、生成记录和模型/温度；`api-key.json` 保存通过页面设置的密钥，`chatgpt-auth.json` 保存本机 ChatGPT 注册身份和授权；`chatgpt-login-result.json` 仅保存安全的中文登录结果，不含授权码或令牌。`chatgpt-login-trace.json` 仅保存经过字段筛选的授权阶段记录；`diagnostics-latest.json` 保存最近的安全自检报告。独立诊断工具将报告写入 `diagnostics/`。也可以通过 `.env` 或环境变量配置密钥。

安装记录写入 `.data/install.log`。`.data/startup.lock` 和 `.data/server.lock` 用于防止重复安装或运行，进程退出后操作系统自动释放锁。无法使用的旧虚拟环境保留为 `.venv-backup-…`。

## 3. 每个文件的完整代码

交付 ZIP 内包含上面全部文件，无省略号、伪代码或待补实现。另附 `language-relay-full-source.md`，按文件逐一列出完整内容，包括第三方静态文件和许可文本。

### 数据与输出契约

- `Session`：标题、状态、默认假设模式、错误信息、创建和更新时间。
- `Message`：会话、角色、类型（输入/问题/完整报告）、内容、创建时间。
- `Generation`：来源输入、对应输出消息、完整 Markdown、模型、温度、默认假设模式和创建时间。
- `Setting`：连接方式、API 模型、ChatGPT 模型、API 温度；API Key 和 OAuth 令牌不写入这个表。ChatGPT 连接不使用温度参数。

GPT 返回经过 JSON Schema 约束的结构化内容。Pydantic 和业务校验进一步检查问题数量、章节内容、必需子项、数字与单位、换行和模式约束。服务端将其拼成固定标题的 Markdown：

1. 我理解的想法
2. 动机分析
3. 需要确认的问题
4. 需求规格
5. 技术方案
6. 给编程 AI 的指令
7. 自检

第 6 节独立包含角色、目标、上下文、技术栈、功能清单、文件结构、接口定义、验收标准、输出格式、分步任务。必须做与可选做分别列出。

1.2.0 的结构化规划使用同一份需求清单生成第 4 / 6 节，用 R/O/Q 编号连接模块 M、接口 I、任务 T、验收 C 和风险 K。模块与任务必须无循环，每个必须需求和量化指标都有模块、任务和验收；接口必须归属负责该需求的模块。文件只能归属一个模块，不能用大小写、父目录或文件/目录冲突重复分配。任务按前置依赖排序，可选工作单独列出。

每个接口定义输入、返回、错误、权限、重复调用与两个例子，架构包含选择/备选/理由/代价，风险包含触发/处理/验证。第 7 节显示程序实际执行的结构检查和映射表，并明确尚未实现目标项目、没有执行其测试。来源标记约束仍逐项应用于新的所有说明。

具体数据字段、适用边界和五项能力验收见 [QUALITY.md](QUALITY.md)。升级不改 SQLite 数据模型，旧 Markdown 历史仍能原样查看、复制和导出。

标记“用户已提供”需要模型返回的内容与依据相同，且依据是用户输入中的完整语句；校验保留词与数字之间的空格，并检查语句边界。例如，“不需要联网”不能截成“需要联网”，“首屏 ≤1 0 秒”不能合并为“首屏 ≤10 秒”。无法核验的片段、改写和新增内容均标记“假设”。这项检查约束来源标记，复杂内容的语义正确性仍需真实 API 验收和人工检查。

信息不足时只有 `## 3. 需要确认的问题`，不添加其他章节。默认假设模式下，第 3 节说明没有阻塞问题，全部补充内容依然逐项标记“假设”。默认假设模式会沿用到本会话的后续修改；输入“不使用默认假设”“不要使用默认假设”“取消默认假设”或“我不需要结果”可以退出。一次输入包含多个明确模式要求时，以最后一个为准。引号、代码块、行内代码、JSON 字符串或 Markdown 引用中的触发词视为项目资料，不改变模式。

输入框下会说明草稿是否已保存。未发送内容仅保存在当前浏览器的本机存储中，不会调用 GPT；发送后消息与生成历史存入 SQLite。清除浏览器数据会清除草稿，已经发送的历史继续保存在数据库。浏览器存储不可用时会提示草稿仅在当前页面暂存。草稿按会话编号和创建时间区分，避免数据库重新使用编号时套用旧草稿。

### HTTP 接口

写入请求需要额外请求头 `X-Relay-Client: local`，这是本地网页防护的一部分。浏览器已自动添加，命令行调用时请自行添加。不启用跨域访问。

| 方法 | 路径 | 请求 / 响应 |
| --- | --- | --- |
| GET | `/health` | `{"status":"ok"}` |
| GET | `/api/settings` | 是否有密钥、API 模型、温度、`provider`、`chatgpt_model`，不返回秘密 |
| PUT | `/api/settings` | 可选 `openai_api_key`、`model`、`temperature`、`provider`（`api` / `chatgpt`）、`chatgpt_model` |
| POST | `/api/settings/import-key` | `{"content":"密钥或配置文件内容"}`；返回设置与连接检测结果，不回显密钥 |
| POST | `/api/settings/test-connection` | 无正文；检测已选连接，默认最多 10 秒 |
| POST | `/api/auth/chatgpt/start` | 无正文；返回官方授权网址，浏览器打开后完成登录 |
| GET | `/auth/callback` | 官方 OAuth 回调；验证后 303 跳转，清除网址中的授权码 |
| GET | `/api/auth/chatgpt/status` | 账号登录、模型授权、等待回调、阶段、账户、模型与结果，不返回令牌 |
| POST | `/api/auth/chatgpt/cancel` | 无正文；取消当前等待，不删除已有有效授权 |
| POST | `/api/auth/chatgpt/models` | 无正文；刷新账户可用模型 |
| POST | `/api/auth/chatgpt/logout` | 无正文；清除本机令牌并尝试官方撤销 |
| POST | `/api/diagnostics/run` | `{"check_network":true}`；生成安全 JSON 报告，网络检查共享 6 秒上限，不调用模型 |
| GET | `/api/diagnostics/export` | 导出最近的安全 JSON 报告；无报告时 404 |
| POST | `/api/sessions` | 可选 `title`，返回会话（201） |
| GET | `/api/sessions` | 按更新时间排序的会话数组 |
| GET | `/api/sessions/{id}` | 会话信息与消息数组 |
| PATCH | `/api/sessions/{id}` | `{"title":"名称"}`，重命名 |
| POST | `/api/sessions/{id}/messages` | `{"content":"想法"}`；返回输出消息、原输入、问题和 Markdown |
| POST | `/api/sessions/{id}/generate` | `{"use_default_assumptions":true}`；返回生成编号和 Markdown |
| POST | `/api/sessions/{id}/retry` | 无正文；重试失败请求，不重复保存输入 |
| GET | `/api/sessions/{id}/export` | 当前最新输出的 UTF-8 `.md` |
| GET | `/api/sessions/{id}/export?message_id=…` | 导出指定输出消息，不能读取其他会话的消息 |
| DELETE | `/api/sessions/{id}` | `{"ok":true}`，关联消息与生成记录级联删除 |

`generate` 必须已有项目想法。设置 `use_default_assumptions:false` 会明确退出默认假设模式；若仍缺信息，问题被保存，接口返回 409。

错误统一为 `{"detail":{"code":"…","message":"中文提示",…}}`。输入校验错误只给字段名称和说明，不回传密钥或原请求正文。API Key 缺失、无效、API 余额不足、ChatGPT 计划额度耗尽和模型配置不支持属于需要处理的错误，需要先修改设置，不做无效的网络重试。OpenAI 明确要求等待的 `Retry-After` 超出总预算时，应用给出限流提示，不提前重试，也不无限等待。

超时、连接失败、限流、服务端暂时失败和输出格式错误按预算自动重试，最多首次加两次。客户端内部异常或输出处理异常保存中文错误并允许手动重试；任务取消也会保存中断状态，刷新后可重试原输入。错误正文与异常日志不包含上游响应或密钥。

### 提示词与数据边界

系统提示词只来自 `app/prompts/relay_prompt.py`。用户输入及历史结果作为不可信 JSON 资料放在 `user` 消息内，不能向设置接口写入系统提示词。章节和标记由程序生成，模型返回不合格内容时不会展示为合格结果。

这保证消息角色和固定格式由应用控制；它不代表模型对所有复杂恶意文字都能做出正确语义判断。真实内容是否贴合想法、技术是否合适，需要用真实 API 验收和人工检查确认。

## 4. 安装与运行命令

### Windows：最少操作

1. 已安装 64 位 Python 3.11 或更新版本（包括 3.14.8）时，直接进行下一步。若尚未安装，访问 [Python 官方下载页面](https://www.python.org/downloads/)，安装完整的 64 位 Python；使用传统安装程序时勾选 `Add python.exe to PATH`，再点击 `Install Now`。
2. 右键 ZIP，选择“全部解压”，解压到桌面或文档中的普通文件夹。进入其中的 `language-relay` 文件夹。
3. 双击 `start.bat`。首次运行会安装依赖，保持联网，等待“依赖与程序环境校验通过”。
4. 网页会在服务就绪后自动打开。也可以按启动窗口显示的网址进入，通常是 [http://127.0.0.1:8000](http://127.0.0.1:8000)；端口占用时窗口显示备用网址。启动窗口需要保持打开。
5. 打开“连接与设置”：选择“使用 ChatGPT 登录（免 API Key）”，点击“使用 ChatGPT 继续”，在官方页面登录并授权。回到应用后点击“保存并检测连接”。也可以选择 API 连接，粘贴密钥并点击“导入并检测”，或选择密钥文件。
6. 输入“我想做卡牌游戏”，发送；补充回答，或点击“使用默认假设，我需要结果”。
7. 使用“复制 Markdown”“复制第 6 节”或“导出 .md”获得结果。

已有 1.0.0–1.1.2 版本时，关闭原启动窗口，解压新版并替换原项目的代码文件，保留原项目的 `.data` 和 `.env`，再双击新版 `start.bat`。新版会核验当前虚拟环境并按需修复；同一电脑升级保留 `.data` 和 `.env`。更换电脑可迁移历史与 API 配置，但不要复制 `.data/chatgpt-auth.json`；在新电脑重新登录 ChatGPT，由程序建立不同的本机注册身份。不要复制 `.venv`。本次没有改变数据库表结构，已有会话和密钥配置可以继续使用。重新生成历史会话的结果，可应用新的原话核验规则。

不需要激活虚拟环境。手动运行命令（PowerShell，在项目文件夹内）：

```powershell
py bootstrap.py
```

已有 Python 3.14.8 时可直接使用，无须另外安装 3.11。需要指定现有 3.14 时执行 `py -V:3.14 bootstrap.py`。若电脑没有 `py` 命令但有 Python 3.11+，改用 `python bootstrap.py`。双击入口优先使用 `py -3`，再尝试 `py -3.11`、`python` 和可用的现有虚拟环境。

### macOS / Linux

```bash
sh start.sh
```

启动入口优先选择 Python 3.11，再尝试 Python 3.11+。可用 `RELAY_PYTHON=python3.11 sh start.sh` 指定解释器；在无图形界面的环境使用 `sh start.sh --no-browser`。仅检查与安装依赖可执行 `python3.11 bootstrap.py --install-only`。

### 安装失败时

启动窗口保留具体错误，安装记录位于项目的 `.data/install.log`。网络恢复后重新双击启动文件即可重试，历史记录和密钥配置保留。

| 提示或现象 | 操作 |
| --- | --- |
| 提示需要 Python | 安装上面链接的完整 64 位 Python 3.11 或更新版本，勾选加入系统路径；关闭旧窗口再启动 |
| `No runtime installed that matches 3.11` | 命令指定了未安装的版本；运行 `py bootstrap.py`，已安装 3.14 时可用 `py -V:3.14 bootstrap.py` |
| 依赖下载失败 | 检查网络，重新启动；若持续失败，提供窗口末尾的报错或安装记录末尾内容 |
| 程序文件无法写入 | 完整解压到桌面或文档中的普通文件夹，再启动 |
| 旧程序环境无法使用 | 按提示等待自动重建，旧环境备份保留在项目文件夹内 |
| 提示已有启动窗口 | 回到原窗口，按其显示的网址打开网页 |
| 浏览器没有自动打开 | 将启动窗口里的完整网址粘贴到浏览器地址栏 |
| 提示本地配置无法使用 | 检查 `.env` 的温度为 0–2、预算为 1–28 秒，数据目录可写 |

Python 3.14.8 与 Python 3.11 的完整测试与浏览器结果见 ACCEPTANCE.md；正式启动入口的登录状态与实际进程重启检查在此前版本已验证。运行依赖与 1.1.0 相同，复用此前完成的标准 venv/pip 首次安装及 Windows 3.14 / 64 位全部 38 个依赖安装文件核验。尚未在 Windows 真机执行双击启动。

此程序需要完整 Python 安装中的 `venv` 与 `ensurepip`。Linux 发行版若拆分这两个组件，需安装对应的 `python3-venv` 包。

### 先自检并反馈连接问题

你遇到的两条旧提示有不同来源：第一条来自统一的 HTTP 403 错误映射，不能证明具体是账户、地区还是工作区限制；第二条来自本机没有可用计划授权的检查，通常是前一次失败的后续结果。刷新模型不是重新授权。浏览器账号登录、允许本应用使用计划、回调交换验证以及本机保存分别检查。

新版页面：关闭旧启动窗口、保留 `.data` / 自己的 `.env`、覆盖新版代码后双击 `start.bat`。重新完成一次登录，出错后在“连接与设置”点击“一键自检并导出”，把下载的 `relay-diagnostics-*.json` 反馈即可。取消网络选项可完全离线自检。界面读取已保存的设置，不会发送未保存的密码框内容。

旧版或页面打不开：将独立诊断包里的 `diagnose.py`、`diagnose.bat` 放到现有项目，与 `start.bat` 同级，保持启动窗口打开，再双击 `diagnose.bat`。发送旁边 `diagnostics/` 文件夹中的最新 JSON。工具只需 Python 3.11+；你已有的 3.14.8 可以使用，无需安装 FastAPI。多进程时必须指定对应窗口的端口；检测到多个服务时不会猜测。

```powershell
py -V:3.14 diagnose.py
py -V:3.14 diagnose.py --offline
py -V:3.14 diagnose.py --port 8001
```

记录包括运行进程 Python/依赖版本、可写目录、授权文件的存在与可读标志、回调/交换/签名/权限/保存阶段、第一次失败、安全 HTTP 元数据，以及可选的官方 DNS/TLS/超时和响应时钟差。未知错误码、不合安全格式的请求 ID 会隐藏。报告不导出账号标识、凭据、原始日志或上游正文；不会自动上传。网络设置差异只作为“假设”，不能据此断定你的地区或账户政策。

旧版丢弃的具体阶段和上游错误无法从中文提示还原；这种报告标记“旧版详情缺失”，升级后再登录一次即可记录。公开接口可达不代表计划授权成功，模型列表可达也不等于实际生成成功。详见 `诊断使用说明.txt`。

### 两种模型连接与错误自查

**免 API Key：** 选择“使用 ChatGPT 登录”，点击“使用 ChatGPT 继续”。官方页面负责登录与授权，本应用不接收你的账号密码。完成本应用授权并返回后读取账户可用模型列表；若列表暂时加载失败，可以点击“刷新可用模型”。这是需要官方授权的调用方式，不能在未登录、未授权或账户不符合条件时匿名调用模型。你在这个对话中使用的模型是否出现在账户列表，以官方返回结果为准。

**官方页面登录后应用没有同步：** 返回“连接与设置”，点击“检查登录状态”。页面会区分以下情况；不用反复刷新或重新导入 Key。

| 登录状态 | 操作 |
| --- | --- |
| 等待官方授权返回 | 回到刚打开的官方页面，完成账号登录和本应用计划授权，允许跳回本机中继器；只登录 ChatGPT 首页不能完成本次应用授权 |
| 已收到回调，正在完成授权 | 保持启动窗口打开，等待本机完成授权交换和身份验证 |
| 账号已登录，但模型尚未授权 | 账号身份已确认，仍缺少计划调用许可；再次点击“使用 ChatGPT 继续”并按官方页面允许计划使用 |
| 无法连接官方授权服务 | 官方网页与本机 Python 的网络连接分别验证；检查本机是否能访问官方接口，页面显示具体失败原因 |
| 身份验证未通过 | 检查电脑日期与时间，重新发起登录；应用不会跳过签名或身份校验 |
| 登录被服务重启中断、等待已过期 | 从本应用重新开始登录，完成新授权；旧回调不能用来代替新请求 |
| 模型列表尚未加载 | 登录结果保留，点击“刷新可用模型”；无需把账号登录重新当成失败 |

“重新打开官方授权页”会沿用当前请求；确实要重新开始时先点击“取消本次登录”。取消新请求不会删除原有的有效授权。

**API Key：** 粘贴完整密钥并点击“导入并检测”；或者选择包含密钥的 `.txt`、`.env`、JSON 文件，选择后自动导入和检测。支持 `.env` 的 `OPENAI_API_KEY=...` 以及 JSON 的 `openai_api_key` / `OPENAI_API_KEY` 字段；文件最多 16 KiB，密钥最多 512 字符。检测只发送简短合成测试，会计入对应 API 或计划用量。修改模型后点击“保存并检测连接”再次验证。

| 检测提示 | 下一步 |
| --- | --- |
| API Key 无效 | 从 API 平台复制完整密钥重新导入 |
| API 额度不足或计费未启用 | 检查 API 平台余额和项目计费；它与 ChatGPT 订阅分别管理 |
| 模型或权限不支持 | 选择账户有权使用且支持结构化输出的模型 |
| 无法连接官方接口、超时 | 检查网络；换密钥不会修复网络连接 |
| ChatGPT 登录失效 | 重新点击“使用 ChatGPT 继续” |
| HTTP 403 或计划权限拒绝 | 一键自检，核对失败阶段与安全错误码；明确资格拒绝才按官方限制处理 |
| ChatGPT 计划或本应用额度用尽 | 点击输入区旁“管理额度”，查看 ChatGPT 设置中的用量 |

应用网页本身不需要 Key 才能打开；若网页根本无法访问，应先查看启动窗口显示的网址和启动错误。

官方协议依据：[注册和登录](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)、[模型与调用](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)、[预览限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)、[错误恢复](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)。这些能力可能随官方预览调整，本应用不会绕过资格或额度限制。

### 本地配置

也可以复制 `.env.example` 为 `.env`，填写 `OPENAI_API_KEY`、`OPENAI_MODEL`、`OPENAI_TEMPERATURE`。页面保存的配置优先于启动配置；页面清除密钥后，不会重新采用 `.env` 中的旧密钥。

- 温度范围 0–2，默认 0.2。
- API Key 格式要求为不含空格的可打印 ASCII 字符，最多 512 个字符；保存配置不代表密钥已通过 OpenAI 验证。身份验证失败时，页面提示修改设置后重试。
- 模型需要支持结构化输出的 Chat Completions API。未支持该参数的模型会得到配置提示，不悄悄替换模型。
- `RELAY_DATA_DIR` 默认 `.data`，相对路径以项目目录为基准。
- `RELAY_LLM_BUDGET_SECONDS` 可配置 1–28 秒；默认 28 秒是包括 ChatGPT 授权刷新、生成调用与重试等待的总预算。
- 程序只监听 `127.0.0.1`，每个项目使用一个进程；默认端口 8000，冲突时选用 8001–8010。不提供局域网多人访问。
- OpenAI 客户端不继承进程环境的代理设置，不跟随 HTTP 重定向；本地真实验收脚本也直连本机。请使用能够直接访问 OpenAI 官方接口的网络。
- 密钥和 ChatGPT 授权文件是本地明文配置，POSIX 系统权限为 600、目录为 700；Windows 沿用当前用户的文件权限。不要分享包含密钥或授权的 `.env`、`.data`。正式启动入口关闭访问日志；自行使用 Uvicorn 时请添加 `--no-access-log`，避免记录 OAuth 回调授权码。

### 可选 Docker

```bash
docker build -t language-relay .
docker run --rm --name language-relay -p 127.0.0.1:8000:8000 -v relay-data:/relay/.data language-relay
```

浏览器仍打开 `http://127.0.0.1:8000`，通过页面配置密钥。数据保存在 Docker 命名卷。构建上下文排除 `.env` 和 `.data`，容器内使用普通用户运行。

### 可选更新 Tailwind 样式

正常安装、运行和使用均不需要 Node.js。开发者修改工具类后，可以安装 Node.js 并在项目目录执行：

```bash
npx --yes --package=tailwindcss@3.4.19 tailwindcss -i tools/tailwind.input.css -o static/vendor/tailwind.css --minify
```

HTMX 2.0.11 和 Tailwind 3.4.19 的许可随静态文件提供。应用 API 的结构化输出设计参考 [OpenAI 官方文档](https://developers.openai.com/api/docs/guides/structured-outputs) 和 [gpt-4o-mini 模型说明](https://developers.openai.com/api/docs/models/gpt-4o-mini)。

## 5. 测试命令

### 自动化测试：不需要密钥，不会调用 OpenAI

Windows：

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

macOS / Linux：

```bash
.venv/bin/python -m pytest -q
```

### 可选浏览器检查：使用临时数据库和模拟 GPT

以下以通用 `python` 命令展示，请替换为上面的虚拟环境 Python 路径：

```bash
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
python tools/browser_check.py
python -m ruff check app tests tools bootstrap.py run.py diagnose.py
```

检查会自行启动临时本地服务，完成界面操作、复制、下载、密钥纠正与重试、内部异常恢复、草稿隔离与恢复、生成中刷新、响应丢失恢复、模式取消、补充回答、重命名、删除、深色模式、移动布局、密钥文件导入、官方 OAuth 回调、账户模型列表、断开授权、等待期间刷新、重复打开授权页、状态请求故障恢复、未授权身份登录、失败原因恢复与取消登录检查，以及自检下载、复制、首次失败原因和恢复登录检查。OAuth 服务与模型响应均模拟，实际验证签名和 SDK 请求协议。不会修改你的正式数据库，也不会调用 OpenAI。截图和 JSON 记录默认写入 `test-results/browser/`，可使用 `--output` 指定其他目录。

### 独立真实 API 验收

先运行正式应用，在页面配置真实 API Key 或完成 ChatGPT 官方授权，再另开一个命令窗口执行：

```bash
python tools/live_check.py
```

这条命令确实调用 OpenAI：只发送两条合成验收输入“我想做卡牌游戏”和“使用默认假设，我需要结果”。它检查问题、7 节格式、第 6 节内容、导出一致性与每次请求耗时，并删除创建的临时会话。失败会显示中文提示。它不由普通 pytest 自动执行。

若启动窗口显示备用端口，例如 8001，使用 `python tools/live_check.py --url http://127.0.0.1:8001`。验收脚本仅接受本机 HTTP 网址。

### 五项能力的真实模型验收

见 `QUALITY.md`。先离线查看案例，再明确调用模型：

```bash
python tools/quality_check.py --list-cases
python tools/quality_check.py --live --url http://127.0.0.1:8000
```

第二条命令会消耗所选 API / ChatGPT 计划额度，只使用合成输入和临时会话。Markdown 与评审 JSON 写入本机 `quality-reports/`，不会自动上传。契约检查通过不等于内容质量已确认，五项内容维度仍需人工评审。

## 6. 验收自查表

完整结果与限制见 `ACCEPTANCE.md`。

| 验收要求 | 实现与验证 |
| --- | --- |
| 卡牌游戏想法不足时仅输出第 3 节，问题 ≤5 | 已实现，自动化与浏览器模拟测试通过；真实判断待真实 API 验证 |
| 要求默认假设后直接输出 1–7 节 | 已实现，自动化与浏览器模拟测试通过 |
| 所有假设标记“假设” | 服务端逐项标记；未通过完整语句与依据核验的“用户事实”也降级为假设 |
| 第 6 节包含十项内容 | 结构模型强制存在，渲染与浏览器复制检查通过 |
| 一键复制格式不乱 | 实际 Chromium 剪贴板内容与页面原文完全一致 |
| API Key 与免 Key 连接 | 一步导入和检测、错误分类、官方登录协议、令牌刷新和撤销已覆盖；真实账户资格待实测 |
| 一键诊断与反馈 | 分阶段 403 分类、首次原因保留、报告脱敏、旧版缺失提示、离线运行与回调并发通过 |
| 需求、架构、模块、接口、风险和自检 | 统一需求映射、完整接口、依赖/文件/任务/验收检查、具体修复反馈与旧历史兼容已覆盖；真实内容质量待模型与人工验收 |
| GPT 暂时失败重试 2 次 | 超时、格式、连接失败的三次尝试与总预算已验证 |
| 刷新后历史仍在 | 浏览器刷新与数据库关闭重启测试通过 |
| 导出与页面一致 | 对当前结果和选中的历史版本进行逐字节比较，通过 |
| 首屏 ≤1 秒，GPT 响应 ≤30 秒 | 浏览器实际首屏通过；授权刷新与生成的共同预算默认 28 秒。真实 GPT 成功响应的速度尚未测得，超时返回提示 |

**当前限制：** 本次 Python 3.11 / 3.14.8 各 295 项测试及 41 项真实浏览器流程通过；OAuth 上游和模型响应使用模拟服务。Python 3.14.8 的真实标准安装、进程启动、重启历史恢复通过，Windows 64 位依赖下载核验通过，但尚未在你的 Windows 电脑执行安装。没有使用你的真实密钥或 ChatGPT 账户验证授权、生成质量与真实速度；Docker 镜像未在本环境构建。语音输入和局域网密码未实现，它们属于可选范围。
