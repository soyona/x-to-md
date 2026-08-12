# Active Context

更新日期：2026-08-12

## 当前状态

- `v2.2.0` 已准备发布，项目只维护 `main` 分支；真实 X 页面验收仍待执行。
- 扩展提供 X/Twitter 当前页面读取、文章原文打开和不含图片的 Markdown 复制；候选集 Card 以 X Bookmarks 中栏为像素级视觉载体，点击后直接打开 X 原文，不在 Side Panel 保存或渲染完整正文。
- 权限保持最小化：`activeTab`、`storage`、`sidePanel`、`scripting` 和四个 X/Twitter HTTPS 主机范围；`scripting` 仅向已打开的 X/Twitter 标签补注入已打包事件脚本，或在用户点击 Action 后注入当前标签，避免扩展重载前已打开的 X 页面缺少交互；脚本仅在用户 hover/focus 原生 Follow 或 Bookmark 按钮时读取对应局部 DOM。v2 主链路不使用存储传递视觉内容，保留旧语义预览兼容页。
- v2.3.0 增加 Chrome Side Panel：候选集、关注作者、候选去重/状态、素材库搜索与主动保存；数据写入 `chrome.storage.local`，底层键仍为 `x-to-md-content-inbox`。
- Side Panel 不再读取或展示当前标签页上下文；加入收件箱与保存 Markdown 均在 X 原文中完成，三项主视图直接显示各自管理内容。
- 素材库以「为何值得用、当前状态、下一步」组成 X 式紧凑 Card，并与候选集复用同一 X Bookmarks 骨架：`40px` 头像列、单行作者/handle/发布与收录日期、完整宽度约 `2.55:1` 媒体框和 Card 内标题。素材封面在媒体框内使用 `object-fit: contain` 保留全部视觉信息，并可在 X 式遮罩中放大查看；候选元数据在保存时优先继承。直接保存使用同一次用户主动提取的公开元数据。旧素材不回填，缺少封面时显示稳定 Article 占位；搜索覆盖标题、作者、handle、标签与备注。
- 素材 Card 不显示 Markdown 摘要、展开或收起；完整 Markdown 只能通过底部工具栏的“预览 Markdown”进入一次性阅读页，列表不渲染正文。当前没有创作实体，常驻底部使用诚实的 `未使用` / `已使用` 状态和黑色 X 式“标记为已使用”按钮，不伪造创作关联；其他动作收进 `•••`。标签输入在该浮层内完成，不撑开 Card。“管理发布链接”从 `•••` 打开 X 式居中弹层，可查看、打开、移除、添加或按平台替换链接；校验错误紧邻输入框。发布只接受 HTTPS 小红书、Reddit、微信文章或 B 站链接，并以“已发布至”文字和可跳转的平台图标表达；旧的小红书单链接读取时兼容迁移。
- 候选卡只提供扩展书签“从候选集中移除”；候选 `•••`、`忽略候选` 和候选卡内“添加至素材库”入口已移除。扩展不再在 X 原生 Bookmark 旁注入悬浮工具栏；列表页和原文页的扩展动作统一收进 More 菜单。列表页 More 只提供“加入候选集/从候选集中移除”；原文 More 提供“预览/复制 Markdown”、复制文本和“加入素材库/从素材库移除”。预览动作由后台写入 `library-markdown-preview` 并打开 `preview.html?mode=library`；失效的旧 Content Script 不再访问 `chrome.storage.local` 或重复打印上下文错误；扩展菜单行使用固定 24px 内联 SVG 图标，并以独立浅蓝 hover 背景区别 X 原生菜单，复制文本行使用独立图标确保文字与其他扩展行上下对齐。
- More 菜单的加入/移除候选集、加入/移除素材库和关注/取消关注动作完成后显示可点击 Toast；点击目标会打开 Chrome Side Panel 并切换到候选集、素材库或关注作者页。关注菜单文案收敛为“关注/取消关注”，图标分别复用原生 Follow/Unfollow 图标。
- Toast 打开 Side Panel 时先调用 `chrome.sidePanel.open({ windowId })` 保留用户手势，再写入目标视图并发送导航消息；取消关注图标兼容 X 的 `Unfollow`、`Following` 两种原生菜单标签。
- 在 X 原文中悬停或键盘聚焦原生 `Follow @handle` 或 `Following` 按钮，会出现扩展的关注作者工具栏；覆盖 Profile Summary、Follow 列表 UserCell、Article 作者头部和 Profile 头部，不再要求选取作者名称，且状态以扩展关注作者列表为准。未关注时显示蓝色 `Follow` 并按公开 handle 去重写入；已关注时显示 `Following`，hover/focus 变为红色 `unfollow`，点击从同一存储删除。Side Panel 通过存储监听实时同步。
- “关注作者”页只保留 X Follow UI：使用 X `--twitter-*` token 显示头像、姓名、认证标识、handle、简介与 `Following`；作者信息区直接链接到 `https://x.com/<handle>`，悬停/聚焦关注按钮时变为红色 `unfollow`，点击直接取消关注。旧的手动添加、详情、编辑、启停、扫描和删除入口已移除。
- 列表页（作者主页 Posts、作者 Articles、Home、Bookmarks 等）的 Article Card Bookmark 和 More 均不再注入扩展悬浮入口；扩展动作只在 More 中提供“打开原文后提取”和“加入候选集/从候选集中移除”。使用该 Card 的规范化 `/status/<id>` 或 `/article/<id>` 导航，不读取列表页正文。原文 More 提供 `Extract and copy` 与“保存到素材库/从素材库移除”；移除后可再次添加，候选和素材库状态独立。
- 候选集候选的页面身份以规范化的当前详情页 URL 为准：`/status/<id>` 或 Article 的主 URL；不从同一 X 详情页中可见的相关 Article/媒体链接推断身份，且会剥离 `/media/<id>` 子路由。
- 候选集详情页候选的作者与日期从匹配当前 `/status/<id>` 的 Tweet 根节点读取；作者 handle 同时以当前路径为稳定回退，避免 More 入口因各自局部 DOM 不同而写入不完整卡片元数据。
- 原文详情页 More 操作写入或移除素材后，已打开的 Side Panel 通过 `chrome.storage.onChanged` 自动刷新素材库；列表页 More 的候选集操作刷新候选集。候选集默认按 `addedAt` 显示今日，可按昨日、本周、上周或本月筛选，并支持标题、作者、handle 与 URL 搜索；同时显示活跃候选总数和按添加日期聚合的趋势图。
- 修复 Side Panel 在扩展重载后直接获取 Article 的 `Could not establish connection`：仅对 X/Twitter 当前页执行一次刷新并有限重试，最终显示可操作中文错误。
- 修复扩展 Action 点击无响应：Side Panel 现在在用户点击手势内先打开，Content Script 注入改为并行 best-effort，打开失败时保留候选浮层回退。Action 始终承担 Side Panel 入口，不再按原文 URL 切换为提取入口。
- X Article 的原生 More Dropdown 追加蓝色 x-to-md 分组：关注/取消关注作者、`Extract and copy`、保存到/移出素材库；列表页 More 使用同一分组提供打开原文后提取与加入/移出候选集。Bookmark hover/focus 不再注入扩展工具栏。Content Script 使用可重复执行的单实例生命周期，后台补注入后必须二次确认 revision；只监听 X 的 `#layers` Portal 识别 Article Dropdown 挂载，菜单分组只观察当前 Dropdown 的直接子节点，在 X React 重绘移除分组时恢复，并在实例替换时断开。

