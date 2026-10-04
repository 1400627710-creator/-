# CardStudio Community 网页部署

Community 是纯静态网页，不需要 Node、数据库或服务器端代码。

将以下文件放到同一个静态网站目录即可：

- `index.html`
- `styles.css`
- `app.js`
- `glossary-data.js`
- `shared-glossary.json`

通过 `http://` / `https://` 打开时，主编辑器会先启动，然后在后台读取同目录 `shared-glossary.json`。词条请求设置了约 3.5 秒超时、5MB 大小上限和 5000 词条上限，因此词条服务不可用时不会卡住制卡界面。

直接双击 `index.html` 时不会发网络请求，而使用 `glossary-data.js` 内置的离线词条快照；需要时也可从“项目 → 同步共享词条库”手动导入 JSON。

推荐把网页部署在独立静态目录，不与 Studio 私有文件、AI Key、后台源码或完整 `.cardstudio` 工程放在同一公开目录。
