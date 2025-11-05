# 项目代理规范（AGENTS）

本文件为本仓库内的“代理/协作者工作说明与技术规范”（Agent Guide）。其目标是将系统需求转化为可执行的工程约定，并指导后续实现、扩展与运维。除非用户在对话中有更高优先级的直接指示，参与者（人或智能体）在改动本仓库任意文件时均应遵循本文档。

— UI 与文本默认中文；运行与实现面向本地开发环境（SQLite），不依赖外部数据库；AI 通过 OpenAI SDK 调用，基于可配置 `OPENAI_BASE_URL` 与 `OPENAI_API_KEY`。


## 1. 目标与范围

- 单人博客系统（作者=管理员=同一人）。
- 本地数据库：SQLite（Prisma 管理 schema 与迁移）。
- 鉴权：用户名+密码，会话基于 `iron-session`；无需复杂权限模型与角色管理。
- 文章编辑：Markdown；发布时可选择是否生成摘要（默认开启）。
- AI 协作：
  - 元数据关键词提取与摘要生成统一调用 AI 模型（默认 THUDM/GLM-4-32B-0414），按业务场景区分"发布元数据""摘要生成"两类流程。
  - 两类调用均记录至 AIReview，包含模型、用量与成本估算。
  - AI 相关配置（API Key、Base URL、模型名称、费率）存储在数据库中，支持后台管理界面修改。
- 文本格式化：使用 pangu 自动在中英文间添加空格，发布时应用于正文。
- 附件管理：基于 SHA256 内容哈希去重存储；文章记录其依赖的哈希；删除文章时解除绑定，清理无引用文件。

不在本期范围：多用户、多语言、外部对象存储、复杂 RBAC、修订历史（Revision 已移除）。


## 2. 技术栈与架构

- Web 框架：Next.js 14（App Router）+ TypeScript。
- UI：Tailwind CSS 或保留 CSS Modules；界面语言默认中文（zh-CN）。
- 数据库：SQLite + Prisma。
- 会话与鉴权：`iron-session`（单用户，用户名/密码）。
- Markdown 编辑器：`@uiw/react-md-editor`（实时预览）。
- Markdown 渲染：`remark-gfm`、`rehype-highlight`、`rehype-sanitize`。
- 文本格式化：`pangu`（自动在中英文间添加空格）。
- 上传存储：本地文件系统 `public/uploads/`；文件名为 `<sha256>.<ext>`。
- AI SDK：OpenAI SDK；通过 `OPENAI_BASE_URL` 指向兼容 OpenAI 协议的服务端；启用 `response_format={ type: 'json_object' }` 返回结构化 JSON。


## 3. 数据模型（Prisma 约定）

说明：以下为模型约束与字段规范。实现时应与 Prisma schema 同步，类型命名统一使用 PascalCase，字段使用 camelCase。

- User
  - id: String @id @default(cuid())
  - username: String @unique
  - passwordHash: String
  - createdAt: DateTime @default(now())

- Post
  - id: String @id @default(cuid())
  - title: String
  - slug: String @unique
  - contentMd: String
  - summary: String?            // 单段摘要，可选
  - coverUrl: String?
  - status: PostStatus          // DRAFT | PUBLISHED
  - publishedAt: DateTime?
  - seriesId: String?
  - autoSummary: Boolean @default(true)
  - metaJson: Json              // { tags: string[] }
  - assetHashes: Json           // string[]，正文引用的附件哈希
  - createdAt: DateTime @default(now())
  - updatedAt: DateTime @updatedAt

- Series
  - id: String @id @default(cuid())
  - slug: String @unique
  - title: String
  - description: String?
  - orderJson: Json             // 文章 ID 排序

- Attachment
  - id: String @id @default(cuid())
  - sha256: String @unique
  - ext: String
  - mime: String
  - size: Int
  - path: String                // 形如 /uploads/<sha256>.<ext>
  - refCount: Int @default(0)
  - createdAt: DateTime @default(now())
  - updatedAt: DateTime @updatedAt

- AIReview
  - id: String @id @default(cuid())
  - postId: String
  - kind: AIReviewKind          // PUBLISH_METADATA | SUMMARY
  - model: String               // 实际模型名
  - inputHash: String           // 请求输入哈希
  - ok: Boolean                 // 调用是否成功
  - errorMessage: String?
  - outputJson: Json?           // 成功或部分失败时的结构化输出
  - rawText: String?            // 模型原始文本
  - tokenUsage: Int             // 总 token；如可区分则存入 outputJson
  - cost: Decimal?              // 依据数据库配置的费率计算
  - createdAt: DateTime @default(now())

