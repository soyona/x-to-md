# Progress

更新日期：2026-08-12

## 当前待办

- [ ] 在下一次 X 页面结构变更或功能迭代时，使用真实推文与 Article 人工复核采集、预览和复制链路。
- [ ] /status页面 more 菜单 "加入素材库"时，没有获取到封面，如：https://x.com/0xShoopy/status/2085383231554171098


## 已完成

- [x] 2026-08-12 收敛为两级模型：候选集仅通过列表页 More 加入/移除，素材库仅通过原文页 More 保存/移除；删除扩展 Bookmark 悬浮入口，候选集使用托盘图标、素材库使用书签图标，保留原生 Bookmark 与底层存储兼容。

- [x] X 原文详情页的 Bookmark 与 More 统一直接添加至/移出素材库；`Extract and copy` 改为仅复制并反馈，不再要求保存确认或打开 Side Panel。
- [x] 移除扩展 Bookmark hover/focus 悬浮入口，统一通过 More 菜单承载候选集与素材库动作；候选集导航和动作使用托盘图标，素材库使用书签图标。
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
