# CardStudio Community 1.2.1

## 稳定性修复

- 共享素材库新增 **120MB 总量上限**，避免通过多次导入把轻量网页的 IndexedDB 堆到不可控大小。
- 共享素材包超过 1000 项时明确拒绝，不再静默截断。
- 直接读取 Studio `userAssets` 时补齐角色映射：`frameImage / textureImage / art / icon` 不再全部掉到“其他”。
- 共享素材库导出扩展名统一为 `.csassets`，与词条 JSON 明确区分。
- 新增 `asset-library-check.mjs`，专项验证共享素材包格式、分类映射、重复去重、安全栅格限制和总量边界。
