# CardStudio 公共资料服务源码

此目录保存线上服务的接口、身份适配、连接流程、数据模型、迁移和回归检查。它与 Community 1.4.0、Studio beta7 共用线上仓库。完整托管部署项目由 Sites 源仓库保存；本目录为可审查的公开服务源文件，私人 Studio 核心不在此目录。

生产入口：https://cardstudio-community-hub.tells-route3b.chatgpt.site/community/

运行服务检查：Node.js 24 以上执行 `node cardstudio-public-repository/tests/repository-check.mjs`。测试使用内存 SQLite，测试身份只创建于测试数据库。

身份头只允许由 Sites 认证网关注入；不要将该接口原样放到允许客户端直接伪造身份头的服务器。管理员邮箱仅作为服务端环境配置，客户端连接使用一次性 PKCE。生产代码不支持环境变量形式的测试管理员入口。

资料总量、原文件、权限、投稿隔离、乐观版本及原子批处理均在服务端执行。共创投稿经采用后保留作者署名；更新不会自动改写旧作品。
