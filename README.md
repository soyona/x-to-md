# x-to-md

`x-to-md` 是一个独立的 Chrome 扩展：用户在 X 推文或 Article 页面主动读取内容、预览并复制不含图片的 Markdown。

它不连接 x-to-xhs、不调用 X API、不上传内容，也不需要 API Key。用户点击提取后会立即复制 Markdown，并在当前 X 页面进入原生预览模式；预览直接复用 X 当前页面的 CSS、字体、容器宽度和响应式布局，复制结果不包含图片。

## 安装

1. 在 Chrome 打开 `chrome://extensions` 并开启开发者模式。
2. 选择“加载已解压的扩展程序”，选中本项目目录。
3. 打开 X 推文或 Article，点击扩展按钮，在 X 页面内打开“保存 Markdown”面板。
4. 点击“提取并复制”；成功后面板自动关闭，并直接进入当前 X 文档的原生预览。

扩展按钮不使用 Chrome 原生 Action Popup，而是在当前 X 页面内显示圆角面板，避免浏览器窗口边界产生直角阴影。收件箱文章卡片直接打开 X 原文，不复制或仿写 X 的正文样式；Markdown 只在当前扩展会话中处理。

## 开发

```bash
npm test
```

扩展不需要构建步骤或第三方依赖。`manifest.json` 是 Chrome 加载入口；`content.js` 负责页面采集，`markdown.js` 负责稳定的 Markdown 输出。