- Config
  - id: String @id @default(cuid())
  - key: String @unique         // 配置键
  - value: String               // 配置值
  - updatedAt: DateTime @updatedAt

枚举：

- enum PostStatus { DRAFT PUBLISHED }
- enum AIReviewKind { PUBLISH_METADATA SUMMARY }

约束：不引入 Revision 模型；Tag 不建表，按文章内置 `metaJson.tags` 保存。


## 4. API 契约（关键端点）

路径以 App Router 为准。所有写操作需会话校验（单用户登录），并做基础的 Origin/Referer 校验或 CSRF Token（可选）。返回 JSON，包含 `ok`、`data`、`error` 三段式结构。

- Auth
  - POST `/api/auth/login`：提交 `username`、`password`，校验并建立会话。
  - POST `/api/auth/logout`：销毁会话。
  - GET `/api/auth/session`：返回当前会话基本信息。

- Posts
  - POST `/api/posts`：创建草稿（最少 `title`、`slug`、`contentMd`）。
  - PATCH `/api/posts/:id`：编辑草稿或已发布文章（注意：发布后编辑不改变 `publishedAt`）。
  - POST `/api/posts/:id/publish`：发布流程（见第 6 节）。
  - DELETE `/api/posts/:id`：删除文章，解除附件绑定并清理无引用文件。
  - POST `/api/posts/:id/assets/rebuild`：从正文扫描 `public/uploads/` URL，回填 `assetHashes` 并校正 Attachment.refCount。

- Upload
  - POST `/api/upload`：`multipart/form-data` 单文件上传。
    - 服务端计算 SHA256；若已存在则复用（不写盘），否则保存到 `public/uploads/<sha256>.<ext>` 并创建 Attachment 记录。
    - 可选参数 `postId`：若传入则完成绑定（幂等：重复绑定不增计数）。
    - 响应：`{ sha256, url, mime, size }`。

- AI（服务端调用 OpenAI SDK）
  - POST `/api/ai/publish-assist`（内部调用，或供联调）：触发 AI 模型完成关键词+加粗与摘要（摘要可按需跳过）。

- Config（配置管理）
  - GET `/api/config`：获取所有配置（需鉴权，API Key 脱敏显示）。
  - PATCH `/api/config`：批量更新配置（需鉴权）。

公共页面路由：`/`、`/post/[slug]`、`/series/[slug]`；SEO 补充可后置。
管理页面路由：`/admin/config` 系统配置管理。


## 5. 附件上传与去重规范

- 存储路径：`public/uploads/`；文件名：`<sha256>.<ext>`；URL 形如 `/uploads/<sha256>.<ext>`。
- 去重：按内容 SHA256 判定；相同哈希不重复写盘与建记录。
- 绑定：
  - 绑定时将 `sha256` 收录进 `Post.assetHashes: string[]`，并对相应 `Attachment.refCount += 1`。
  - 幂等：若该 `sha256` 已在该 Post 绑定，忽略重复计数。
  - 事务：涉及 Post 与 Attachment 的更新需在单事务中完成。
- 删除文章：对 `Post.assetHashes` 中每个哈希执行 `refCount -= 1`，若变为 0 则删除文件与 Attachment 记录。
- 重建引用：`/api/posts/:id/assets/rebuild` 扫描 Markdown 正文中 `](/uploads/<sha256>.<ext>)` 或 `](<SITE_URL>/uploads/<sha256>.<ext>)`，以哈希为准更新 `assetHashes` 与 `refCount`。


## 6. 发布流程与 AI 规范

入口：`POST /api/posts/:id/publish`；参数 `{ needSummary?: boolean }`，默认读取 `Post.autoSummary`。

步骤：
1) 校验：文章存在、`title/slug/contentMd` 完整、状态为 DRAFT。
2) AI 模型调用（发布元数据阶段）：
   - 职责：抽取高价值关键词（5–10 个）
   - 输入：原始 Markdown 正文
   - 产出 JSON：`{ keywords: string[], slug?: string }`
   - 持久化：`Post.metaJson.tags = keywords`
   - 记录 AIReview(kind = PUBLISH_METADATA)
3) AI 模型调用（摘要阶段，当 needSummary = true）：
   - 职责：生成单段中文摘要（80–150 字），允许 **加粗**，禁止列表/多段。
   - 输入：原始 Markdown 正文（未格式化）
   - 产出 JSON：`{ summary: string }`
   - 持久化：`Post.summary = summary`
   - 记录 AIReview(kind = SUMMARY)
