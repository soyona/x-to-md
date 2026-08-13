# 已完成进度归档（2026-08-12）

- [x] X 原文详情页的 Bookmark 与 More 统一直接添加至/移出素材库；`Extract and copy` 改为仅复制并反馈，不再要求保存确认或打开 Side Panel。
- [x] 移除扩展 Bookmark hover/focus 悬浮入口，统一通过 More 菜单承载候选集与素材库动作；候选集导航和动作使用托盘图标，素材库使用书签图标。
- [x] 在作者 Articles 列表的每张卡片及 X Article 原文中支持从 Bookmark 位置添加至收件箱，并按 Article URL 去重写入候选元数据。
- [x] 在扩展更新/启动时及用户点击 Action 后，仅以当前 content script 的明确就绪回复作为版本判据；旧脚本或缺失脚本均补注入已打包 content script，避免页面交互因保留旧版脚本而完全不可用。
