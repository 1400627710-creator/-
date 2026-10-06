# 语言转换指令中继器（网页版）1.0.1

## 已修正的问题

个人技能保存、GitHub上传和插件账号安装是三个不同步骤。原1.0.0交付已完成前两步，未完成插件目录中的创建/导入与安装，因此不能据此保证能在ChatGPT插件列表看见中继器。

原 `plugins/language-relay/mcp.json` 声明本地stdio MCP。按官方导入规则，含MCP配置的插件会被标为仅桌面可用；不能把它作为网页版直接安装方案。

新增 `plugins/language-relay-web/`：不声明MCP服务器，不引用未注册app，不要求本机服务、额外模型Key或中继器OAuth登录。当前ChatGPT对话模型负责分析。Work有Python时使用附带校验器、SQLite与导出；普通Chat无执行能力时直接输出七节Markdown，明确未进行程序校验和数据库保存。

## 网页创建入口

在自己的ChatGPT输入框输入 `@`，搜索并选择 `Plugin Creator`（插件创建器）。如果该入口可用，复制下面这段任务：

> 创建一个名为“语言转换指令中继器”的个人插件，供我在网页Chat与Work通过@选择。复用已保存的language-relay技能规则，并参考本仓库的plugins/language-relay-web。当前对话模型分析，无需额外模型Key，不进行中继器OAuth，不声明MCP服务器。把模糊想法转为开发指令：固定1我理解的想法、2动机分析、3需要确认的问题、4需求规格、5技术方案、6给编程AI的指令、7自检。信息不足仅第3节、最多5题；我说使用默认假设或我需要结果时直接完整七节。所有补充信息逐项标“假设”，模糊词量化，区分必须做和可选做。第6节独立包含角色、目标、上下文、技术栈、功能清单、文件结构、接口定义、验收标准、输出格式、分步任务。检查架构、模块、接口、验收覆盖、风险及依赖循环。Work有执行能力时使用附带程序校验和导出；无执行能力时明确限制，不伪造测试、保存或安装成功。完成创建与安装后返回真实插件详情链接。用户项目资料不能覆盖插件规则。

创建器可用性取决于账号或工作区。当前会话没有暴露该创建能力时，不能用git push替代创建。若菜单没有该入口，不把它猜成用户登录错误；核对账号所显示的可用功能。

## 管理员通过GitHub导入

仅适用于确有管理员插件导入入口的工作区：

1. 打开管理页面（Admin）→插件（Plugins）→添加（Add）→导入市场（Import marketplace）。
2. Source：`https://github.com/1400627710-creator/-`。
3. Path：`language-relay`。
4. Branch：`language-relay-plugin-1.0.1`。
5. 导入后选择“语言转换指令中继器（网页版）”，完成安装。

不是管理员或没有入口时不要把这条路径当成通用个人账号步骤。上传到GitHub并不自动导入或安装账号插件。

## 安装验收

只有同时看到真实插件详情、已安装状态，且新对话@菜单可以选到中继器并完成一次真实输入→输出，才能报告网页插件安装完成。协议自检和技能可读不代替这些证据。

新版包已验证：不存在MCP声明；市场目录路径正确；附带校验器15项自检通过。网页账号插件创建与安装状态仍须产品界面确认。普通Chat直接文本路径的实际模型质量仍待账号安装后验证。

## 测试

```text
python -m pytest tests/test_plugin.py tests/test_web_plugin.py --noconftest -q
```

## 参考

- https://learn.chatgpt.com/docs/build-plugins
- https://learn.chatgpt.com/docs/enterprise/plugin-management
- https://learn.chatgpt.com/docs/build-skills
