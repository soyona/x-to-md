# Technical Context

## 定位

`x-to-md` 是独立的 Manifest V3 Chrome 扩展。它将用户当前打开的 X/Twitter 推文或 Article 页面转换为可复制的 Markdown；不依赖、调用或写入其他本地项目。

## 运行模型

```text
用户点击 Popup → Content Script 读取当前页面 DOM → Capture v1
→ chrome.storage.session → Preview 展示 / 用户复制 Markdown
```

## 模块与数据流

| 文件 | 责任 |
|---|---|
| `manifest.json` | `activeTab`、`storage` 与 X/Twitter 内容脚本匹配 |
| `content.js` | 生成 `{ kind: "x-to-xhs.capture", version: 1, sourceUrl, blocks, content }` |
| `markdown.js` | 将 `blocks` 序列化为 Markdown；`includeImages: false` 用于复制 |
| `popup.js` | 向当前标签发送 `capture-x`，复制 Markdown，并写入一次性会话数据 |
| `preview.js` | 读取并立即清除 `latest-capture`，渲染预览并支持再次复制 |

## 约束

- 仅支持 `x.com`、`www.x.com`、`twitter.com` 与 `www.twitter.com` 的 HTTPS 页面。
- 不需要构建流程或第三方运行时依赖；测试使用 Node 内置 `node:test`。
- `chrome.storage.session` 不是持久化存储，预览数据不能进入任何服务端、日志或 Git 文件。
- X 页面 DOM 会变化；选择器兼容性需通过真实页面人工验收，而非仅依赖静态断言。
