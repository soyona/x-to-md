# x-to-md

`x-to-md` 是一个 Article-first 的 Chrome 扩展：帮助用户发现、筛选、保存并复用高质量 X Article。Article 与作者是可管理对象；Post 只支持详情页即时复制 Markdown。

它不连接 x-to-xhs、不调用 X API、不上传内容，也不需要 API Key。Markdown 只在当前权威原文页采集，复制结果不包含图片。

核心闭环是：`发现 Article → 加入待读 → 打开原文 → 保存为素材 → 预览/复制 Markdown → 标记已使用`。收藏作者后可直接打开该作者的 Articles 继续发现。

## 安装

1. 在 Chrome 打开 `chrome://extensions` 并开启开发者模式。
2. 选择“加载已解压的扩展程序”，选中本项目目录。
3. 在 Article 列表把内容加入“待读”，或直接打开 Article 原文（`/status/<id>` 或 `/article/<id>`）。
4. 在 Article 原文菜单保存为素材，或先预览/复制 Markdown；在 Side Panel 的素材库管理标签和使用状态。

扩展按钮不使用 Chrome 原生 Action Popup。普通 Post 列表不注入入口；Post 详情页只提供“复制 Markdown”，不写入任何集合。Article 列表只管理待读，不读取列表正文。

## 开发

```bash
npm test
```

扩展不需要构建步骤或第三方依赖。`manifest.json` 是 Chrome 加载入口；`content.js` 负责页面采集，`markdown.js` 负责稳定的 Markdown 输出。
