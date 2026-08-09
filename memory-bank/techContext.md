# Technical Context

## 定位

`x-to-md` 是独立的 Manifest V3 Chrome 扩展。它将用户当前打开的 X/Twitter 推文或 Article 页面转换为可复制的 Markdown；不依赖、调用或写入其他本地项目。

## 运行模型

```text
用户点击扩展 Action → 当前 X 页面内打开圆角导入面板
→ Content Script 读取当前页面 DOM → Capture v1 → 复制 Markdown
→ 面板自动关闭 → 当前 X 文档进入原生视觉预览
```

## 模块与数据流

| 文件 | 责任 |
|---|---|
| `manifest.json` | `activeTab`、`storage`、service worker 与 X/Twitter 内容脚本匹配；不配置 `default_popup`，避免 Chrome 原生 Popup 的矩形窗口阴影 |
| `background.js` | 接收扩展 Action 点击，并向当前 X 标签发送 `toggle-import-panel` |
| `content.js` | 生成 `{ kind: "x-to-xhs.capture", version: 1, sourceUrl, blocks, content }` |
| `markdown.js` | 将 `blocks` 序列化为 Markdown；`includeImages: false` 用于复制 |
| `popup.js` | 保留旧 Popup 兼容流程；当前入口由 `background.js` + `content.js` 的页面内面板承载 |
| `preview.js` | 保留 v1 语义预览兼容代码，不作为 v2 原生视觉预览渲染器 |

## 约束

- 仅支持 `x.com`、`www.x.com`、`twitter.com` 与 `www.twitter.com` 的 HTTPS 页面。
- 不需要构建流程或第三方运行时依赖；测试使用 Node 内置 `node:test`。
- v2 原生预览不使用 `chrome.storage.session` 传递视觉内容；采集结果留在当前 content script 会话中。
- v2 视觉预览必须保留正文节点及其祖先布局，直接复用 X 页面已经加载的 CSS 与字体。
- X 页面 DOM 会变化；选择器兼容性需通过真实页面人工验收，而非仅依赖静态断言。
