# Technical Context

## 定位

`x-to-md` 是独立的 Manifest V3 Chrome 扩展。它将用户当前打开的 X/Twitter 推文或 Article 页面转换为可复制的 Markdown，并提供本地 Content Inbox Side Panel；不依赖、调用或写入其他本地项目。

## 运行模型

```text
用户点击扩展 Action → 当前 X 页面内打开圆角导入面板
→ Content Script 读取当前页面 DOM → Capture v1 → 复制 Markdown
→ 面板自动关闭，停留在当前 X 文档

用户点击扩展 Action → Chrome Side Panel 读取当前标签页上下文
→ Article：保存并复制 Markdown；作者 Articles：手动扫描；其他 X：收件箱
→ 收件箱、关注作者、素材库管理

不支持 Side Panel 的环境：用户点击扩展 Action → 当前 X Articles 页面进入候选浏览模式
→ Content Script 仅隐藏非候选的 X 原生 Article 容器
→ 候选卡保持 X 原始 DOM、CSS、字体与图片渲染
→ 再次点击 Action 或关闭浮层后恢复页面
```

## 模块与数据流

| 文件 | 责任 |
|---|---|
| `manifest.json` | `activeTab`、`storage`、`sidePanel`、`scripting`、service worker 与 X/Twitter 内容脚本匹配；不配置 `default_popup`，避免 Chrome 原生 Popup 的矩形窗口阴影 |
| `background.js` | 在扩展更新/启动时为已打开的 X/Twitter 标签补注入事件脚本，并接收扩展 Action 点击；Action 先在用户手势内打开 Side Panel，再并行补注入当前 content script；Side Panel 打开失败时回退候选浏览 |
| `content.js` | 生成 `{ kind: "x-to-xhs.capture", version: 1, sourceUrl, blocks, content }`；响应只读 `get-current-context` 元数据请求；hover/focus X 原生 `Follow` 或 `Following` 时读取公开作者信息，并按扩展关注列表显示 `Follow` 或 `Following`/`unfollow`；hover/focus Article 帖子的原生 Bookmark 时，在其左侧相邻位置显示“添加至收件箱/从收件箱移除”双态书签并更新候选集 |
| `markdown.js` | 将 `blocks` 序列化为 Markdown；`includeImages: false` 用于复制 |
| `popup.js` | 保留旧 Popup 兼容流程；当前入口由 `background.js` + `content.js` 的页面内面板承载 |
| `preview.js` | 保留 v1 语义 Markdown 预览兼容代码 |
| `sidepanel.*` | X 式上下文感知 Content Inbox：当前页面操作、收件箱、X Follow 风格关注作者、候选状态与主动保存的素材库；作者信息链接到对应 X 主页，关注按钮提供 Following/unfollow；保存主操作同时复制 Markdown；监听本地候选写入并刷新列表；收件箱按 `addedAt` 的本地日期默认显示今日，支持昨日、本周、上周、本月和元数据搜索，并显示总数与添加趋势图；Content Script 断连时自动刷新受支持的 X 标签页并有限重试 |
| `background.js` | Action 优先打开 Side Panel；不支持时才切换当前 X 页面的原生候选浏览模式，并转发当前页面完成 Extract and copy 的候选状态事件 |

## 约束

- 仅支持 `x.com`、`www.x.com`、`twitter.com` 与 `www.twitter.com` 的 HTTPS 页面；`scripting` 在扩展更新/启动时只向已打开的这些标签、或用户点击 Action 的当前标签注入扩展包内的 `markdown.js` 与 `content.js`。脚本通过事件委托监听 X 原生 Follow 与 Bookmark 按钮，使扩展重载前已打开的 X 页面也能使用 hover/focus 操作。
- 不需要构建流程或第三方运行时依赖；测试使用 Node 内置 `node:test`。
- 收件箱文章卡片直接打开原始 X Article；统计与日期筛选只读取 `chrome.storage.local` 中的候选元数据，不使用 `chrome.storage.session` 传递视觉预览内容，也不维护 X 原样预览注入链路。
- Side Panel 数据使用 `chrome.storage.local` 保存关注作者、候选元数据和用户主动保存的素材；关注作者可包含公开 handle、显示名、个人页 URL、可见头像 URL、简介与认证状态。候选元数据可包含当前 Articles 列表中可见的头像与封面 URL，以及用户加入收件箱时生成的 `addedAt`。Content Script 通过事件委托识别 X 原生 `Follow`、`Following` 与 Bookmark 按钮：hover/focus Follow/Following 时按 handle 查询扩展关注列表，未关注显示 `Follow` 并去重写入，已关注显示 `Following` 且 hover/focus 切换为红色 `unfollow`，点击删除；hover/focus Bookmark 时在其左侧相邻 8px 处查询规范化 Article URL，未加入显示蓝色“添加至收件箱”，已加入显示实心书签且 hover/focus 切换为红色“从收件箱移除”。添加会复用 `ignored`/`saved` 记录并恢复为 `new`，移除只删除活动候选、不删除素材库；左侧空间不足时回退至右侧。两者均不使用 `MutationObserver`。Side Panel 监听该存储键并自动重绘当前视图，因此关注与收件箱增删会实时同步；收件箱默认按 `addedAt` 降序，并按 `addedAt` 提供今日、昨日、本周、上周、本月筛选，图表按本地添加日期聚合活跃候选数量。关注作者列表使用 X `--twitter-*` token，且只有 Following/unfollow 操作；候选卡只使用 Side Panel 的固定样式，列表可见摘要仅留在当前 Side Panel 内存；不保存 Cookie、令牌、剪贴板或文章正文摘要。
- 收件箱文章卡片直接复用 X URL 打开原文，由 X 页面负责真实 DOM、字体和响应式布局；Side Panel 趋势图使用固定 X token 的 SVG 样式，不引入图表依赖。
- 像素级候选集只在当前 X Articles 页面中呈现：扩展只筛除非候选的原生容器，不重绘、复制或向候选卡注入样式；Side Panel 是候选、订阅源、素材库的主入口，不承担像素级 Article 预览。
- X 页面 DOM 会变化；选择器兼容性需通过真实页面人工验收，而非仅依赖静态断言。
