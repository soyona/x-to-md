# 仓库模块与存储契约

本文件是当前有效的模块、消息和存储边界。修改模块职责、消息协议、存储键、持久化或一次性预览时读取，并以源码和测试同步验证。

## 模块职责

| 模块 | 当前职责 |
|---|---|
| `manifest.json` | Manifest V3、最小权限、X/Twitter 主机范围、Side Panel、Service Worker 与 Content Script 注册 |
| `background.js` | Content Script revision 校验与补注入；素材库保存/移除；一次性 Markdown 预览会话；打开并导航 Side Panel |
| `content.js` | X DOM 提取与 Capture；Grok 左侧独立入口；独立五项菜单；当前 Card 上下文；候选、关注和素材操作 |
| `markdown.js` | Capture blocks 到 Markdown 的纯转换；保持无浏览器页面依赖，供 Node 测试直接执行 |
| `sidepanel.*` | 候选集、关注作者、素材库、统计和设置的主工作界面；持久数据读写与本地导航状态 |
| `popup.*` | 旧 Popup 兼容路径：校验当前 X 标签、请求 Capture 并复制 Markdown；不作为主工作界面 |
| `preview.*` | 读取一次性 session 预览并立即删除对应 key；支持 Capture 兼容预览和素材 Markdown 预览 |
| `test/` | Markdown、Capture、Manifest、存储/消息协议、独立菜单和 Side Panel 行为契约 |

## `chrome.storage.local` 持久数据

只有用户主动产生且需要跨会话保留的产品数据进入本地持久存储。

| Key | 内容与约束 |
|---|---|
| `x-to-md-content-inbox` | `subscriptions`、`candidates`、`assets`；素材由用户明确保存，包含 Markdown、来源 URL 和展示元数据；按规范化来源 URL 去重 |
| `x-to-md-navigation-badges` | 候选、关注和素材页面的本地已读基线 |
| `x-to-md-navigation-layout` | Side Panel 导航栏位置与最近可见位置 |

- 候选只保存列表和展示所需元数据，不以候选动作隐式保存完整 Markdown。
- 完整 Markdown 只有用户明确执行“加入素材库”后才作为素材持久保存。
- 关注、候选和素材状态变化通过 `chrome.storage.onChanged` 同步到已打开的 Side Panel。
- 不持久化 Cookie、令牌、剪贴板内容或未经用户主动保存的页面正文。

## `chrome.storage.session` 一次性数据

| Key | 用途 | 消费规则 |
|---|---|---|
| `library-markdown-preview` | 从当前 X 内容或素材库打开 Markdown 阅读页 | `preview.js` 读取后立即删除 |
| `x-to-md-sidepanel-target` | 打开 Side Panel 后的一次性目标视图 | `sidepanel.js` 读取后立即删除 |
| `latest-capture` | 旧 Capture 预览兼容读取 key | 若存在，`preview.js` 读取后立即删除 |

一次性预览和导航目标不得迁移到 `chrome.storage.local`。打开 Side Panel 时先保留用户手势调用 `chrome.sidePanel.open`，再写入目标视图并发送导航消息。

## 消息边界

- `save-capture-to-library` 和 `remove-capture-from-library` 由 Background 统一修改 `x-to-md-content-inbox`。
- `open-markdown-preview` 由 Background 写入一次性 `library-markdown-preview` 并打开阅读页。
- `open-side-panel` 由 Background 打开 Side Panel，并把目标限制为 `candidates`、`assets` 或 `subscriptions`。
- Content Script revision 不匹配时，Background 补注入打包的 `markdown.js` 与 `content.js`，并在注入后再次确认 revision。
- 变更任何消息名、payload、存储 key 或消费时序时，必须同步生产者、消费者、测试和项目技术上下文。

## 权限与数据安全

- 权限保持为当前 Manifest 声明的 `activeTab`、`storage`、`sidePanel`、`scripting` 和四个 X/Twitter HTTPS 主机范围。
- 不调用 X API、oEmbed、公共代理或自建上传服务，不添加远程脚本、跟踪分析或远程代码执行。
- 新增权限、扩大主机范围、改变持久化正文边界或新增外部数据路径，必须说明原因、补充测试并取得用户明确授权。
