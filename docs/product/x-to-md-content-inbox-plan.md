# x-to-md Content Inbox 产品方案

## 1. 文档信息

- 产品：x-to-md Chrome 扩展
- 版本方向：Content Inbox / X Article 工作台
- 状态：产品方案，待实现
- 范围：订阅指定作者、手动获取指定时间范围内的 Article、候选集、素材库
- 不在本期：关键词热门搜索、后台定时监控、X API、自动发布、云端同步

## 2. 产品目标

用户当前的工作链路是：

> 浏览 X → 筛选内容 → Extract and copy → 粘贴到 x-to-xhs → 生成小红书笔记 → 人工审核发布

本期先缩短“找作者 Article、筛选、进入提取”的路径，同时保留用户对读取、提取和保存的明确控制。

产品结果不是自动替用户决定选题，而是提供一个可回溯的本地选题收件箱：

1. 用户维护关注的作者；
2. 用户手动选择时间范围并获取 Article；
3. 用户将有价值的 Article 加入候选集；
4. 点击候选标题打开 X 原文；
5. 用户在原文页点击 Extract and copy；
6. 用户主动保存为素材，供后续小红书创作复用。

## 3. 产品形态

主界面使用 Chrome Side Panel，不设计为独立 SaaS 后台，也不把核心流程塞进 Chrome Action Popup。

| 载体 | 职责 |
|---|---|
| X 原文页 | 现有 Extract and copy、预览、复制、保存素材 |
| Chrome Action Popup | 快捷入口：提取当前页、打开 Side Panel |
| Chrome Side Panel | 订阅源、候选集、素材库 |

Side Panel 以 X 的窄栏信息密度为视觉基准；用户无需离开 X，就能在右侧完成筛选和管理。候选 Article 的正文不在 Side Panel 中伪造展示，标题点击后打开 X 原文，再由原页面完成真实 DOM 提取。

## 4. 核心导航

Side Panel 顶部使用 X 式 53px 顶栏，页面之间使用返回按钮和页面标题切换：

- 候选集：当前待处理的 Article；
- 关注作者：X UserCell 作者列表与关注状态；
- 素材库：用户已经主动保存的 Markdown 素材。

不使用左侧导航栏、数字步骤、仪表盘卡片、统计图表或独立后台壳层。

## 5. 页面设计

### 5.1 关注作者

目标：使用 X Follow UI 维护用户在原文中主动关注的作者。

页面结构：

1. 作者 UserCell 列表：40px 头像、显示名、认证标识、`@handle` 和简介；
2. 已关注作者只显示 X 式白底描边 `Following` 胶囊按钮；
3. 鼠标悬停或键盘聚焦时，按钮使用 X destructive token 并显示 `unfollow`；
4. 点击 `unfollow` 直接取消关注并从列表移除；
5. 点击作者头像、姓名、handle 或简介区域，在新标签页打开 `https://x.com/<handle>`；
6. 页面不提供手动添加、查看详情、编辑、启停、扫描或删除等其他作者操作。

### 5.2 候选集

目标：集中查看已发现但尚未处理的 Article。

页面结构：

1. X 式顶栏：返回、`候选集`、筛选图标；
2. 上下文行：作者、时间范围、`重新获取`；
3. Article Cell 列表；
4. 每个 Cell 包含头像、作者名、handle、发布时间、Article 标题、来源和处理状态；
5. 选中态只使用浅色 hover/selected 背景，不使用卡片阴影；
6. 标题点击打开原始 X Article；
7. 用户回到原文页后点击现有 `Extract and copy`；
8. 候选状态更新为 `已提取`，候选卡右上角 `•••` 菜单提供 `添加至素材库`；用户在该原文标签页点击后，Markdown 保存到素材库且候选从当前列表移除；
9. 每个候选卡右上角 `•••` 菜单提供 `忽略候选`，点击后从当前列表移除。

候选状态：

- `新发现`
- `已查看`
- `已提取`
- `已忽略`
- `已保存素材`

### 5.3 素材库

目标：管理已经主动保存的 Markdown 素材，而不是保存所有发现内容。

页面结构：

