# Active Context

更新日期：2026-08-09

## 当前状态

- `v1.0.0` 已发布，项目只维护 `main` 分支。
- 扩展提供 X/Twitter 当前页面读取、原文预览和不含图片的 Markdown 复制。
- 预览数据通过 `chrome.storage.session` 一次性传递，Preview 读取后立即删除。
- 权限保持最小化：`activeTab`、`storage` 和四个 X/Twitter HTTPS 主机范围。

## 当前技术债与风险

- X 的 DOM、类名和 Article 渲染结构可能变化，`content.js` 的选择器需要定期以真实页面复核。
- 自动化测试覆盖 Markdown 与选择器存在性；尚未替代 Chrome 实际加载、剪贴板权限和真实页面兼容性验收。
