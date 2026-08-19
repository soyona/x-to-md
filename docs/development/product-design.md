# x-to-md 产品设计规范

本文件是 x-to-md 产品定义、用户旅程、场景、信息架构、产品状态和 UI 设计的单一权威来源。X DOM owner、锚点和注入生命周期以 `docs/development/x-dom-integration.md` 为准；schema、消息和持久化原子性以 `docs/development/repository-contracts.md` 为准。

## 产品定义

- 定位：x-to-md 是 Article-first 的 Chrome 扩展，帮助用户在 X 中发现、筛选、保存并复用高质量 Article。
- 核心任务：把用户判断有价值的 X Article，从稍后阅读对象转化为可搜索、可标记、可复制 Markdown 的复用素材。
- 管理对象：Article 和作者是可跨会话管理的对象；素材的完成状态由用户是否已使用表达。
- Post 边界：Post 仅在详情页支持即时复制 Markdown，不进入待读、素材、作者闭环或 Preview。
- 质量边界：Article 是否高质量由用户判断；产品不做自动评分、推荐或作者质量分级。
- 成功标准：用户能够以最短路径完成 `发现 → 待读 → 原文 → 素材 → 复用`，并能通过作者继续发现新的 Article。

### 非目标

- 不处理普通 Post 列表，不做 Post 收藏、Post 素材管理或回复/引用内容采集。
- 不做自动推荐、内容生成、发布系统、跨平台同步或 X API 数据抓取。
- 不把统计、设置、发布链接或导航未读角标恢复为一级产品能力。

## 完整用户旅程

主闭环：`发现 Article → 加入待读 → 打开原文 → 保存为素材 → 预览/复制 Markdown → 标记已使用`。

| 阶段 | 用户目标 | 场景与入口 | 用户动作 | 系统反馈与数据结果 | 下一步 |
|---|---|---|---|---|---|
| 1. 发现 | 识别值得稍后处理的 Article | X Home、历史、作者 Posts 或 Articles 列表中的可确认 Article Card | 打开 x-to-md 菜单，选择“加入待读” | Toast 确认；Article 按规范化 URL 进入待读，列表不采集正文 | 继续浏览或进入待读 |
| 2. 筛选 | 回看已选择的 Article | Side Panel 默认进入“待读” | 搜索、打开原文或移除 | 打开权威 X 原文；移除后该 Article 回到未管理状态 | 阅读原文 |
| 3. 保存 | 把有价值的 Article 转为素材 | Article 详情页的 x-to-md 菜单 | 选择“保存为素材” | 当前原文采集成功后才写入素材，并自动移出待读；失败时保持原状态且不产生空素材 | 打开素材库或继续阅读 |
| 4. 检查与复制 | 获取可复用 Markdown | Article 详情选择“预览 / 复制 Markdown”，或从素材库打开预览 | 检查内容、复制 Markdown、打开原文 | 当前页 Preview 可继续保存；已保存素材 Preview 不重复提供保存；复制不改变持久状态 | 在外部工作中使用内容 |
| 5. 复用完成 | 区分待使用与已使用素材 | Side Panel“素材库” | 添加标签、搜索、复制并标记“已使用” | `usageStatus` 在未使用/已使用间切换，素材和 Markdown 保留 | 后续检索或删除 |
| 6. 持续发现 | 沿高质量作者发现更多 Article | Article 详情菜单或 Side Panel“作者” | 收藏作者，打开其 Articles | 作者按 handle 去重保存；打开作者 Articles 后回到发现阶段 | 形成下一轮闭环 |

### 旅程捷径与失败规则

- 用户可直接打开 Article 详情并保存为素材，不必先加入待读；结果仍进入同一素材状态。
- 用户可在 Article 详情先预览/复制而不保存；Preview 是一次性会话，不产生持久数据。
- Post 详情复制成功或失败都不产生产品状态；Post 回复、引用和推荐 Card 不参与旅程。
- Article 采集失败、原文 URL 不一致或 Markdown 为空时，不创建素材、不移出待读，并向用户显示可操作错误。

## 场景、入口与动作矩阵

本矩阵定义产品语义；具体 DOM owner、锚点和排除条件由 `docs/development/x-dom-integration.md` 约束。