4) 文本格式化（Pangu）：
   - 使用 pangu 对原始 Markdown 正文进行格式化（自动在中英文间添加空格）
   - 持久化：`Post.contentMd = 格式化后的内容`
5) 状态迁移：`Post.status = PUBLISHED`，`Post.publishedAt = now()`。
6) 异常策略：
   - 元数据阶段返回非 JSON 或内容不合规：终止发布并报错；文章不被修改。
   - 摘要阶段失败：继续发布但不写摘要（返回告警）。


### 6.1 AI 提示词（规范版）

统一要求：
- 使用 OpenAI 兼容协议，调用时设置 `response_format: { type: 'json_object' }`（如模型支持）。
- 严格返回 JSON 对象，不包含多余文本。
- 部分模型不可靠支持 system prompt，需将提示词与输入上下文拼接在同一个 user 消息内。
- 统一采样参数：`temperature=0.7`、`top_p=0.7`、`frequency_penalty=0.3`、`top_k=50`；发布元数据阶段 `max_tokens=8192`，摘要阶段 `max_tokens=8192`。
- 默认模型：THUDM/GLM-4-32B-0414（可通过后台配置修改）。

元数据处理：关键词提取

提示模板（拼入 user 消息）：
```
你是中文技术博客的编辑助手。仅以 JSON 对象输出结果，字段必须齐全且可被机器解析。
任务：
1) 从输入的中文技术文章中抽取 5–10 个高价值关键词（名词或术语，去重，避免过长短语）。
2) 当输入中声明 needsSlug=true 且提供的 currentSlug 为形如 post-时间戳 的占位值时，请基于标题与内容生成新的 slug（仅小写字母、数字与短横线，使用简洁英语）；其它情况下不要返回 slug 字段。
输出：{"keywords": string[], "slug"?: string}
```

User 内容（建议 JSON 包裹原文）：
```
{ "title": "...", "markdown": "...", "maxKeywords": 10 }
```

摘要生成：单段摘要

提示模板（拼入 user 消息）：
```
你是中文技术写作编辑。仅以 JSON 对象输出结果，字段必须齐全且可被机器解析。
任务：
生成单段中文摘要（80–150 字），允许使用 Markdown 粗体以强调重点，但禁止列表、禁止多段、禁止换行。
输出：{"summary": string}
```

User 内容：
```
{ "title": "...", "markdown": "..." }
```


## 7. 安全与合规

- 会话：`iron-session`，Cookie 安全属性（`httpOnly`、`sameSite`、生产环境下 `secure`）。
- 密码：`bcrypt` 哈希，严禁明文存储；初始化逻辑当 DB 无用户时允许创建管理员。
- CSRF：同源策略 + 写操作校验 `Origin/Referer`；可选 CSRF token（表单或 header）。
- XSS：Markdown 渲染启用 sanitize；仅允许白名单标签/属性；对图片/链接目标做 URL 校验。
- 上传：校验 MIME 与扩展名，限制大小（如 10MB），在保存前计算哈希；服务器端生成最终文件名（用户输入不可控）。
- 日志：敏感信息（token、密码）不得写入日志；AIReview 中的文本输出仅保存模型响应 JSON。


## 8. 界面与国际化

- 默认中文界面（zh-CN）；组件文案、提示、校验信息统一中文。
- 基础页面：
  - 公共：`/` 最新及系列导航、`/post/[slug]` 详情、`/series/[slug]` 系列。
  - 管理：`/admin/login` 登录、`/admin` 仪表盘、`/admin/posts` 列表、`/admin/posts/new` 创建、`/admin/posts/[id]` 编辑、`/admin/config` 系统配置。
  - 上传：在编辑器中拖拽/粘贴图片即上传（附带 `postId`）。

### 8.1 UI 设计规范

#### 配色方案

项目统一采用**黑白灰**配色体系，确保界面简洁专业：

**主色调（Slate 系列）：**
- 主文本：`text-slate-900`（深灰黑）
- 次要文本：`text-slate-700`（中灰）
- 辅助文本：`text-slate-600`（次中灰）
- 说明文本：`text-slate-500`（浅灰）

**背景色：**
- 主背景：`bg-slate-100`（浅灰背景）
- 卡片背景：`bg-white`（白色）
- 浅色区域：`bg-slate-50`（极浅灰）

