# 两版共享词条仓库

`glossary.json` 是适合 GitHub 保存的正式词条快照，统一使用 `cardstudio-glossary-v1`。它与 Community 的在线 JSON、离线快照保持一致；Studio 可以直接导入此文件并预览合并。

普通使用无需操作源码：在 Studio Beta 6 词条库点击“发布到两版词条仓库”，再点击“打开社区版”。两版共同读写本机 `shared-data/`：正式词条可在社区版查看，社区投稿进入私人版待审核队列。要发给群友，点击“下载含词条的社区版”。

## 维护 GitHub 中的词条快照

Studio 中审核并导出 `shared-glossary.json` 后，开发者可在本仓库根目录运行：

```bash
node shared-glossary/sync-glossary.mjs /path/to/shared-glossary.json
node shared-glossary/sync-glossary.mjs --check
```

脚本先验证文件，再更新以下三个文件；将三者一起提交到 GitHub：

- `shared-glossary/glossary.json`
- `card-studio-community/shared-glossary.json`
- `card-studio-community/glossary-data.js`

Studio 项目的 JSON 词条数据也可作为输入，脚本只提取词条白名单字段。不要把私人项目或密钥作为仓库文件提交。脚本无需依赖包或 GitHub Token，普通用户无需运行它。

当前初始快照为空，因为开发环境无法读取用户自己电脑浏览器中的真实词条。功能验证使用的示例未作为正式规则发布。使用者在私人版点击发布，或维护者提交已审核词条后，社区版才能看到相应内容。