| 场景 | 是否注入 | 入口 | 动作 | 完成结果 |
|---|---|---|---|---|
| 普通 Post 列表 | 否 | 无 | 无 | 不干扰即时浏览 |
| Post 详情 | 仅当前 URL 对应的主 Post | Grok actions 左侧的独立 x-to-md 入口 | “复制 Markdown” | 写入剪贴板；不预览、不持久化 |
| Article 列表 | 仅可确认的 Article Card | Card 内 Grok actions 左侧的独立入口 | “加入待读/从待读移除” | 更新待读；不采集正文 |
| Article 详情 | 仅当前权威主 Article | Grok/Summarize 左侧的独立入口 | 依次为“保存为素材/从素材库移除”“预览 / 复制 Markdown”“收藏作者/取消收藏作者” | 更新素材、打开一次性 Preview 或更新作者 |
| Side Panel 待读 | 始终可用 | 一级导航“待读” | 搜索、打开原文、移除 | 回到原文或未管理状态 |
| Side Panel 素材库 | 始终可用 | 一级导航“素材库” | 搜索、筛选、标签、预览/复制、使用状态、删除 | 管理可复用素材生命周期 |
| Side Panel 作者 | 始终可用 | 一级导航“作者” | 打开作者 Articles、取消收藏 | 继续发现或移除作者 |
| 当前 Article Preview | Article 详情触发 | “预览 / 复制 Markdown” | 保存为素材、复制 Markdown、打开原文 | 可进入素材状态；关闭后会话消费完毕 |
| 已保存素材 Preview | 素材 Card 触发 | “预览 Markdown” | 复制 Markdown、打开原文 | 不重复保存，不改变素材状态 |

## Side Panel 信息架构

Side Panel 是唯一主工作界面，默认页为“待读”，只保留三个一级页面：

```text
Side Panel
├─ 待读（默认）
│  ├─ 搜索 Article
│  └─ Article：打开原文 / 从待读移除
├─ 素材库
│  ├─ 搜索
│  ├─ 全部 / 未使用 / 已使用筛选
│  └─ 素材：标签 / 预览与复制 / 打开原文 / 使用状态 / 删除
└─ 作者
   └─ 作者：打开其 Articles / 取消收藏
```

- 待读负责延后决策，不承担正文预览、标签和使用状态。
- 素材库负责复用管理；只有具备完整 Markdown 的 Article 才能出现。
- 作者负责继续发现，不承载作者评分、分组或 Post 时间线。
- 保存成功后，素材成为权威管理对象，同 URL 待读项自动消失；删除素材不会自动退回待读。
- 每个页面必须定义空状态；错误通过就近反馈或 Toast 表达，不新增独立错误页。

## 核心产品状态

### Article 状态机

```text
未管理 ──加入待读──> 待读
未管理 ──直接保存成功──> 素材·未使用
待读 ──保存成功──> 素材·未使用
素材·未使用 ──标记已使用──> 素材·已使用
素材·已使用 ──标记为未使用──> 素材·未使用
待读 ──移除──> 未管理
素材·未使用 / 素材·已使用 ──删除──> 未管理
```

| 转换 | 前置条件 | 成功结果 | 失败结果 |
|---|---|---|---|
| 未管理 → 待读 | 可确认的 Article URL | 创建或更新唯一待读项 | 保持未管理 |
| 待读/未管理 → 素材·未使用 | 当前权威原文采集成功、URL 一致、Markdown 非空 | 写入完整素材并移除同 URL 待读项 | 保持原状态，不创建半成品 |
| 素材 → 同一素材状态 | 重复保存同 URL Article 且采集成功 | 更新元数据和 Markdown，保留标签与 `usageStatus` | 保持原素材不变 |
| 素材·未使用 ↔ 素材·已使用 | 素材存在 | 只更新 `usageStatus` | 保持原状态 |
| 待读 → 未管理 | 用户移除 | 删除待读项 | 保持待读 |
| 素材 → 未管理 | 用户确认删除 | 删除素材，不恢复待读 | 保持素材 |

### 独立与瞬时状态

- 作者只有“未收藏/已收藏”两个独立状态，按 handle 去重；它不随 Article 素材状态自动变化。
- Preview 是 `未打开 → 当前页 Preview/素材 Preview → 已消费` 的 session 瞬时状态，不属于持久化闭环。
- Post 永远保持非管理对象；复制 Markdown 是一次性动作，不产生 reading、asset 或 author 状态。

## 视觉语言

- 使用 `TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` 字体栈和当前 X light token：主文字 `#0f1419`、次级文字 `#536471`、品牌蓝 `#1d9bf0`、分隔线 `#eff3f4`、浅背景 `#f7f9f9`。
- 使用 1px 分隔线、圆形或胶囊控件、紧凑信息密度以及 X 式 hover、focus、active、disabled、destructive 状态。
- 不引入 SaaS 卡片、Windows 弹窗、自创颜色、装饰性渐变或无语义圆角。内容分组优先依靠层级、间距和分隔线。
- 保持当前 light token 体系；主题系统不在当前产品范围内。

## 图标契约