**边框与分割线：**
- 主边框：`border-slate-200`
- 次要边框：`border-slate-300`
- 分割线：`border-slate-100`

**状态色（适度使用）：**
- 成功状态：`bg-green-100 text-green-700`（仅用于状态徽章）
- 警告状态：`bg-amber-100 text-amber-700`（仅用于状态徽章）
- 禁止使用：蓝色、红色等高饱和度颜色作为主色调

#### 按钮规范

**主按钮（Primary Button）：**
```tsx
className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
```
- 用途：主要操作（保存、发布、新建等）
- 样式：深灰黑底 + 白字 + 圆角 + 过渡动效

**次要按钮（Secondary Button）：**
```tsx
className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
```
- 用途：次要操作（编辑、查看、取消等）
- 样式：白底 + 灰边框 + 灰字 + 悬停背景

**危险按钮（仅删除操作）：**
- 保持次要按钮样式，通过文字或图标表达危险操作
- 禁止使用红色背景

#### 表单控件

**输入框（Input）：**
```tsx
className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
```
- 边框：浅灰色 `border-slate-300`
- 焦点：中灰边框 + 细灰环 `focus:border-slate-400 focus:ring-1 focus:ring-slate-400`
- 字号：统一 `text-sm`
- 禁止使用彩色焦点边框（如蓝色）

**标签（Label）：**
```tsx
className="mb-1.5 block text-sm font-medium text-slate-700"
```
- 字重：`font-medium`
- 颜色：`text-slate-700`
- 间距：`mb-1.5`

**辅助文本：**
```tsx
className="mt-1 text-xs text-slate-500"
```

#### 卡片与容器

**白色卡片容器：**
```tsx
className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
```
或
```tsx
className="rounded-lg border border-slate-200 bg-white p-6"
```
- 用途：内容承载、表单区域、数据展示
- 阴影：`shadow-sm`（可选，适度使用）

**数据卡片（Dashboard）：**
```tsx
className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5"
```

#### 页面布局

**页面容器：**
```tsx
<div className="space-y-6">
  {/* 页面内容，各区块间距 6 */}
</div>
```

**页面标题区：**
```tsx
<div>
  <h1 className="text-2xl font-semibold text-slate-900">页面标题</h1>
  <p className="mt-1 text-sm text-slate-500">页面描述或说明</p>
</div>
```

**页面头部带操作：**
```tsx
<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
  <div>
    <h1 className="text-2xl font-semibold text-slate-900">标题</h1>
    <p className="mt-1 text-sm text-slate-500">描述</p>
  </div>
  <Link href="..." className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white ...">
    操作按钮
  </Link>
</div>
```

#### 消息提示

**成功/信息提示：**
```tsx
className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
```

**错误/警告提示：**
```tsx
className="rounded-lg border border-slate-300 bg-slate-100 p-3 text-sm text-slate-800"
```

**说明区块：**
```tsx
<div className="rounded-lg border border-slate-200 bg-white p-4">
  <p className="text-sm font-medium text-slate-900">说明</p>
  <ul className="mt-2 space-y-1 text-sm text-slate-600">
    <li>• 说明项 1</li>
    <li>• 说明项 2</li>
  </ul>
</div>
```

#### 状态徽章

**已发布：**
```tsx
className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700"
```

**草稿：**
```tsx
className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700"
```

#### 响应式设计

- 移动优先：基础样式针对移动端，通过 `sm:`、`md:` 等断点适配桌面端
- 表格：使用 `ResponsiveTable` 组件，移动端自动转换为卡片布局
- 按钮：移动端全宽 `w-full`，桌面端 `inline-flex`
- 网格：`grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`

#### 字体规范

- 标题：`text-2xl font-semibold`（页面级）、`text-lg font-medium`（区块级）
- 正文：`text-sm`（默认）、`text-base`（强调）
- 辅助：`text-xs`（说明文字）
- 字重：`font-semibold`（强调）、`font-medium`（标题）、默认（正文）

#### 间距规范

- 页面区块间距：`space-y-6`
- 表单字段间距：`space-y-4`
- 按钮组间距：`gap-2`
- 卡片内边距：`p-4` 或 `p-6`（重要内容）
- 列表项间距：`space-y-1`（紧密）、`space-y-3`（舒适）

#### 禁止事项

