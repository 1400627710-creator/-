# 启动、更新与本机自检

## Windows 完整包

下载 `author-writing-0.1.2-windows-x64.zip`，在普通文件夹中完整解压，进入 `author-writing` 文件夹，双击 `START.cmd`。完整包包含 Windows x64 Node、许可证、编译好的窗口和全部运行依赖。

如果出现 `[ARCHIVE_INCOMPLETE] Extract the entire ZIP before running this file.`，旧启动器是在找不到 `scripts\windows-launch.ps1` 时退出，程序尚未启动。按回车关闭报错窗口不会继续打开程序。

下载发布页面的 `author-writing-0.1.2-start.cmd`，保存到普通文件夹后双击。配套程序缺失时，会弹出文件选择框：选择已下载的 Windows 完整 ZIP（新版或旧版 0.1.1 完整包均可），启动器会自动把全部程序恢复到 `%LOCALAPPDATA%\AuthorWritingProgram\package-…\author-writing` 后启动。后续再点击同一文件会复用已恢复目录。旧包恢复后仍是旧版本程序；若要更新全部程序，请在首次恢复时选择 0.1.2 完整 ZIP。无需额外注册、模型 Key、系统 Node 或管理员权限。

自动恢复只处理所选程序 ZIP，不扫描其他目录；程序目录与 `%LOCALAPPDATA%\AuthorWriting` 的稿件目录分开。取消选择会明确显示错误，报错窗口保留到按键后关闭。入口源码在 `scripts/windows-bootstrap.ps1`；三个 `.cmd` 内嵌同一恢复逻辑，可单独运行。它们由 `python scripts/build-windows-launchers.py` 生成。

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
| `ARCHIVE_INCOMPLETE` | 使用 0.1.2 独立启动器，选择 Windows 完整 ZIP 自动恢复；或完整解压新版包。 |
| `PACKAGE_NOT_SELECTED` / `PACKAGE_NOT_FOUND` | 重新启动并选择已经下载到本机的完整 ZIP。 |
| `PACKAGE_INVALID` | 所选 ZIP 不是有效的本工具完整包；重新从发布页面下载。 |
| `NODE_MISSING` / `NODE_UNSUPPORTED` | Windows 改用完整包；通用包需要 Node 22 或以上。 |
| `NODE_INSTALL_FAILED` | winget 未能完成安装；保留日志，改用完整包。 |
| `NPM_MISSING` | 通用包的 Node 安装不完整；完整包正常启动不需要 npm。 |
| `DEPENDENCIES_MISSING` / `DEPENDENCIES_INVALID` | 启动器会尝试修复；网络失败时使用完整包并保留错误码。 |
| `PROCESS_FAILED` | 查看日志中退出前的具体步骤和输出。 |
| `SELF_CHECK_FAILED` | 提供诊断 JSON 中失败的步骤和错误码。 |

不要把小说、工程备份、账号密码或登录令牌发布到 GitHub。诊断成功也不代表桌面账户已安装插件、模型已理解整本小说或主动建议已在真实桌面触发。
