# 启动、更新与本机自检

## Windows 完整包

下载 `author-writing-0.1.1-windows-x64.zip`，在普通文件夹中完整解压，进入 `author-writing` 文件夹，双击 `START.cmd`。不要在压缩包内部双击启动器，也不要只提取一个 `.cmd` 文件。完整包包含 Windows x64 Node、许可证、编译好的窗口和全部运行依赖。

窗口开始写作后，启动终端应保持运行。关闭终端会关闭本次本机服务。已经有服务运行时，重复启动会显示原服务的窗口地址；浏览器没有自动打开时，可以复制该地址。

## 更新与安装插件

把新包解压到一个新文件夹即可。稿件默认在 `%LOCALAPPDATA%\AuthorWriting`，不在下载文件夹；更新程序不删除稿件。插件安装前关闭独立编辑服务的终端。

双击 `INSTALL-GPT.cmd`：它先运行隔离自检，然后准备个人插件目录，并备份原安装。完整包内的 Node 被复制到插件目录，MCP 指向该目录中的 Node。完成后完全退出并重启 ChatGPT 桌面端，在插件目录安装或重新启用“小说码字助手”。本机文件准备成功与账户插件安装成功是两个不同状态。

若桌面端无法载入窗口，独立窗口仍可使用导出请求 → 当前 ChatGPT 处理 → 导入回复 → 作者采纳的文件流程。

## 诊断入口

双击 `DIAGNOSE.cmd`。检查运行环境、实际加载全部服务依赖、10 个 STDIO MCP 工具、窗口资源、HTTP 页面，以及合成测试工程保存后重启恢复。自检在临时目录中进行，不读取作者正文，不读取登录凭据，不调用额外模型接口。

日志和报告放在 `%LOCALAPPDATA%\AuthorWriting\logs`；无法写入该目录时尝试系统临时目录。窗口中会显示准确路径。日志中的 `launcher-*.txt` 记录启动步骤，`selfcheck-*.json` 记录结果。macOS/Linux 可运行 `npm run selfcheck`，路径在终端显示。

常见错误码：

| 错误码 | 处理 |
| --- | --- |
| `ARCHIVE_INCOMPLETE` | 完整解压最新版包；不要只复制启动器。 |
| `NODE_MISSING` / `NODE_UNSUPPORTED` | Windows 改用完整包；通用包需要 Node 22 或以上。 |
| `NODE_INSTALL_FAILED` | winget 未能完成安装；保留日志，改用完整包。 |
| `NPM_MISSING` | 通用包的 Node 安装不完整；完整包正常启动不需要 npm。 |
| `DEPENDENCIES_MISSING` / `DEPENDENCIES_INVALID` | 启动器会尝试修复；网络失败时使用完整包并保留错误码。 |
| `PROCESS_FAILED` | 查看日志中退出前的具体步骤和输出。 |
| `SELF_CHECK_FAILED` | 提供诊断 JSON 中失败的步骤和错误码。 |

不要把小说、工程备份、账号密码或登录令牌发布到 GitHub。诊断成功也不代表桌面账户已安装插件、模型已理解整本小说或主动建议已在真实桌面触发。