1. **禁止使用彩色按钮**：蓝色、红色、紫色等高饱和度背景色按钮
2. **禁止彩色焦点状态**：统一使用灰色系 `focus:border-slate-400`
3. **禁止过度阴影**：仅在必要时使用 `shadow-sm`，禁用 `shadow-lg` 等强阴影
4. **禁止渐变背景**：保持纯色背景
5. **禁止自定义颜色**：使用 Tailwind 预设的 Slate 色系
6. **禁止不一致的圆角**：统一使用 `rounded`（按钮/输入框）或 `rounded-lg`（卡片）

#### 交互与反馈设计原则

**提示信息位置规范：**
- 成功/错误/警告提示应显示在触发操作的按钮组右侧，作为按钮组的一部分
- 禁止在页面顶部或独立区域显示提示信息，避免视觉割裂
- 提示信息应使用 `flex-wrap` 布局，在窄屏时自动换行
- 提示文本样式：成功 `text-green-600`，错误 `text-red-600`，字号 `text-sm`

**示例（正确）：**
```tsx
<div className="flex flex-wrap items-center gap-3">
  <button type="submit" className="...">保存</button>
  <button type="button" className="...">取消</button>
  {error && <p className="text-sm text-red-600">{error}</p>}
  {success && <p className="text-sm text-green-600">{success}</p>}
</div>
```

**示例（错误）：**
```tsx
{/* 不要这样做 - 提示信息独立在上方 */}
{message && <div className="rounded-lg border p-3">...</div>}

<div className="flex gap-3">
  <button>保存</button>
  <button>取消</button>
</div>
```

**布局稳定性原则：**
- 避免提示信息的出现/消失导致页面布局抖动
- 使用内联提示（inline feedback）而非块级提示
- 自动保存等状态提示不应改变页面高度
- 关键操作的反馈应靠近操作按钮，保持视觉连贯性

#### 一致性检查清单

新增或修改页面时，确保：
- [ ] 使用 `text-2xl font-semibold text-slate-900` 作为页面标题
- [ ] 主按钮使用 `bg-slate-900` 而非彩色背景
- [ ] 次要按钮使用 `border-slate-300` 灰色边框
- [ ] 输入框焦点使用 `focus:border-slate-400` 而非蓝色
- [ ] 卡片容器使用 `border-slate-200 bg-white`
- [ ] 提示信息使用灰色系而非彩色背景
- [ ] 状态徽章仅在必要时使用绿色/黄色，且仅限状态标识
- [ ] 整体配色不超出黑白灰 + 少量状态色的范围
- [ ] 成功/错误提示显示在按钮组右侧，使用 `text-green-600` 或 `text-red-600`
- [ ] 按钮组使用 `flex flex-wrap items-center gap-3` 布局
- [ ] 避免提示信息的出现/消失导致页面布局变化


## 9. 代码组织与约定

- 目录建议（App Router）：
  - `app/` 页面与路由
  - `app/api/*/route.ts` API Route
  - `components/` 纯前端组件
  - `lib/` 通用库（`db.ts`、`auth.ts`、`ai.ts`、`upload.ts`、`config.ts`）
  - `styles/` 样式
  - `public/uploads/` 附件目录（由服务端写入）
- 命名：文件与导出使用 kebab/camel 一致性；类型与枚举使用 PascalCase。
- TypeScript：开启严格模式；后端 handler 明确类型；返回统一 `{ ok, data, error }`。
- 错误处理：服务端捕获并返回 4xx/5xx；前端 toast/对话框提示中文错误信息。
- 事务：涉及 Post 与 Attachment 的绑定/解绑定一律在事务中执行。
- 代码复用：减小总代码量，封装功能，并总是尝试复用已有的代码函数。
  - 有些时候可以略微修改原有的函数，增加参数，修改原本调用，并完成新的复用。


## 10. 开发工作流

- 依赖安装：
  - Node Latest
  - 包管理器：pnpm（建议）或 npm/yarn
- 初始化：
  - 复制 `.env.example` 为 `.env` 并填入密钥
  - `pnpm install`
  - `pnpm prisma migrate dev`（或 `prisma db push` 初期）
  - 启动：`pnpm dev`
- 首次运行：若无用户，`/admin/login` 提供初始化管理员入口。


## 11. 环境变量与配置

### 11.1 配置系统架构

系统采用混合配置方案：
- **数据库配置**（可通过后台管理）：AI 相关配置（API Key、Base URL、模型名称、费率）、站点 URL
- **.env 配置**（启动时读取）：数据库连接、会话密钥等基础设施配置

首次启动时，系统自动从 `.env` 读取 AI 相关配置并迁移到数据库 `Config` 表。后续启动优先使用数据库配置，支持通过 `/admin/config` 页面在线修改，无需重启服务。

