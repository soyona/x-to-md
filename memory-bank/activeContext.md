# Active Context

更新日期：2026-08-11

## 当前状态

- `v2.2.0` 已准备发布，项目只维护 `main` 分支；真实 X 页面验收仍待执行。
- 扩展提供 X/Twitter 当前页面读取、原文预览和不含图片的 Markdown 复制。
- 视觉预览在当前 X 文档中运行，直接复用 X 原始 CSS、字体和容器布局。
- 权限保持最小化：`activeTab`、`storage`、`sidePanel`、`scripting` 和四个 X/Twitter HTTPS 主机范围；`scripting` 仅向已打开的 X/Twitter 标签补注入已打包事件脚本，或在用户点击 Action 后注入当前标签，避免扩展重载前已打开的 X 页面缺少交互；脚本仅在用户 hover/focus 原生 Follow 或 Bookmark 按钮时读取对应局部 DOM。v2 主链路不使用存储传递视觉内容，保留旧语义预览兼容页。
- v2.3.0 增加 Chrome Side Panel Content Inbox：收件箱、关注作者、候选去重/状态、素材库搜索与主动保存；数据写入 `chrome.storage.local`。
- Side Panel 现在读取当前标签页的只读上下文；Article 页面提供“保存并复制 Markdown”，作者 Articles 页面提示从 X 原文加入收件箱，非 X 页面显示边界提示。
- 候选卡提供明确的“忽略候选”；当前 Article 可在 Side Panel 一次“保存并复制 Markdown”，保存后从候选集移除并支持短时撤销。
- 在 X 原文中悬停或键盘聚焦原生 `Follow @handle` 或 `Following` 按钮，会出现扩展的关注作者工具栏；覆盖 Profile Summary、Follow 列表 UserCell、Article 作者头部和 Profile 头部，不再要求选取作者名称，且状态以扩展关注作者列表为准。未关注时显示蓝色 `Follow` 并按公开 handle 去重写入；已关注时显示 `Following`，hover/focus 变为红色 `unfollow`，点击从同一存储删除。Side Panel 通过存储监听实时同步。
- “关注作者”页只保留 X Follow UI：使用 X `--twitter-*` token 显示头像、姓名、认证标识、handle、简介与 `Following`；作者信息区直接链接到 `https://x.com/<handle>`，悬停/聚焦关注按钮时变为红色 `unfollow`，点击直接取消关注。旧的手动添加、详情、编辑、启停、扫描和删除入口已移除。
- 在作者 Articles 列表的每张 Article 卡片、其 `/status/<id>` 原文及已打开的 X Article 原文中，hover/focus 原生 Bookmark 按钮会在其左侧相邻位置显示收件箱书签操作，保留原生 Bookmark 可见与可点击；未加入时显示蓝色“添加至收件箱”，已加入时显示实心书签，hover/focus 变为红色“从收件箱移除”。移除后可重新添加；`ignored`/`saved` 候选再次添加时复用原记录并恢复为 `new`，不删除素材库。
- 原文书签操作写入或移除候选后，已打开的 Side Panel 通过 `chrome.storage.onChanged` 自动刷新收件箱；收件箱可按添加时间或原文发表时间降序排列。
- 修复 Side Panel 在扩展重载后直接获取 Article 的 `Could not establish connection`：仅对 X/Twitter 当前页执行一次刷新并有限重试，最终显示可操作中文错误。
- 修复扩展 Action 点击无响应：Side Panel 现在在用户点击手势内先打开，Content Script 注入改为并行 best-effort，打开失败时保留候选浮层回退。

## 当前技术债与风险

- X 的 DOM、类名和 Article 渲染结构可能变化，`content.js` 的选择器需要定期以真实页面复核。
- 自动化测试覆盖 Markdown 与选择器存在性；尚未替代 Chrome 实际加载、剪贴板权限和真实页面兼容性验收。
- Side Panel 的完整 Chrome 交互（写入候选、保存素材）仍待人工复核；作者 Articles 页面 DOM 识别已完成实测。
- 2026-08-10 已在 `https://x.com/AnatoliKopadze/articles` 实测：X 当前列表使用普通 generic 标题节点，已补充 `Article` 标记后下一行标题回退；近 7 天发现 1 条，2026-06-01 至 2026-08-10 发现 5 条。
- 候选集采用 X Articles 的时间线结构；从 X 原文加入候选时读取可见头像和封面 URL。列表可见摘要仅存在当前 Side Panel 内存，不持久化。
- 候选卡不再接收 X 主页面的计算样式或布局 token；它只使用 Side Panel 的固定样式，避免主页面与 Side Panel 宽度不同导致布局漂移。
- Side Panel 不是像素级 Article 预览载体。候选菜单的“在 X 中原样预览”会打开原始 Article 的新 X 标签页并调用页面内原生预览，使预览复用 X 的真实 DOM、字体、主题和响应式布局。
- 扩展 Action 优先打开 Side Panel 的候选集、订阅源和素材库；不支持 Side Panel 时才切换当前 X Articles 页面的候选浏览模式。该模式只隐藏不属于候选集的原生 Article 容器，保留候选卡的 X 原始 DOM、CSS、字体、图片和互动结构；关闭浮层或再次点击 Action 后逐项恢复原始 inline style。
- X 当前 Article 列表的结构优先使用 `article-cover-image`、其同级文字容器和带 `aria-label` 的互动组；当用户从作者 handle 触发候选操作而封面测试标记缺失时，仅在同一最小祖先中有唯一 Article URL 链接时回退，避免用通用标题或链接父元素误配卡片。
