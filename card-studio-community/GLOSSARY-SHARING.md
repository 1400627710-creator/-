# Studio / Community 共享词条格式

统一 Schema：`cardstudio-glossary-v1`

```json
{
  "schema": "cardstudio-glossary-v1",
  "version": 1,
  "terms": [
    {
      "id": "稳定 ID",
      "name": "词条名称",
      "color": "#5b5bd6",
      "category": "分类",
      "tags": "标签1,标签2",
      "description": "完整定义"
    }
  ]
}
```

## 双版本分工

- **Studio**：审核、维护和发布正式词条库。
- **Community**：搜索、引用正式词条，并在当前 `.cscard` 项目内创建共创词条。

Community 项目中的共创词条是**项目级数据**：新建项目不会自动继承上一个项目的投稿词条；打开另一个 `.cscard` 时也不会把两个项目的投稿词条偷偷合并。

正式共享词条按稳定 `id` 与名称去重并优先显示。Community 不允许新建与正式词条同名的本地词条，也不会把正式词条重新打包进“我的词条投稿”。

词条名不能包含 `[`、`]` 或换行，因为 `[[词条]]` 是卡面引用语法。共创词条改名后，当前项目中对应的引用会同步更新。

## 推荐发布方式

Studio 是正式词条审核源。审核后导出 `shared-glossary.json` 并覆盖 Community 网站同目录文件；Community 在网页环境会后台同步。群友新增的本地词条不会自动写回官方仓库，只能主动导出并交给 Studio 审核。
