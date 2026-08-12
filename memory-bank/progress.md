# Progress

更新日期：2026-08-11

## 当前待办

- [ ] 在下一次 X 页面结构变更或功能迭代时，使用真实推文与 Article 人工复核采集、预览和复制链路。
- [ ] 使用真实 X 推文与 Article 验证 v2 原生预览的像素级视觉一致性。
- [ ] 在真实 Chrome Side Panel 中人工验收 Content Inbox 写入与素材保存；作者 Articles 页面 DOM 识别已完成实测。
- [ ] 在真实 Chrome Side Panel 人工验收素材库的封面完整显示、历史占位降级、窄宽可读性，以及从收件箱保存和直接保存的元数据继承。
- [ ] 在真实 X 的作者主页 Posts、作者 Articles、Home 与 Bookmarks 人工验收：Card Bookmark/More 只导航至对应原文，且只有原文 Bookmark/More 执行 `Extract and copy`。
- [ ] 在真实 Chrome 中以 600 CSS px、@2x 对照 X Bookmarks 基准验收候选 Card 的默认、红色移除 hover/focus 和移除后补位状态；同时验证窄宽流式收缩、真实互动快照和切换到错误原文时的阻止提示。
- [ ] 在真实 Chrome 的 Article 帖子操作栏 hover/focus 原生 Bookmark，人工验收“添加至收件箱/从收件箱移除”双态书签的位置、尺寸、destructive hover、实时同步及再次添加；需包含扩展重载前已打开页面点击 Action 后的补注入场景。

## 已完成

- [x] 素材库 Card 不渲染 Markdown 摘要或展开状态；完整 Markdown 通过底部工具栏的“预览 Markdown”打开一次性阅读页，原始 Markdown 复制保持可用。
- [x] 素材库 Markdown 预览统一为图标式复制与关闭操作；作者可跳转 X 主页，发表日期显示为本地 M/D/YYYY，固定栏不再重复素材标题，正文始终保留单一 H1。
- [x] 移除 Side Panel 当前 X 原文上下文、提示和保存操作；收件箱、关注作者、素材库三页统一从管理内容开始。增加设置图标与导航栏左侧、右侧、隐藏偏好；隐藏时可通过无文字图标恢复。
- [x] 左侧收件箱、关注作者和素材库导航增加 X 样式未读数字角标：新增记录按类型累计，点击对应导航项后清除；首次启用仅建立历史已读基线。
- [x] 素材库卡片改为“预览”打开一次性 Markdown 阅读页；发布入口校验 HTTPS URL 并识别小红书、Reddit、微信和 B 站，底部左侧显示各平台可跳转的品牌复刻图标；创作状态移除冗余文字并改用加粗圆形勾的蓝色状态。
- [x] 素材库卡片对齐 X 交互：显示作者头像，作者姓名与 handle 可打开 X 主页；复制、创作状态和添加标签使用同尺寸图标按钮并右对齐；标签在卡片内以可删除 chip 呈现并支持直接新增；三点菜单只保留删除且按视口向上或向下展开；取消备注与标签编辑对话层；收件箱和素材库统一使用 X 式搜索框，中文 IME 合成完成后筛选并保留输入焦点；素材库 Tab 显示全部、未使用、已用于创作的分类总量，数字复用收件箱日期筛选样式。
- [x] 重构素材库为可识别的 Article 素材行：保存时保留封面、标题、作者、发表时间与摘要，搜索扩展至作者名和备注，缺少封面时稳定降级。

