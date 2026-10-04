# CardStudio Community 网页部署

Community 是纯静态网页，不需要 Node、数据库或服务器端代码。

将以下文件放到同一个静态网站目录即可：

- `index.html`
- `styles.css`
- `app.js`
- `glossary-format.js`
- `glossary-data.js`
- `shared-glossary.json`

通过 `http://` / `https://` 打开时，主编辑器会先启动，然后在后台读取同目录 `shared-glossary.json`。词条请求设置了约 3.5 秒超时、5MB 大小上限和 5000 词条上限，因此词条服务不可用时不会卡住制卡界面。

直接双击 `index.html` 时不会发网络请求，而使用 `glossary-data.js` 内置的离线词条快照或已导入缓存；需要时也可点击词条库“导入词条文件”。正式词条保存在自动保存和 `.cscard` 中。

在 Studio Beta 6 中点击“打开社区版”时，服务为社区页面注明同源 `/api/glossary` 入口。此模式读取私人版发布的正式词条，并允许主动投稿至 `/api/glossary/contributions` 待审区；社区版无法直接发布或修改正式库。独立静态网站仍只读取自己的 JSON，投稿按钮会导出文件。

维护公开仓库中的正式库时，使用根目录 `shared-glossary/sync-glossary.mjs` 同步仓库 JSON、在线 JSON 与离线 JS，避免线上和离线词条不同。

推荐把网页部署在独立静态目录，不与 Studio 私有文件、AI Key、后台源码或完整 `.cardstudio` 工程放在同一公开目录。
