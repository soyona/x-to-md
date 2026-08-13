# Technical Context

## 定位

`x-to-md` 是独立的 Manifest V3 Chrome 扩展。它将用户当前打开的 X/Twitter 推文或 Article 页面转换为可复制的 Markdown，并提供本地候选集/素材库 Side Panel；不依赖、调用或写入其他本地项目。

## 运行模型

```text
用户点击扩展 Action → Chrome Side Panel 读取当前标签页上下文
→ Article：保存并复制 Markdown；作者 Articles：手动扫描；其他 X：候选集
→ 候选集、关注作者、素材库管理

用户在 X 原文页打开 More 菜单 → 保存到素材库
→ Content Script 在本次点击中读取当前页面 DOM → Capture v1 → 直接写入素材库
→ 原位切换为从素材库移除；Side Panel 仅在用户主动打开时管理素材

不支持 Side Panel 的环境：用户点击扩展 Action → 当前 X Articles 页面进入候选浏览模式
→ Content Script 仅隐藏非候选的 X 原生 Article 容器
→ 候选卡保持 X 原始 DOM、CSS、字体与图片渲染
→ 再次点击 Action 或关闭浮层后恢复页面
```

## 模块与数据流

| 文件 | 责任 |
|---|---|
| `manifest.json` | `activeTab`、`storage`、`sidePanel`、`scripting`、service worker 与 X/Twitter 内容脚本匹配；不配置 `default_popup`，避免 Chrome 原生 Popup 的矩形窗口阴影 |
| `background.js` | 在扩展更新/启动时为已打开的 X/Twitter 标签补注入事件脚本，并接收扩展 Action 点击；Action 先在用户手势内打开 Side Panel，再并行补注入当前 content script；统一处理素材写入、去重、移除与候选 `saved` 状态 |
| `content.js` | 生成 `{ kind: "x-to-xhs.capture", version: 1, sourceUrl, blocks, content }`；Article Capture 额外携带当前页面可见的标题、作者、封面、发表时间和轻量摘要；响应只读 `get-current-context` 元数据请求；hover/focus X 原生 `Follow` 或 `Following` 时读取公开作者信息，并按扩展关注列表显示 `Follow` 或 `Following`/`unfollow`；扩展不再监听 Bookmark hover/focus，列表页与详情页扩展动作统一由 More 菜单承载 |
| `markdown.js` | 将 `blocks` 序列化为 Markdown；`includeImages: false` 用于复制 |
| `popup.js` | 保留旧 Popup 兼容流程；当前页面内入口由 `content.js` 的原文 Bookmark 操作位承载 |
| `preview.*` | 一次性 session 数据的 Markdown 阅读页：保留 Capture 语义预览兼容性，并可渲染素材库手动打开的原始 Markdown；读取后立即删除 session 数据 |
| `sidepanel.*` | X 式候选集/素材库：候选集、X Follow 风格关注作者、候选状态与主动保存的素材库；作者信息链接到对应 X 主页，关注按钮提供 Following/unfollow；素材 Card 与候选集共用 `40px` 头像列、单行元数据、约 `2.55:1` 媒体框和 Card 内标题的 X Bookmarks 骨架；素材封面在媒体框内使用 `contain`，并提供状态、“预览 Markdown”和“标记为已使用”主操作，封面可在扩展内遮罩放大；Card 不渲染 Markdown 摘要或展开状态，完整内容仅在底部工具栏打开的一次性 session 阅读页中呈现。复制、标签、发布链接与删除收进 `•••`。发布链接管理使用 X 式居中弹层：显示现有平台、允许打开或移除，支持添加或替换同平台 HTTPS 链接，并在输入框下显示校验错误。发布按 HTTPS URL 识别小红书、Reddit、微信或 B 站并以“已发布至”加图标显示；监听本地候选写入并刷新列表；候选集按 `addedAt` 的本地日期默认显示今日，支持昨日、本周、上周、本月和元数据搜索，并显示总数与添加趋势图；设置页以本地布局偏好切换左侧、右侧或隐藏导航栏 |
| `background.js` | Action 优先打开 Side Panel；不支持时才切换当前 X 页面的原生候选浏览模式，并转发当前页面完成 Extract and copy 的候选状态事件 |

## 约束

- 入口语义以当前实现为准：扩展不监听 X 原生 Bookmark 的 hover/focus，也不注入 Bookmark 悬浮按钮；Home、作者 Posts/Articles 列表和 `/status`、`/article` 在 `Grok actions` 左侧注入 x-to-md 图标。点击该独立入口才显示关注、预览/复制 Markdown、复制文本、候选集与素材库五项动作，原生 More 不扩展。普通 Post 和 Article 均以被点击卡片或详情页的规范化 URL 读写；候选集使用托盘图标，素材库使用书签图标；底层 `x-to-md-content-inbox` 存储键保持兼容。