- [x] 建立独立 Manifest V3 扩展项目与 `main` 分支。
- [x] 建立当前页面 DOM 采集、一次性预览与 Markdown 复制链路。
- [x] 建立 Markdown、采集器选择器和 Manifest 最小权限的 Node 回归测试。
- [x] 发布 `v1.0.0`。
- [x] 补齐 Popup 与 Preview 的读取中、成功、失败、过期和内容边界反馈，发布 `v1.0.1`。
- [x] 根据效果截图重构 Popup 的纵向布局与 Preview 的视觉层级，修复说明文字重叠并补充焦点与禁用态。
- [x] 修复代码块采集重复与语言标签脱离问题，使 Preview 按单一代码块显示并支持代码复制。
- [x] 将视觉预览从独立扩展页迁移到当前 X 文档，复用 X 原始 CSS、字体和容器布局，升级至 v2.0.0。
- [x] 升级插件与 package 版本至 v2.1.0。
- [x] 修复预览模式下再次点击插件时导入面板与原生预览重叠的问题。
- [x] 按 X 的基础视觉 token 与独立样式边界修正导入卡片、预览工具栏和复制菜单，避免页面全局样式污染。
- [x] 将复制菜单尺寸与阴影对齐 X Grok 参考，并在 Copy text / Copy markdown 成功后显示 `Copied to clipboard`。
- [x] 将插件用户界面文案统一为专业英文，并同步扩展元数据与无障碍标签。
- [x] 优化导入面板布局：扩大内容容器、统一内边距与按钮高度，改善英文文案的层级和可读性。
- [x] 修复 Extract and copy 按钮受 X 页面全局样式影响导致的文字不居中问题。
- [x] 将当前未发布的视觉与交互改动整理为 `v2.2.0` release。
- [x] 建立 v2.3.0 Content Inbox Side Panel：关注作者、候选去重/状态和素材库主动保存。
- [x] 使用 Anatoli Kopadze 的真实 Articles 页面验证日期筛选、标题回退、作者、发布时间、URL 和 5 条历史结果。
- [x] 修复 Side Panel 获取 Article 时 Content Script 未注入导致的断连错误，并补充重试回归断言。
- [x] 按 X Articles 时间线重构候选集，使用手动获取时可见的作者头像和文章封面，并保持候选数据不保存正文摘要。
- [x] 按实测 X Article 帖子几何校正候选卡片；列表摘要只在当前 Side Panel 内存中渲染，并在关闭后删除。
- [x] 以 X 实际 `article-cover-image`、同级标题与摘要结构提取候选元数据；候选卡只使用 Side Panel 固定样式，避免跨页面布局 token 污染。
- [x] 将关注作者入口迁移到 X 原生 Follow 按钮 hover/focus，覆盖 Profile Summary、Follow 列表、Article 作者头部和 Profile 头部；不再要求选取作者名称，也不拦截原生 Follow 点击。
- [x] 在作者 Articles 列表的每张卡片及 X Article 原文中支持从 Bookmark 位置添加至收件箱，并按 Article URL 去重写入候选元数据。
- [x] 在扩展更新/启动时及用户点击 Action 后，仅以当前 content script 的明确就绪回复作为版本判据；旧脚本或缺失脚本均补注入已打包 content script，避免页面交互因保留旧版脚本而完全不可用。
- [x] 将 Side Panel 候选 Card 重构为 X Bookmarks 视觉结构，持久化加入时可见摘要、认证与互动快照；删除候选 `•••`、忽略和卡内保存入口，并把两个移除入口统一为 `ignored` 墓碑状态。保存完整 Markdown 继续由原文上下文操作完成。
- [x] 将 Side Panel 调整为上下文感知 Content Inbox：收件箱/关注作者/素材库、当前页面上下文、保存并复制 Markdown、候选忽略撤销与标签页同步。
- [x] 原文加入收件箱后自动刷新 Side Panel，并支持按添加时间或原文发表时间从新到旧排序。
- [x] 将“关注作者”页收敛为 X Follow UI，使用 X design token 和 Following/unfollow 状态，并移除其他作者管理操作及手动扫描链路。
- [x] 关注作者列表的作者信息行可直接打开对应的 `https://x.com/<handle>` 主页，且不影响独立的 unfollow 按钮。
- [x] 关注作者提取链路可保存并刷新正确姓名、简介和认证状态，Side Panel 对认证作者显示 X 式蓝色标识。
- [x] 将 Article 收件箱入口从文本选择迁移到原生 Bookmark 的 hover/focus 位置，使用 X 书签 SVG 与 `#1D9BF0` 背景，保留候选去重和写入链路。
- [x] 将收件箱书签按钮移至原生 Bookmark 左侧相邻 8px 处，左侧空间不足时回退至右侧，避免遮挡 X 原生收藏操作。
- [x] Profile Summary 等 X 原生 Follow/Following 按钮均可触发关注作者浮层；浮层按扩展列表显示 `Follow` 或 `Following`/`unfollow`，并通过本地存储与 Side Panel 实时同步增删。
- [x] 将 Article 收件箱书签补齐为双向闭环：添加、已加入 destructive hover 移除、再次添加；复用 `ignored`/`saved` 记录且不删除素材库，并通过本地存储与 Side Panel 实时同步。
- [x] 收件箱默认显示今日，支持昨日、日历日期和 X 风格关键词搜索；候选卡直接打开原文并移除冗余的 X 原样预览链路。
- [x] 收件箱日期筛选统一改为 `addedAt`，补充本周、上周、本月并增加总数与按添加日期聚合的 X 风格折线图。
- [x] 将 Content Inbox 底部文字导航迁移为 X 风格左侧图标栏，增加中栏页面标题与返回交互，并保留原有视图切换和内容操作契约。
- [x] 修复详情页 Bookmark 与 More 加入收件箱错误采用相关 Article/media 链接：候选 URL 现在以当前 `/status/<id>` 或 Article 主 URL 为准，并在存储去重时规范化 `/media/<id>` 子路由。
- [x] 修复详情页加入收件箱后候选 Card 作者元数据缺失：按当前 status ID 锁定 Tweet 根并以页面路径 handle 回退，使 More、状态页 Bookmark 与 Article Bookmark 入口一致写入头像、名称、handle 和可用日期。
- [x] 将素材库 Card 调整为创作决策优先：与收件箱复用 X Bookmarks Card 骨架，封面进入完整宽度约 `2.55:1` 媒体框并可放大查看（素材使用 `contain`），作者/handle/`发布于 · 收录于` 同行优先，Card 仅保留标题与标签，常驻操作收敛为使用状态、“预览 Markdown”和 X 式“标记为已使用”按钮。
- [x] 根据素材库实机效果收敛阅读与管理边界：完整 Markdown 由底部工具栏“预览 Markdown”进入独立阅读页；标签输入移入 `•••` 浮层；平台图标增加“已发布至”语义；因暂无创作实体，将“用于创作”改为“标记为已使用”。