### 11.2 .env 文件配置

必须（基础设施）：

- `DATABASE_URL`：数据库连接字符串（SQLite 默认 `file:./prisma/dev.db`）。
- `IRON_SESSION_PASSWORD`：32 字符以上随机字符串，用于会话加密。

首次启动迁移到数据库的配置：

- `OPENAI_API_KEY`：AI 服务访问密钥。
- `OPENAI_BASE_URL`：兼容 OpenAI 协议的服务端地址，示例：`https://api.siliconflow.cn/v1`
- `SITE_URL`：站点根地址（用于绝对链接、OG/RSS）。
- `MODEL_NAME`：AI 模型名称，默认 `THUDM/GLM-4-32B-0414`。
- `RATE_AI_INPUT`：AI 输入费率（元/百万 tokens），默认 `0.27`。
- `RATE_AI_OUTPUT`：AI 输出费率（元/百万 tokens），默认 `0.27`。

`.env.example` 建议内容：
```
DATABASE_URL="file:./prisma/dev.db"
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.siliconflow.cn/v1
IRON_SESSION_PASSWORD=please_change_to_a_long_random_string
SITE_URL=http://localhost:3000

MODEL_NAME=THUDM/GLM-4-32B-0414
RATE_AI_INPUT=0.27
RATE_AI_OUTPUT=0.27
```

### 11.3 配置管理

- **后台管理**：访问 `/admin/config` 查看和修改数据库配置。
- **API Key 脱敏**：后台显示时仅展示前 6 位和后 4 位，修改时需输入完整值。
- **配置缓存**：`lib/config.ts` 实现单例模式缓存，避免频繁查询数据库。
- **即时生效**：修改配置后立即更新缓存，无需重启服务。


## 12. 质量保障与测试

- 单元测试：
  - 解析与重建 `assetHashes` 的工具函数
  - 上传接口：哈希去重与绑定幂等
- 发布流程：元数据阶段失败时的回滚、摘要阶段失败时的降级
- 端到端：
  - 登录 → 创建草稿 → 上传图片 → 发布 → 前台可见
  - 删除文章 → 附件 refCount 归零及文件清理
- 代码扫描：ESLint + TypeScript 严格模式。


## 13. 里程碑

- M1 基础与鉴权：
  - Next.js + Prisma(SQLite) + iron-session，User/Post/Series/Attachment/AIReview
  - `/admin/login`、文章 CRUD、上传（哈希去重 + 绑定）
- M2 编辑与渲染：
  - Markdown 编辑器、粘贴/拖拽上传、sanitize 与代码高亮
  - `assets/rebuild` 工具与接口
- M3 发布与 AI：
  - AI 元数据处理（关键词+加粗+slug）与单段摘要；发布流水线完整
  - AIReview 记录模型/用量/成本
  - 配置管理系统（Config 表 + 后台管理页面）
- M4 公共页与 SEO：
  - 列表/详情/系列；meta keywords/summary；sitemap/rss（可后置）


## 14. 代理协作准则（对本仓库的 AI/Human）

- 精准改动：只修改需求涉及范围，避免无关重构与命名大改。
- 与本文档一致：若实现与本规范存在冲突，优先更新本文档或在 PR 中说明偏差理由。
- 文本与 UI 均使用中文；错误信息清晰、可读、可定位。
- 安全默认开启：会话保护、XSS 防护、上传校验、事务一致性。
- 记录与可观测：AI 调用必须写入 AIReview；重要动作保留日志（不含敏感信息）。
- 可回退：发布流程中如元数据处理不合规，须原子失败，不得修改正文；摘要失败允许继续发布但不写摘要。


## 15. 附录：调用形态（示例伪代码）

元数据处理：
```
const model = await getConfig('MODEL_NAME') || 'THUDM/GLM-4-32B-0414'
const prompt = `${SYSTEM_PROMPT_METADATA}\n\n${JSON.stringify({ title, markdown, maxKeywords: 10 })}`
const res = await fetch(chatCompletionEndpoint, {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 8192,
    temperature: 0.7,
    top_p: 0.7,
    frequency_penalty: 0.3,
    top_k: 50
  })
})
// 解析 JSON：{ keywords, slug? }

// Pangu 格式化（发布时应用）
import pangu from 'pangu'
const formattedMarkdown = pangu.spacingText(markdown)
```