1. X 式顶栏：返回、`素材库`、搜索图标；
2. X 风格搜索输入；
3. Tab：`全部`、`未使用`、`已用于创作`；
4. Article Cell 列表：标题、作者、保存时间、来源、轻量标签；
5. 选中后展开 Markdown 摘要；
6. 操作使用蓝色文本链接：`复制 Markdown`、`打开原文`、`编辑`、`删除`；
7. 删除需要确认，并说明删除后的可恢复性。

## 6. 关键交互流程

```mermaid
flowchart LR
  A[X 原文: hover/focus 原生 Follow/Following] --> B[Follow 或 unfollow]
  B --> C[Side Panel: Following]
  C --> D[unfollow]
  E[X 原文: hover/focus Bookmark] --> F[添加至收件箱或移出收件箱]
  F --> G[打开 X 原文]
  G --> H[Extract and copy]
  H --> I[主动保存到素材库]
```

关键原则：候选集保存发现元数据；素材库保存用户主动提取并确认保存的正文。两者不能混为一个历史列表。

## 7. 数据模型

### 7.1 订阅源 `subscriptions`

```json
{
  "id": "sub_zostaff",
  "handle": "@zostaff",
  "displayName": "zostaff",
  "profileUrl": "https://x.com/zostaff",
  "authorAvatarUrl": "https://pbs.twimg.com/profile_images/example.jpg",
  "description": "Author bio from the visible X user cell"
}
```

### 7.2 候选 `candidates`

```json
{
  "id": "article_1842517662829531137",
  "sourceUrl": "https://x.com/zostaff/status/1842517662829531137",
  "authorHandle": "@zostaff",
  "title": "Harness Engineering: Designing the Scaffolding That Every Agent Needs",
  "publishedAt": "2026-08-08T10:00:00Z",
  "discoveredAt": "2026-08-10T12:00:00Z",
  "addedAt": "2026-08-10T12:05:00Z",
  "status": "new",
  "subscriptionId": "sub_zostaff"
}
```

候选以规范化 Article URL/ID 去重。`addedAt` 记录用户加入收件箱的时间；收件箱默认按它降序，也可按 `publishedAt` 降序。候选阶段不保存正文，不保存 Cookie、令牌或剪贴板内容。

### 7.3 素材 `assets`

```json
{
  "id": "asset_article_1842517662829531137",
  "candidateId": "article_1842517662829531137",
  "sourceUrl": "https://x.com/zostaff/status/1842517662829531137",
  "title": "Harness Engineering: Designing the Scaffolding That Every Agent Needs",
  "markdown": "# Harness Engineering...",
  "tags": ["AI", "内容生产"],
  "note": "待改写为小红书选题",
  "usageStatus": "unused",
  "createdAt": "2026-08-10T12:20:00Z",
  "updatedAt": "2026-08-10T12:20:00Z"
}
```

## 8. X UI 视觉铁律

本项目的视觉基准来自用户当前打开的 X Article 页面，并已记录于仓库级 [AGENTS.md](../../AGENTS.md)。

已读取到的实际样式基准：

| Token | 实际值 |
|---|---|
| 主文字 | `rgb(15, 20, 25)` / `#0F1419` |
| X 链接蓝 | `rgb(29, 155, 240)` / `#1D9BF0` |
| 分隔线 | `rgb(239, 243, 244)` / `#EFF3F4` |
| 字体 | `TwitterChirp, -apple-system, "system-ui", "Segoe UI", Roboto, Helvetica, Arial, sans-serif` |
| 顶栏/Tab 高度 | `53px` |
| 返回按钮 | `36px`，`border-radius: 9999px` |
| Follow/主按钮 | `36px`，`border-radius: 9999px`，黑色背景 |
| 作者名 | `15px / 20px`，`font-weight: 700` |
| Article Cell 内边距 | 左右 `16px` |
| Article 封面 | 顶部圆角 `12px` |
| 搜索输入 | `14px / 16px`，高度 `40px` |

实现要求：

