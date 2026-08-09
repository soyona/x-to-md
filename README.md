# x-to-md

`x-to-md` 是一个独立的 Chrome 扩展：用户在 X 推文或 Article 页面主动读取内容、预览并复制不含图片的 Markdown。

它不连接 x-to-xhs、不调用 X API、不上传内容，也不需要 API Key。用户点击提取后会立即复制 Markdown，并打开原文阅读预览；复制结果不包含图片，可粘贴到任何支持 Markdown 的编辑器或写作工具。

## 安装

1. 在 Chrome 打开 `chrome://extensions` 并开启开发者模式。
2. 选择“加载已解压的扩展程序”，选中本项目目录。
3. 打开 X 推文或 Article，点击扩展按钮并选择“读取、预览并复制 Markdown”。

预览数据只使用 Chrome 的一次性会话存储，预览页读取后即删除。

## 开发

```bash
npm test
```

扩展不需要构建步骤或第三方依赖。`manifest.json` 是 Chrome 加载入口；`content.js` 负责页面采集，`markdown.js` 负责稳定的 Markdown 输出。
