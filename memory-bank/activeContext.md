# Active Context

更新日期：2026-08-11

## 当前状态

- `v2.2.0` 已准备发布，项目只维护 `main` 分支；真实 X 页面验收仍待执行。
- 扩展提供 X/Twitter 当前页面读取、文章原文打开和不含图片的 Markdown 复制；收件箱候选 Card 以 X Bookmarks 中栏为像素级视觉载体，点击后直接打开 X 原文，不在 Side Panel 保存或渲染完整正文。
- 权限保持最小化：`activeTab`、`storage`、`sidePanel`、`scripting` 和四个 X/Twitter HTTPS 主机范围；`scripting` 仅向已打开的 X/Twitter 标签补注入已打包事件脚本，或在用户点击 Action 后注入当前标签，避免扩展重载前已打开的 X 页面缺少交互；脚本仅在用户 hover/focus 原生 Follow 或 Bookmark 按钮时读取对应局部 DOM。v2 主链路不使用存储传递视觉内容，保留旧语义预览兼容页。
- v2.3.0 增加 Chrome Side Panel Content Inbox：收件箱、关注作者、候选去重/状态、素材库搜索与主动保存；数据写入 `chrome.storage.local`。
- Side Panel 现在读取当前标签页的只读上下文；Article 页面提供“保存并复制 Markdown”，作者 Articles 页面提示从 X 原文加入收件箱，非 X 页面显示边界提示。
- 素材库以完整封面、标题和来源组成紧凑识别行：封面使用 `object-fit: contain` 保留全部视觉信息，候选元数据在保存时优先继承；直接保存使用同一次用户主动提取的公开元数据。旧素材不回填，缺少封面时显示稳定 Article 占位和已有摘要；搜索覆盖标题、作者、handle、标签与备注。
- 候选卡只提供扩展书签“从收件箱移除”；候选 `•••`、`忽略候选` 和候选卡内“添加至素材库”入口已移除。单篇 X 原文在原生 Bookmark hover/focus 操作位额外提供 `Extract and copy`；复制后必须再次点击 `Save to library` 才会写入素材，保存后可打开 Side Panel 查看素材库。Side Panel 的“保存并复制 Markdown”仍是同一后台保存路径的快捷入口。
- 在 X 原文中悬停或键盘聚焦原生 `Follow @handle` 或 `Following` 按钮，会出现扩展的关注作者工具栏；覆盖 Profile Summary、Follow 列表 UserCell、Article 作者头部和 Profile 头部，不再要求选取作者名称，且状态以扩展关注作者列表为准。未关注时显示蓝色 `Follow` 并按公开 handle 去重写入；已关注时显示 `Following`，hover/focus 变为红色 `unfollow`，点击从同一存储删除。Side Panel 通过存储监听实时同步。
- “关注作者”页只保留 X Follow UI：使用 X `--twitter-*` token 显示头像、姓名、认证标识、handle、简介与 `Following`；作者信息区直接链接到 `https://x.com/<handle>`，悬停/聚焦关注按钮时变为红色 `unfollow`，点击直接取消关注。旧的手动添加、详情、编辑、启停、扫描和删除入口已移除。
- 列表页（作者主页 Posts、作者 Articles、Home、Bookmarks 等）的 Article Card Bookmark 和 More 只提供“打开原文后提取”：使用该 Card 的规范化 `/status/<id>` 或 `/article/<id>` 导航，不读取列表页或直接复制。只有原文页的 Bookmark/More 才显示 `Extract and copy`；未加入时仍显示蓝色“添加至收件箱”，已加入时显示实心书签，hover/focus 变为红色“从收件箱移除”。移除后可重新添加；`ignored`/`saved` 候选再次添加时复用原记录并恢复为 `new`，不删除素材库。
- 收件箱候选的页面身份以规范化的当前详情页 URL 为准：`/status/<id>` 或 Article 的主 URL；不从同一 X 详情页中可见的相关 Article/媒体链接推断身份，且会剥离 `/media/<id>` 子路由。
- 收件箱详情页候选的作者与日期从匹配当前 `/status/<id>` 的 Tweet 根节点读取；作者 handle 同时以当前路径为稳定回退，避免 More 与 Bookmark 入口因各自局部 DOM 不同而写入不完整卡片元数据。
- 原文书签操作写入或移除候选后，已打开的 Side Panel 通过 `chrome.storage.onChanged` 自动刷新收件箱；收件箱默认按 `addedAt` 显示今日，可按昨日、本周、上周或本月筛选，并支持标题、作者、handle 与 URL 搜索；同时显示活跃候选总数和按添加日期聚合的趋势图。
- 修复 Side Panel 在扩展重载后直接获取 Article 的 `Could not establish connection`：仅对 X/Twitter 当前页执行一次刷新并有限重试，最终显示可操作中文错误。
- 修复扩展 Action 点击无响应：Side Panel 现在在用户点击手势内先打开，Content Script 注入改为并行 best-effort，打开失败时保留候选浮层回退。Action 始终承担 Side Panel 入口，不再按原文 URL 切换为提取入口。
- X Article 的原生 More Dropdown 追加蓝色 x-to-md 分组：关注/取消关注作者、`Extract and copy`、添加至/移出收件箱。Content Script v6 使用可重复执行的单实例生命周期，后台补注入后必须二次确认 revision；只监听 X 的 `#layers` Portal 识别 Article Dropdown 挂载，菜单分组只观察当前 Dropdown 的直接子节点，在 X React 重绘移除分组时恢复，并在实例替换时断开。

## 当前技术债与风险

- X 的 DOM、类名和 Article 渲染结构可能变化，`content.js` 的选择器需要定期以真实页面复核。
- 自动化测试覆盖 Markdown 与选择器存在性；尚未替代 Chrome 实际加载、剪贴板权限和真实页面兼容性验收。
- Side Panel 的完整 Chrome 交互（写入候选、保存素材）仍待人工复核；作者 Articles 页面 DOM 识别已完成实测。
- 2026-08-10 已在 `https://x.com/AnatoliKopadze/articles` 实测：X 当前列表使用普通 generic 标题节点，已补充 `Article` 标记后下一行标题回退；近 7 天发现 1 条，2026-06-01 至 2026-08-10 发现 5 条。
- 候选集采用 X Bookmarks Card 结构；用户从 X 原文主动加入时读取当前局部 Card 的可见头像、封面、摘要、认证和互动快照，并保存到 `chrome.storage.local`。旧候选缺少快照时按已有字段降级显示，不伪造数据。
- 候选卡不再接收 X 主页面的计算样式或布局 token；它只使用 Side Panel 的固定样式，避免主页面与 Side Panel 宽度不同导致布局漂移。
- Side Panel 候选 Card 是 X Bookmarks 的像素级视觉载体，但不是完整 Article 正文预览：标题点击后直接打开原始 Article；候选卡无 `•••` 菜单，完整 Markdown 仍只通过原文页“保存并复制 Markdown”产生。
- 扩展 Action 优先打开 Side Panel 的候选集、订阅源和素材库；不支持 Side Panel 时才切换当前 X Articles 页面的候选浏览模式。该模式只隐藏不属于候选集的原生 Article 容器，保留候选卡的 X 原始 DOM、CSS、字体、图片和互动结构；关闭浮层或再次点击 Action 后逐项恢复原始 inline style。
- X 当前 Article 列表的结构优先使用 `article-cover-image`、其同级文字容器和带 `aria-label` 的互动组；当用户从作者 handle 触发候选操作而封面测试标记缺失时，仅在同一最小祖先中有唯一 Article URL 链接时回退，避免用通用标题或链接父元素误配卡片。
