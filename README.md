# x-to-md

`x-to-md` 是一个独立的 Chrome 扩展：用户在 X 推文或 Article 页面主动读取内容、预览并复制不含图片的 Markdown。

它不连接 x-to-xhs、不调用 X API、不上传内容，也不需要 API Key。`Extract and copy` 仅在 Article 原文页（`/status/<id>` 或 `/article/<id>`）执行；列表页 Article Card 的 Bookmark 与 More 只会打开对应原文。复制结果不包含图片。

## 安装

1. 在 Chrome 打开 `chrome://extensions` 并开启开发者模式。
2. 选择“加载已解压的扩展程序”，选中本项目目录。
3. 打开目标 Article 原文（`/status/<id>` 或 `/article/<id>`）。列表页 Card 的 Bookmark 或 More 可先导航到原文。
4. 在原文 Bookmark 或 More 菜单点击 `Extract and copy`，再选择 `Save to library`。

扩展按钮不使用 Chrome 原生 Action Popup。收件箱和其他列表中的 Article Card 只打开 X 原文，不读取列表正文；Markdown 只在用户主动触发的原文提取会话中处理。

## 开发

```bash
npm test
```

扩展不需要构建步骤或第三方依赖。`manifest.json` 是 Chrome 加载入口；`content.js` 负责页面采集，`markdown.js` 负责稳定的 Markdown 输出。