- 仅支持 `x.com`、`www.x.com`、`twitter.com` 与 `www.twitter.com` 的 HTTPS 页面；Service Worker 每次启动、扩展更新/浏览器启动或用户点击 Action 时，只向已打开的这些标签补注入扩展包内的 `markdown.js` 与 `content.js`，并在注入后再次校验 Content Script revision。`content.js` 使用可重复执行的单实例包装，替换实例时对称释放 DOM、runtime、启动重试与菜单生命周期监听器；入口以已验证的 `Grok actions` 按钮为锚点，完整克隆其原生槽位与内部结构，只替换水滴 SVG path。脚本在 `main` 尚未挂载时以可取消的短周期任务等待，挂载后才建立局部观察器，只投影新增节点所属的 Post/Article Card，避免鼠标触发和全页重复扫描；`<html>` 的 `data-x-to-md-content-script-revision` 与 `data-x-to-md-article-actions-stage` 用于区分未注入、等待根节点和已监听状态。入口 hover/焦点/展开底色由扩展自身控制；点击后直接创建 fixed 定位、跟随 X 当前明暗配色的 `role="menu"`，不点击原生 caret、不等待 X Dropdown，原生 More 本身不再触发或承载扩展操作。
- 不需要构建流程或第三方运行时依赖；测试使用 Node 内置 `node:test`。
- 收件箱文章卡片直接打开原始 X Article；统计与日期筛选只读取 `chrome.storage.local` 中的候选元数据，不使用 `chrome.storage.session` 传递视觉预览内容，也不维护 X 原样预览注入链路。
- 保存素材时优先继承同 URL 候选的封面、作者、发表时间和摘要；直接从原文保存时仅使用本次用户主动提取的相同公开元数据。素材库以不裁切的封面、标题和来源构成识别行；历史或缺失封面的素材只显示稳定占位和可用摘要，不后台回填。列表页 Article Card 的 Bookmark 保持 X 原生行为，扩展动作只在 More 中加入/移出候选集；只有 `/status/<id>` 或 `/article/<id>` 原文页 More 才能执行“预览/复制 Markdown”、复制文本或直接加入/移除素材库，不得以列表 DOM 生成 Capture。
- Side Panel 数据使用 `chrome.storage.local` 保存关注作者、候选元数据和用户主动保存的素材；不保存 Cookie、令牌、剪贴板或 Article 完整正文。候选来源 URL 规范化为 `/status/<id>`、`/<handle>/article/<id>` 或 `/i/article/<id>`，剥离 query、hash 和 `/media/<id>` 子路由；详情页的 Bookmark/More 操作优先使用当前页面 URL，不能从相关链接推断身份。详情页 hover/focus Bookmark 与 More 菜单按规范化 URL 查询素材库，未加入显示蓝色“添加至素材库”，已加入显示实心书签并在 hover/focus 变为红色“从素材库移除”；添加在本次用户点击中读取页面 DOM、保存 Markdown 与可见元数据，移除删除同 URL 素材并将此前 `saved` 的候选恢复为 `new`。列表页保留收件箱双态：添加复用 `ignored`/`saved` 记录、刷新快照并恢复为 `new`，移除写为 `ignored` 墓碑。原文页的 `Extract and copy` 只复制 Markdown 并显示短暂反馈。关注悬浮入口不使用 `MutationObserver`；x-to-md 独立动作入口使用只处理新增节点所属 Card 的局部观察器，Article 原生 Dropdown 的插件分组使用绑定到当前菜单节点的局部观察器，并在菜单移除或实例替换时断开。Side Panel 监听该存储键并自动重绘当前视图，因此关注、收件箱与素材库变更会实时同步；收件箱默认按 `addedAt` 降序，并按 `addedAt` 提供今日、昨日、本周、上周、本月筛选，图表按本地添加日期聚合历史新增数量。关注作者列表使用 X `--twitter-*` token，且只有 Following/unfollow 操作；候选 Card 的固定样式负责 600 CSS px X Bookmarks 基准与窄宽流式收缩。
- 左侧收件箱、关注作者和素材库使用独立本地未读基线：首次启用只将已有记录标记为已读；之后候选 `addedAt`、关注作者 `addedAt` 与素材 `createdAt` 晚于对应基线时显示数字，用户点击对应导航项才更新基线。
- Side Panel 不再显示当前 X 原文上下文与保存入口；收件箱、关注作者、素材库三页直接从各自的筛选或列表开始。导航位置偏好保存在 `x-to-md-navigation-layout`：左、右或隐藏；隐藏时保留无文字图标以恢复此前可见位置。
- 收件箱文章卡片直接复用 X URL 打开原文，由 X 页面负责真实 DOM、字体和响应式布局；Side Panel 趋势图使用固定 X token 的 SVG 样式，不引入图表依赖。
- Side Panel 候选 Card 以当前 X Bookmarks 中栏为像素级基准：固定 `40px` 头像、`12px` 列间距、约 `2.55:1` 媒体、`15px/20px` 文本和完整互动快照；候选 `•••` 不显示但保留几何槽位，只有扩展书签可交互。当前 X Articles 页面中的候选浏览模式仍只筛除非候选原生容器，不注入 Card 样式。
- X 页面 DOM 会变化；选择器兼容性需通过真实页面人工验收，而非仅依赖静态断言。
