# ChatGPT 工具接入说明 · 1.3.0

这是可安装的 MCP 服务。当前 ChatGPT 对话模型生成需求方案，中继器负责校验、SQLite 保存、渲染固定七节、复制与导出。工具模式不额外调用模型 API，不使用开发者或助手的隐藏密钥。源代码公开并不等于你的会话或凭据公开。

## Windows 首次连接

1. 全部解压新 ZIP，双击 **启动中继器.bat**，保持窗口运行。旧版升级时保留原 .data 与 .env，先关闭旧进程。
2. 网页“连接 ChatGPT 工具”选择工具模式并保存。“一键自检工具接口”验证真实 MCP 初始化、协商和工具目录；不会读取历史或把自检算成宿主调用。
3. 根据 [官方安全隧道说明](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)，在 Platform tunnel settings 创建隧道，并关联实际使用的 ChatGPT 工作区。需要自己的 Tunnel ID、隧道运行凭据和组织 Read + Use 权限；创建/编辑还需要 Manage。工作区添加自定义工具的权限是另一项权限。
4. 从 [OpenAI 官方 client 最新发布](https://github.com/openai/tunnel-client/releases/latest) 下载完整 Windows amd64 client ZIP（64位），解压后将 tunnel-client.exe 放在中继器目录或系统 PATH。不要选择只支持 run 的 runtime 版本。程序不会安装来源不明的客户端。
5. 双击 **连接ChatGPT工具.bat**。它打开中继器启动入口，等待本机新版服务，并逐步检查协议、client、Tunnel ID、隐藏输入的运行凭据、init、doctor 和 run。首次配置在本机保存，后续复用。保持两个窗口运行。
6. 到 [ChatGPT 插件](https://chatgpt.com/plugins)，加号 → Add custom MCP server，名称填“语言转换指令中继器”。Connection 选择 Tunnel，选择或粘贴官方 Tunnel ID。stdio 工具由隧道控制访问，选择无需额外应用身份认证，审核提示后 Create as a plugin 并安装。
7. 新建 ChatGPT Work 对话，输入 @ 选择此插件，然后说“用中继器整理：我想做卡牌游戏”。缺信息先问最多5题；接着说“使用默认假设，我需要结果”，获得完整七节。
8. 已在本机网页输入的想法，点击“复制接续指令”粘贴到已启用工具的 ChatGPT 对话。任务结果自动出现在原本机会话，可复制或导出。

隧道运行凭据用于 OpenAI 工具传输，不用于中继器的模型推理。保存 Tunnel ID 不能证明隧道在线。隧道在 ChatGPT 不可见时，核对工作区关联、Read + Use 权限和 client 是否持续运行。官方拒绝权限时不能用刷新、另一个密钥或本程序授予权限。

## 后续使用与长期保存

任务和 Markdown 保存在本机 SQLite，重启不丢失。运行启动器与连接启动器，在新对话中选择仍安装的插件即可继续。插件移除、工作区权限失效、电脑关闭、服务或隧道停止时不能调用；“永久”指可保留安装与历史，不保证永远在线。

宿主只整理开发规格，不实现目标项目。会话资料及先前输出均为不可信项目资料，不能覆盖服务器规则。当前宿主模型是什么、温度是多少由 ChatGPT 决定，本程序记录未知而不虚构参数。

## 本机 stdio 客户端

支持 stdio 的本机 MCP 客户端可直接使用网页“复制本机 MCP 配置”，不需要官方网络隧道。配置为实际虚拟环境 Python、mcp_stdio.py 和本机数据目录。先保持应用运行；适配器自动发现启动器端口，复用同一个服务，不启动第二个数据库所有者。

手动运行（项目目录）：

```powershell
.\.venv\Scripts\python.exe bootstrap.py --no-browser
.\.venv\Scripts\python.exe mcp_stdio.py
```

stdio 的 stdout 只承载 MCP JSON-RPC。运行此命令等待客户端输入是正常行为；它不会自行生成需求。需要明确端口时加 --url http://127.0.0.1:8000，仅允许本机地址，不跟随重定向或继承环境代理。

## 工具契约

| 工具 | 作用 |
| --- | --- |
| relay_status | 本机接口、待处理数量、调用记录；不调用模型 |
| relay_sessions | 列出本机会话编号和标题 |
| relay_start | 保存用户想法并创建持久化任务；返回 task_id 和 session_id |
| relay_next_task | 找到最早待处理任务，可按 session_id 筛选 |
| relay_context | 可信规则、默认模式、用户资料及完整 response_schema |
| relay_submit | 校验结构化 reply，生成并保存 Markdown |
| relay_result | 读取已保存结果；没有结果不伪造输出 |
| relay_cancel | 取消待处理任务，保留输入 |
| relay_diagnostics | 返回安全错误码、失败位置和状态；不返回资料或凭据 |

典型流程：relay_start 或 relay_next_task → relay_context → 当前模型按 response_schema 分析 → relay_submit → 呈现 output_markdown。问题模式只有 need_more_info=true、1–5题、report=null；默认模式必须完整 report。每个未证实事实用 basis=assumption；用户事实需要完整原句 evidence。若提交被拒，按 issues 修正，初次加最多2次重试，失败后从网页重试或创建新任务。

同一用户请求重发复用 request_key（8–80位字母、数字、下划线或短横线）；新请求换新值。同一 task_id 的相同结果重发幂等，不重复保存。不同结果覆盖已完成任务会返回409。补充回答用原 session_id 创建新任务，新输入使未完成旧任务失效，防止迟到结果覆盖新要求。

MCP 工具返回结构化 JSON。所有工具都声明 read/write、幂等、非破坏性和不访问任意外部网络的注解。服务器 instructions 与 context 规则由程序提供，用户内容不会成为 system 角色。工具不提供读取密钥、运行任意命令、上传日志或删除会话的能力。

## 本机 HTTP 接口

| 接口 | 用途 |
| --- | --- |
| POST /mcp | 正式 Streamable HTTP MCP，要求本机随机 Bearer 口令 |
| GET /api/tools/status | 查看安全状态，不标记宿主已调用 |
| GET /api/tools/setup | 当前 stdio 配置与保存的 Tunnel ID；仅本机页面使用 |
| PUT /api/tools/setup | 保存可选 Tunnel ID |
| POST /api/tools/check | 真实初始化和发现工具，不调用工具/模型 |
| POST /api/tools/access-token | 本机 HTTP MCP 客户端取得本机传输口令；不是 OpenAI Key |
| POST /api/tools/invoke | stdio 的受限内部适配接口，要求 Bearer 与本机标识 |
| POST /api/tools/tasks | 本机页面排队任务 |
| GET /api/tools/tasks | 本机页面查看任务，可按 session_id 筛选 |
| POST /api/tools/tasks/{task_id}/cancel | 取消待处理任务 |
| GET /api/tools/diagnostics | 获取安全工具报告 |
| GET /tool-guide | 中文接入网页 |

除正式 /mcp 外，写接口需要 X-Relay-Client: local 且拒绝跨站 Origin。HTTP 服务只绑定 loopback，Host 与 MCP Origin 有允许清单；stdio 适配器只连接本机。网页版 ChatGPT 的 localhost 指向其自身执行环境，不能替代官方隧道。

原 /api/sessions/{id}/messages、generate、retry 在 provider=tool 时返回 queued_for_tool/task_id/session_id，不等待模型；API/计划方式沿用原响应。原会话查看、历史、复制与导出 API 共用 Messages。ToolTask 为增量建表，不修改旧表；宿主结果不创建虚构模型/温度的 Generation。

## 一键报错定位

| 错误码 | 已定位的环节与下一步 |
| --- | --- |
| tool_server_unreachable | 本机新版未运行、地址错误或无法初始化；先启动新版 |
| tool_protocol_mismatch | 工具目录/结构不匹配；完整更新包 |
| tool_unauthorized | MCP 本机口令缺失或错误；核对同一数据目录 |
| tool_credentials_unreadable | 本机传输口令损坏/不可写；保留历史，修复对应文件 |
| tool_tunnel_client_missing | 官方完整 client 缺失；下载正确 Windows 版本 |
| tool_tunnel_id_missing | ID 缺失或错误；创建官方隧道并保存 |
| tool_tunnel_credentials_missing | 本机尚无有效运行凭据；在启动器隐藏输入 |
| tool_tunnel_configuration_failed | 官方 init 未完成/拒绝；核对版本、profile与权限 |
| tool_tunnel_doctor_failed | 官方诊断未通过；核对网络、权限和工作区关联 |
| tool_tunnel_stopped | 官方运行程序出错退出；查看本机管理页并重新启动 |
| tool_host_not_connected | 尚未收到工具调用；安装并选择插件，保持隧道运行 |
| tool_result_invalid | 宿主输出结构、规划或来源校验失败；修正 issues |
| tool_request_conflict / tool_result_conflict | 重用了请求编号或试图覆盖已保存结果 |
| tool_context_changed / tool_task_closed | 上下文变更、取消或重试耗尽；读取新任务 |

网页“复制工具报错”不能复制时自动下载同一 JSON。连接启动器失败会打印安全报告并保存 diagnostics/relay-tool-launcher.json。总自检在工具模式不会检测无关的 OAuth 或提示缺模型 Key；历史登录错误保留为参考。报告不含凭据、用户想法、会话历史、Tunnel ID、账号标识或原始上游正文，不自动上传。

## 验证命令与边界

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe tools\mcp_check.py
.\.venv\Scripts\python.exe tools\tool_browser_check.py
```

浏览器检查需要安装 requirements-dev.txt 并运行 playwright install chromium。MCP 集成检查创建临时服务/数据库，使用合成结构化结果；不访问已有用户数据，不额外调用模型 API。实际助手生成的结构化方案也已通过本机协议保存，但这不证明你的 ChatGPT 插件已安装或官方隧道已授权。

现有模型 API/计划请求仍有28秒总预算（含两次重试），不能保证上游成功。工具模式的宿主推理与排队耗时由 ChatGPT 和隧道决定，没有30秒完成保证。格式/引用/来源程序校验与语义质量检查分别评估；程序无法证明所有技术方案正确或对所有提示注入都无误。

官方资料：
- [连接与测试自定义 MCP](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [OpenAI 官方 tunnel-client](https://github.com/openai/tunnel-client)