- 图标先满足动作语义，再满足 X 风格。统一使用 `24×24` viewBox、24px 菜单槽位、18.75–26px 可见尺寸、`currentColor`、固定点击热区和当前页填充态。
- x-to-md 页面入口使用仓库现有文档/Markdown 图形；待读使用收件托盘；素材库使用 Bookmark；作者使用人物集合。
- 保存素材使用 Bookmark-plus；预览 Article 使用 Article-eye；复制 Markdown 使用 Markdown-copy；收藏或取消收藏作者使用 person-add/person-remove。
- UI 图标的项目级单一权威源为 `assets/icons/x-to-md-ui-icons.svg`，稳定 `symbol id`、语义映射、状态和验收图以 `docs/design/icon-system.md` 为准。运行时即使因 Content Script 隔离而采用内联 SVG，也必须与权威源保持相同图形和 token。
- 新增界面必须先复用权威图标库；缺少语义时，必须先取得用户提供的 X SVG／组件证据，再同步补充图标库、规范图、语义映射和契约测试。不得在业务代码中先加入临时 path，后补规范。
- 不复制已连接的 X DOM/SVG，不用 emoji、Unicode 符号或临时字符替代图标。缺少图标证据时向用户索取 DevTools 中的最小 SVG 片段，不自行猜测 path。
- 品牌 Logo 使用用户于 2026-08-14 从 X 左侧导航 DevTools 提供的官方 `24×24` X path，与较小的 Article/Markdown 文档组合；矢量源为 `assets/icons/x-to-md-icon-source.svg`，页面内单色入口源为 `assets/icons/x-to-md-entry.svg`。不得凭截图重绘或替换官方 X path。文档描边外缘与 X 最低点对齐，内部正文线比文档外框细。
- 素材菜单的打开原文、编辑标签、使用状态和删除图标，以及素材预览动作图标，来源于用户确认的方案 1 设计图；保持 `24×24`、约 `1.9px` 圆角描边、固定图标槽和 `currentColor`。删除图标只在 destructive 动作中使用危险色。
- 完整语义映射、导航状态和设计证据以 `docs/design/icon-system.md` 为权威规范；后续按钮必须先按动作语义选择该规范中的图标，不得仅因图形相似复用相反动作的图标。
- 作者认证徽标复用用户从 X DevTools 提供的原始 `22×22` SVG：蓝色认证使用 `#1d9bf0` 单色 path，金色组织认证保留原始双渐变。待读、素材库和作者页共享同一徽标组件、尺寸与类型数据；作者 handle 的次级色不得覆盖徽标颜色。

## 组件规则

### X 页面入口与菜单

- 入口拥有独立 DOM、状态和菜单生命周期；视觉结构可参考已取证的 X slot，但不得复用 X React 状态或 Portal。
- 菜单行高 44px，图标槽 24px，图文间距 12px。文本左对齐，动态文案不得改变图标槽和文字起点。
- 再次点击入口切换菜单；点击外部、`Escape`、滚动或缩放关闭。关闭后清理 `aria-expanded`；键盘触发与鼠标触发执行同一动作。
- destructive 动作使用 X 的危险语义颜色；disabled 不接受点击；focus-visible 必须清晰且不改变布局。

### Side Panel 导航与内容

- 一级导航使用固定图标热区；active 使用 `#1d9bf0` 填充图标且无持续背景／边框，hover 使用 X 中性圆形背景，focus-visible 单独使用 2px 蓝色焦点环。状态切换不移动内容。
- 待读只提供打开原文与移除；素材库提供搜索、标签、预览、复制、使用状态和删除；作者只提供打开作者 Articles 与取消收藏。
- 空状态一句话说明当前为空以及唯一下一步，不增加营销文案或装饰插画。
- 对话框只用于不可逆确认，使用扩展自身 DOM；`Escape` 关闭，取消为默认安全动作，确认删除使用 destructive 状态。

### Preview 与 Toast

- 当前 Article 预览显示“保存为素材”“复制 Markdown”“打开原文”；已保存素材预览不重复显示保存动作。
- Toast 只确认刚完成的结果或说明可操作错误；不重复页面标题，不长期占据内容区域。

## 文案原则

- 使用用户目标而不是内部实现名：待读、素材、作者、复制 Markdown、保存为素材、标记已使用。
- 不向用户暴露 candidate、materialize、job、schema、capture 等工程状态。
- 菜单动词与结果一致；互斥状态使用“加入/移除”“收藏/取消收藏”“标记为已使用/未使用”。

## 证据与验收边界

- 禁止自动启动 Chrome、浏览器自动化或真实 X 视觉验收。
- 当现有文档和源码不足以确认 X DOM、SVG、尺寸或交互状态时，停止实现相关未知部分，并明确列出需要用户从 Chrome DevTools 提供的最小节点源码、属性或计算样式；禁止依据页面印象猜测。
- 静态测试、语法检查和源码审查只能证明项目契约，不得表述为真实 X DOM、剪贴板权限、视觉对齐或扩展加载行为已通过。