- 不使用渐变蓝按钮；
- 不使用通用 SaaS 左侧导航；
- 不使用卡片阴影或卡片套卡片；
- 不用大标题制造层级，使用 X 的 Cell、Tab、Profile Header 和分隔线建立层级；
- 不用图像生成结果作为 UI 生产基准；
- 真实 X 页面改变后，重新读取 token 并进行人工视觉复核。

## 9. 权限、存储与隐私

本期不接入 X API，不新增云端采集服务，不做后台轮询。

建议权限：

- `activeTab`：用户主动在当前 X 页面提取；
- 现有 X host permissions：在支持的 X 页面运行内容脚本；
- `storage`：保存本地订阅源、候选元数据和用户主动保存的素材。

如未来增加手动批量获取，需要在 Manifest 中新增权限或扩大页面访问范围，必须单独说明、补充测试并重新确认。

## 10. 异常与空状态

- 未登录 X：`请先在 X 登录后再获取 Article`；
- 作者页面不是 Article 列表：`未找到可识别的 Article，请缩小时间范围或打开作者 Articles 页面`；
- 达到扫描上限：`本次只检查了前 N 条内容，建议缩小时间范围`；
- 无新 Article：`该时间范围内没有发现新的 Article`；
- 原文已删除：`原文已无法访问，候选元数据仍保留`；
- 提取失败：复用现有 Extract and copy 错误提示，不创建重复错误体系；
- 素材为空：`保存前请先完成 Extract and copy`。

## 11. 验收标准

### 功能

- 可以从 Profile Summary、Follow 列表 UserCell、Article 作者头部和 Profile 头部的原生 `Follow` 或 `Following` 按钮 hover/focus 管理扩展关注状态，不需要选取作者名称，且不影响 X 原生按钮点击；未在扩展列表时显示 `Follow`，已在列表时显示 `Following` 并在 hover/focus 变为红色 `unfollow`；增删后 Side Panel 实时同步头像、姓名、认证标识、handle 与可用简介；
- 已关注状态显示 `Following`，悬停/聚焦显示红色 `unfollow`，点击后取消关注；
- 关注作者页不存在手动添加、详情、编辑、启停、扫描或独立删除入口；
- 获取结果按 Article URL/ID 去重；
- Article 卡片或原文的原生 Bookmark 按钮在 hover/focus 时，于其左侧相邻位置显示书签操作，不得遮挡原生 Bookmark；未在收件箱时显示蓝色“添加至收件箱”，已在收件箱时显示实心书签状态并在 hover/focus 切换为红色“从收件箱移除”；移除后可再次添加，`ignored`/`saved` 历史候选会复用并恢复为 `new`，不产生重复 URL，且不会删除素材库；左侧空间不足时回退到右侧；
- 可以将 Article 加入候选集、忽略候选、重新获取；
- 点击候选标题能打开对应 X 原文；
- 现有 Extract and copy 链路不被破坏；
- 用户主动保存后素材进入素材库；
- 素材库支持搜索、编辑标签/备注、复制 Markdown、打开原文和删除。

### 视觉与交互

- Side Panel 使用 X 式 53px 顶栏和 Tab 结构；
- 文章列表使用 X Cell 与 1px 分隔线；
- 主要按钮使用 X 的黑色胶囊样式；
- 链接使用 `#1D9BF0`，不使用渐变；
- 420px 左右宽度下不出现横向滚动；
- 键盘焦点、Esc 返回、加载、空状态和失败状态可见且可操作。

### 验证边界

静态检查和 Node 测试不能证明真实 X DOM、Side Panel 尺寸、剪贴板、响应式和浏览器交互已经通过。实现后必须在真实 Chrome、真实 X Article 页面和至少一个窄宽 Side Panel 中人工验收。

## 12. 实施顺序

1. 将 Side Panel 加入 Manifest，并建立共享 X UI token 与组件样式；
2. 实现 X Follow UserCell 与单一 Following/unfollow 操作；
3. 实现 Article 识别、时间筛选、去重和候选状态；
4. 将候选标题接入原文打开与现有 Extract and copy；
5. 实现素材库 CRUD、搜索和 Markdown 复制；
6. 补充异常/空状态、权限说明和测试；
7. 在真实 X 页面进行人工视觉与交互验收。