摘要生成：
```
const model = await getConfig('MODEL_NAME') || 'THUDM/GLM-4-32B-0414'
const prompt = `${SYSTEM_PROMPT_SUMMARY}\n\n${JSON.stringify({ title, markdown })}`
// 类似调用方式
// 解析 JSON：{ summary }
```

AIReview 记录建议：
```
await prisma.aIReview.create({
  data: {
    postId,
    kind: 'PUBLISH_METADATA',
    model: actualModelName,
    inputHash,
    outputJson: parsed,
    tokenUsage: res.usage?.total_tokens ?? 0,
    cost: await calcCostForAI(res.usage)
  }
})
```

以上规范为单一事实来源（Single Source of Truth）。若未来需求变更，请先更新本文件后再实施代码调整。


## 16. 提交规范与工作流（Conventional Commits / cz）

- 统一使用 cz（Conventional Commits）风格进行提交：`type(scope): subject`。
- 常用 `type`：
  - `feat` 新功能；`fix` 缺陷修复；`docs` 文档；`style` 代码风格（不影响逻辑）；
  - `refactor` 重构（无功能变更）；`perf` 性能优化；`test` 测试相关；
  - `chore` 杂项/构建/脚手架；`build` 构建系统或依赖；`ci` CI 配置；`revert` 回滚。
- `scope` 建议使用模块/目录名（如 `auth`、`posts`、`ai`、`upload`、`db`、`public`、`git`、`agents` 等）。
- `subject` 使用简体中文，动宾结构，尽量不超过 72 字符；无需句号。
- 提交正文可按需补充背景、实现与风险，换行宽度 100；必要时在页脚添加 `BREAKING CHANGE:` 与影响说明。

示例：
- `docs(agents): 增补提交规范与分支策略`
- `chore(git): 完善 .gitignore 并添加 uploads 占位文件`
- `feat(auth): 基于 iron-session 完成登录会话`
- `fix(upload): 绑定幂等性判断遗漏导致计数异常`

分批提交建议（仿照开发流程）：
1) `docs(agents)`: 先补充或更新本文档（规范先行）。
2) `chore(git)`: .gitignore、项目脚手架与目录占位文件（如 `public/uploads/.gitkeep`）。
3) `feat(init)` 或按模块拆分提交：`db`（Prisma 与模型）、`auth`、`posts`、`upload`、`ai`、`public`（前台页）。
4) `test(...)`: 单元/端到端测试与测试数据。
5) 其他增量变更按最小可回退单元提交，避免“大杂烩”。

分支与评审（可选）：
- 默认 `main`；较大改动走功能分支 `feat/<module>-<short>`，合并前自测并补充文档。
- PR/变更说明以本文档为基准，若存在偏差需在说明中明确原因。


## 17. 常见问题与最佳实践

### 17.1 Prisma 与数据库管理

**问题：数据库 Schema 与 Prisma Schema 不同步**

症状：
- 构建时出现类型错误，如 `Type 'XXX' is not assignable to type 'YYY'`
- 运行时出现 `Value 'XXX' not found in enum 'YYY'` 错误
- 数据库中有旧的表或列在 Prisma schema 中不存在

根本原因：
1. 数据库中存在旧的枚举值、表或列，但 Prisma schema 已更新或删除相关定义
2. Prisma Client 缓存未更新，与最新 schema 不一致
3. 存在多个数据库文件（如 `prisma/dev.db` 和 `prisma/prisma/dev.db`）导致混淆

解决方案：
```bash
# 1. 重新生成 Prisma Client（修复类型不同步）
npx prisma generate

# 2. 检查数据库路径配置
grep DATABASE_URL .env
# 应该是 file:./prisma/dev.db

# 3. 同步 schema 到数据库（开发环境）
npx prisma db push --accept-data-loss

# 4. 或运行迁移（生产环境）
npx prisma migrate deploy
```

**最佳实践：**
- 修改 Prisma schema 后立即运行 `npx prisma generate` 更新类型
- 删除模型或枚举值前，先确认数据库中是否有依赖数据
- 仅在 `prisma/` 目录下保留一个数据库文件，避免路径混淆
- 定期运行 `npx prisma db push` 或 `npx prisma migrate dev` 保持同步
- 构建失败时，首先检查 Prisma Client 是否与 schema 同步

### 17.2 React Hooks 使用规范

**问题：Hooks 在条件语句中调用**

错误示例：
```typescript
// ❌ 错误：Hooks 在三元表达式中被条件性调用
const { savedData, clearSaved } = mode === "create" 
  ? useAutoSave("draft-post-new", draftData!)
  : { savedData: null, clearSaved: () => {} };
```

