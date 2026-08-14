# x-to-md UI 图标规范

本规范保存用户确认的方案 1 图标语义与状态，是项目内图标选择、实现和验收的单一权威规范。品牌实现以仓库中的矢量源为权威，不从设计图反向描摹。

## 权威文件与优先级

1. 品牌源：`assets/icons/x-to-md-icon-source.svg`、`assets/icons/x-to-md-entry.svg`。
2. UI 图标库：`assets/icons/x-to-md-ui-icons.svg`；`symbol id` 是组件调用的稳定语义标识。
3. 视觉规范图：`docs/design/x-to-md-ui-icon-spec.svg`；`docs/design/x-to-md-ui-icon-spec.png` 是其人工查看版本。
4. 运行时内联 SVG 必须与图标库中同语义 `symbol` 保持相同的图形、viewBox、描边和填充规则。

后续新增或修改按钮、菜单、导航时，必须先从图标库按语义选用。若不存在对应语义，须先基于用户提供的 X SVG／组件证据补充图标库、映射表和契约测试，再进入业务界面；禁止临时内联自创 path、emoji 或 Unicode 图标。

## 品牌源

- 插件图标：`assets/icons/x-to-md-icon-source.svg`。
- X 页面与 Side Panel 单色入口：`assets/icons/x-to-md-entry.svg`。
- X 图形只使用用户从 X DevTools 提供的官方 `24×24` path；禁止修改 path 数据、增删节点或凭截图重绘。
- 右侧 Article/Markdown 文档的可见底边与官方 X 最低点对齐；外框 `1.35`，内部正文线 `0.78`。
- `16`、`32`、`48`、`128` PNG 只从正式 SVG 源生成。

## 导航状态

| 页面 | Default | Hover | Active | Focus visible |
|---|---|---|---|---|
| 待读 | `nav-reading-outline` | `nav-reading-filled` | `nav-reading-filled` | `nav-reading-outline` |
| 素材库 | `nav-library-outline` | `nav-library-filled` | `nav-library-filled` | `nav-library-outline` |
| 作者 | `nav-authors-outline` | `nav-authors-filled` | `nav-authors-filled` | `nav-authors-outline` |

- Default：`#536471` 线框。
- Hover：`#0f1419` 图标与 X 中性圆形 hover 背景。
- Active：`#1d9bf0` 填充图标，不显示持续边框或焦点环。
- Focus visible：只在键盘焦点时显示 `2px #1d9bf0` 焦点环；不得与 Active 合并。

## 语义图标

| 动作 | `symbol id` |
|---|---|
| 加入／移出待读 | `reading-add`／`reading-remove` |
| 保存／移出素材库 | `library-add`／`library-remove` |
| 预览 Article | `article-preview` |
| 复制 Markdown | `markdown-copy` |
| 收藏／取消收藏作者 | `author-add`／`author-remove` |
| 打开原文 | `open-original` |
| 编辑标签 | `edit-tags` |
| 标记已使用／未使用 | `mark-used`／`mark-unused` |
| 删除 | `delete`；只使用 destructive 颜色 |
| 搜索／更多／添加／关闭／复制 | `search`／`more`／`add`／`close`／`copy` |

菜单统一使用 `24×24` 图标槽、约 `1.9px` 圆角描边、`currentColor` 和 `12px` 图文间距。相反动作不得复用完全相同的图形。

## 设计证据

- `x-to-md-logo-approved.png`：最终 Logo 比例和对齐证据。
- `x-to-md-ui-icon-spec.svg`：最终导航、菜单、动作和状态规范图。
- `x-to-md-ui-icon-spec.png`：由上述规范图和正式图标库生成的人工验收图，不再包含历史 Logo 方案。