## 当前技术债与风险

- X 的 DOM、类名和 Article 渲染结构可能变化，`content.js` 的选择器需要定期以真实页面复核。
- 自动化测试覆盖 Markdown 与选择器存在性；尚未替代 Chrome 实际加载、剪贴板权限和真实页面兼容性验收。
- Side Panel 的完整 Chrome 交互（写入候选、保存素材）仍待人工复核；作者 Articles 页面 DOM 识别已完成实测。
- 左侧候选集、关注作者和素材库导航使用独立的本地未读基线；首次启用只建立基线不提示历史数据，后续加入候选、关注作者或保存素材才出现 X 样式数字角标，用户点击对应导航项才标记为已读。
- 左侧导航新增 X 风格设置图标；设置页可持久化切换导航位于左侧、右侧或隐藏。隐藏状态提供无文字的布局图标，以恢复到此前的可见侧。
- 2026-08-10 已在 `https://x.com/AnatoliKopadze/articles` 实测：X 当前列表使用普通 generic 标题节点，已补充 `Article` 标记后下一行标题回退；近 7 天发现 1 条，2026-06-01 至 2026-08-10 发现 5 条。
- 候选集采用 X Bookmarks Card 结构；用户从 X 原文主动加入时读取当前局部 Card 的可见头像、封面、摘要、认证和互动快照，并保存到 `chrome.storage.local`。旧候选缺少快照时按已有字段降级显示，不伪造数据。
- 候选卡不再接收 X 主页面的计算样式或布局 token；它只使用 Side Panel 的固定样式，避免主页面与 Side Panel 宽度不同导致布局漂移。
- Side Panel 候选 Card 是 X Bookmarks 的像素级视觉载体，但不是完整 Article 正文预览：标题点击后直接打开原始 Article；候选卡无 `•••` 菜单，完整 Markdown 仍只通过原文页“保存并复制 Markdown”产生。
- 扩展 Action 优先打开 Side Panel 的候选集、订阅源和素材库；不支持 Side Panel 时才切换当前 X Articles 页面的候选浏览模式。该模式只隐藏不属于候选集的原生 Article 容器，保留候选卡的 X 原始 DOM、CSS、字体、图片和互动结构；关闭浮层或再次点击 Action 后逐项恢复原始 inline style。
- X 当前 Article 列表的结构优先使用 `article-cover-image`、其同级文字容器和带 `aria-label` 的互动组；当用户从作者 handle 触发候选操作而封面测试标记缺失时，仅在同一最小祖先中有唯一 Article URL 链接时回退，避免用通用标题或链接父元素误配卡片。