React 规则：**Hooks 必须在组件顶层调用，不能在条件语句、循环或嵌套函数中调用**。

正确示例：
```typescript
// ✅ 正确：总是调用 Hook，根据条件决定参数或使用返回值
const autoSaveResult = useAutoSave(
  "draft-post-new", 
  mode === "create" ? draftData! : null
);
const { savedData, clearSaved } = mode === "create" 
  ? autoSaveResult
  : { savedData: null, clearSaved: () => {} };
```

**最佳实践：**
- 所有 Hooks 调用必须在组件的顶层，不受条件控制
- 使用条件参数（如 `null`、`undefined`）而非条件性调用
- 在自定义 Hook 中处理条件逻辑，而非在调用处
- 启用 ESLint 的 `react-hooks/rules-of-hooks` 规则并及时修复警告

### 17.3 异步函数调用规范

**问题：异步函数缺少 await**

错误示例：
```typescript
// ❌ 错误：calcCostForAI 返回 Promise，但缺少 await
cost: calcCostForAI(ctx.usage ?? {}) ?? undefined,
```

症状：
- TypeScript 编译错误：`Type 'Promise<T>' is not assignable to type 'T'`
- 运行时 `cost` 值为 `[object Promise]` 而非实际数值

正确示例：
```typescript
// ✅ 正确：使用 await 等待 Promise 完成
cost: (await calcCostForAI(ctx.usage ?? {})) ?? undefined,
```

**最佳实践：**
- 调用返回 `Promise` 的函数必须使用 `await` 或 `.then()`
- 在 TypeScript 中启用严格模式，尽早发现类型错误
- 函数命名清晰表明是否异步（如 `calcCostForAI` vs `calcCostFromUsage`）
- 对于异步操作密集的代码，考虑使用 `Promise.all()` 并行化

### 17.4 useCallback 依赖项管理

**问题：useCallback 依赖数组不完整**

症状：
- ESLint 警告：`React Hook useCallback has a missing dependency`
- 函数闭包捕获过期的状态或函数引用
- 运行时行为不符合预期

解决方案：
```typescript
// 将回调中使用的所有外部变量和函数都加入依赖数组
const handleSubmit = useCallback(async () => {
  // 使用了 uploadPendingImages、pendingImages、router 等
  const urlMap = await uploadPendingImages(postId);
  // ...
}, [
  // 所有使用的外部依赖
  mode, disabled, title, content, autoSummary, hidden, 
  seriesId, slug, post?.id, pendingImages, router, 
  clearSaved, uploadPendingImages  // ← 不要遗漏
]);
```

**最佳实践：**
- 启用 ESLint 的 `react-hooks/exhaustive-deps` 规则
- 不要忽略依赖警告，添加所有使用的外部变量和函数
- 对于频繁变化的函数依赖，考虑用 `useCallback` 包裹它们
- 如果依赖数组过长，考虑重构函数逻辑或使用 `useReducer`

### 17.5 构建错误排查流程

当 `pnpm build` 或 `npm run build` 失败时，按以下顺序排查：

1. **类型错误（TypeScript）**
   - 检查 Prisma Client 是否最新：`npx prisma generate`
   - 检查依赖包版本是否兼容
   - 运行 `npx tsc --noEmit` 单独检查类型错误

2. **Linter 错误（ESLint）**
   - React Hooks 规则：检查是否有条件性调用 Hooks
   - 依赖数组：检查 `useEffect`/`useCallback` 的依赖是否完整
   - 未使用的变量：清理或添加 `// eslint-disable-next-line`

3. **运行时错误（构建阶段静态生成）**
   - 检查数据库连接和数据完整性
   - 检查环境变量是否完整（`.env` 文件）
   - 检查 API 路由是否正确实现

4. **数据库相关错误**
   - 运行 `npx prisma db push` 同步 schema
   - 检查是否有多个数据库文件
   - 清理旧的迁移或数据：`npx prisma db push --accept-data-loss`（仅开发环境）

**构建前检查清单：**
- [ ] 运行 `npx prisma generate` 更新 Prisma Client
- [ ] 运行 `npx prisma db push` 同步数据库 schema
- [ ] 运行 `pnpm lint` 或 `npm run lint` 检查代码规范
- [ ] 确认 `.env` 文件配置完整
- [ ] 删除 `.next` 缓存后重新构建（如果遇到奇怪的缓存问题）
