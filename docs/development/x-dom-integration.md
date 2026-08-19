# X DOM 集成契约

本文件记录 x-to-md 与 X Web 集成时已经验证的页面事实和实现边界。只有修改 X DOM、Card、Grok 左侧入口或独立菜单时读取。

## 已验证锚点

- 入口锚点：`button[aria-label="Grok actions"]`
- Post/Card 根节点：`article[data-testid="tweet"]`
- 虚拟列表上下文：`[data-testid="cellInnerDiv"]`
- 局部观察根节点：`main`
- 原生 More：`button[data-testid="caret"][aria-haspopup="menu"]`，只属于 X，不作为扩展菜单触发器
- 当前 `/home`、`/i/history` 与 `/i/history/likes` Card 已验证顶层结构为 `x-to-md slot | Grok slot（可选） | More wrapper`。More wrapper 是入口的权威锚点：x-to-md slot 与 More wrapper 必须共享同一个直接父节点；存在同级 Grok slot 时插在 Grok 左侧，否则直接插在 More 左侧。More 仅用于定位，不点击、不复用其状态或生命周期。
- Article `/status` 已验证同一 Grok 图标按钮可能使用 `aria-label="Summarize"`。`Grok actions` 与 `Summarize` 都属于 utility action 锚点；入口必须插在该按钮左侧，不能因标签变化回退到 More 左侧而改变顺序。
- 入口只复用同级 Grok slot（存在时）或 More button slot（无 Grok 时）的空外壳几何；按钮与 SVG 必须创建在扩展拥有的 Shadow DOM 内。不得克隆 X 按钮/SVG 子树，不得对 X 已连接 SVG 写 path 或调用 `replaceChildren()`，避免 React reconciliation 把扩展图形复用到 Verified 等原生节点。
- 已验证的 `/home`、`/i/history`、`/i/history/likes`、作者 Posts 和作者 Articles 五个列表场景只以各自 Card 内的 `article[data-testid="tweet"]` 作为所有权边界；这些事实不得外推为未经取证的“所有列表页面”通用规则。在这五个场景中，`cellInnerDiv` 仅是虚拟列表定位容器，不是入口 owner。More 必须满足 `moreButton.closest('article[data-testid="tweet"]') === card`。入口 host 必须用新 DIV 创建，不克隆 X 节点；若 host 不再与该 Card 的 More wrapper 共享同一动作行，或被移动到虚拟列表容器，立即删除。
- `/用户名/status/<id>` 详情页只允许当前 URL status ID 对应的主 Post Card 成为入口 owner。主 Card 必须包含指向该 status ID 的站内链接；回复、引用 Post 与其他 `cellInnerDiv` 不参与详情页入口注入。
- Article 详情页的作者元数据属于当前主 `article[data-testid="tweet"]`，与正文采集容器分属不同层级。作者栏已验证使用 `data-testid="Tweet-User-Avatar"`、`data-testid="User-Name"` 和 `svg[data-testid="icon-verified"]`；发布时间使用主 Card 内的 `time[datetime]`。蓝色认证 SVG 是 `#1d9bf0` 单色 path，金色组织认证 SVG 含两个 `linearGradient` 和三个填充 path；采集时据此记录 `blue`／`gold`，不存在徽标则记录空字符串。采集头像、name、徽标与发布时间时必须限定在该主 Card，正文仍使用 Article 正文容器；不得以正文容器缺少作者栏为由回退到全局 document，也不得读取回复或推荐 Card。

入口的直接视觉结构按同一动作行中的兄弟槽位理解：

```text
x-to-md slot | Grok slot（可选） | More wrapper
```

## 已验证场景的 Article-first 入口矩阵

本矩阵只使用用户此前提供的 DOM 证据，不把已验证事实扩展到新页面。列表页中的 `cellInnerDiv` 只负责虚拟列表定位；入口始终归属于内部 Card。Post 与 Article 可能共享 `/用户名/status/<id>` 路由，必须根据当前主 Card 的内容结构区分，不能只依据 URL 猜测类型。

| 场景 | 页面与内容 | 唯一入口 owner | utility action 锚点 | 插入位置 | 必须排除 |
|---|---|---|---|---|---|
| 1 | `/home`、`/i/history`、`/i/history/likes` 列表中的 Article Card | 当前可确认的 Article `article[data-testid="tweet"]` | 同动作行的 `Grok actions`；不存在时以 More wrapper 定位 | utility action 左侧；无 utility action 时在 More 左侧 | 普通 Post、回复、引用、`cellInnerDiv`、其他 Card |
| 2 | `/用户名/status/<id>` 普通 Post 详情页 | 包含当前 URL status ID 站内链接的主 Post `article[data-testid="tweet"]` | `Grok actions`；不存在时以主 Card 的 More wrapper 定位 | utility action 左侧；无 utility action 时在 More 左侧 | 回复、引用 Post、推荐 Card、其他 status ID |
| 3 | `/用户名/status/<id>` Article 详情页 | 包含当前 URL status ID 站内链接的主 Article Card | `Summarize` 或 `Grok actions` | 固定为 `x-to-md | Summarize/Grok | More` | 回复、引用内容、相关 Article、仅凭 URL 推断 Article 类型 |
| 4 | `/用户名` 作者主页 Posts Tab 中可确认的 Article Card | 当前 Article `article[data-testid="tweet"]` | 同动作行的 `Grok actions`；不存在时以 More wrapper 定位 | utility action 左侧；无 utility action 时在 More 左侧 | 普通 Post、`cellInnerDiv`、作者页外壳、相邻 Card |
| 5 | `/用户名/articles` 作者主页 Articles 列表 Card | 当前 Article `article[data-testid="tweet"]` | 同动作行的 `Grok actions`；不存在时以 More wrapper 定位 | utility action 左侧；无 utility action时在 More 左侧 | `cellInnerDiv`、作者页外壳、相邻 Article Card |

作者 Articles 场景经真实 DOM 验证，其入口挂载结构与矩阵中其他已验证列表 Card 相同；该结论只覆盖矩阵中的已验证场景。Card 内的 `data-testid="article-cover-image"` 只用于将内容识别为 Article，不是入口挂载锚点。列表 Card 只提供“加入待读/从待读移除”，不采集正文。

### 变更授权边界

- 上述场景的 DOM owner、锚点和挂载生命周期均基于用户提供的真实 X DOM 源码，不是猜测或通用实现。Article-first 产品边界只改变是否注入和菜单动作，不授权猜测新的 X 结构。
- 未经用户明确授权，不得修改本矩阵中的路由范围、owner、锚点、插入顺序或对应 DOM 实现；“结构相似”“减少重复”“通用化”均不构成授权。
- 新页面或新 DOM 变体不得自动并入现有场景；必须先取得支持该决策的最小 DOM 证据，再由用户明确授权修改。
- 只读诊断可以确认现状，但不构成修改代码、测试、规则或本文档的授权。
- 用户只授权整理文档时，不得同步修改代码、测试、版本号、Manifest、存储或消息协议。

## 所有权边界

| 对象 | 所有者 | 允许的复用 |
|---|---|---|
| Grok/Summarize 按钮和状态 | X | 只读取同级 slot class、计算后几何与颜色；不得克隆已连接按钮或 SVG 子树 |
| More 按钮和 Dropdown | X | 不复用点击、Portal、菜单挂载或重绘生命周期 |
| x-to-md 按钮 | 扩展 | 自主管理 hover、focus、expanded 和 click |
| x-to-md 菜单 | 扩展 | 自主创建、定位、关闭和读取动态状态 |

## 禁止架构

- 不执行原生 `caret.click()` 来打开扩展菜单。
- 不等待或改写 X 的 `[data-testid="Dropdown"]`。
- 不通过隐藏原生菜单项制造“独立菜单”。
- 不通过 `pointerover`、`mousemove`、hover 或滚动启动核心入口注入。
- 不以整个 `document` 作为默认观察范围。
- 不从同一详情页中的相关内容链接推断当前 Post/Article 身份。

## 注入生命周期

1. Content Script 初始化并发布可读取的 revision/阶段诊断。
2. 若 `main` 尚未挂载，以可取消的短周期任务等待。
3. `main` 可用后，在矩阵列出的已验证列表场景中只扫描当前可见的 `article[data-testid="tweet"]` Card，不把 `cellInnerDiv` 当作注入根；不得把该结论自动扩展到未取证页面。
4. 只观察 `main` 中新增节点所属的局部 Card。
5. 以 `data-x-to-md-article-actions-slot` 标记扩展拥有的完整槽位，并在释放时连同入口整体删除；旧入口兼容清理也必须删除父槽位。
   - 只有仍与 More wrapper 共享已验证动作行、且 Shadow DOM 中仍含扩展入口的 slot 才可整体删除。
   - 若 slot 已被 X React 移动或复用，禁止删除宿主节点；只清空扩展 Shadow DOM、移除扩展标记和扩展添加的 `margin-left`，避免删除 X 的 Stream 或页面根布局。
6. 点击入口后，从所属 Card 或详情主 Card 生成内容上下文并直接创建扩展菜单。
   - 普通 Post 列表不注入；Post 详情只提供“复制 Markdown”，不预览、不持久化。
   - Article 列表只提供“加入待读/从待读移除”，不采集正文。
   - Article 详情固定为“保存为素材/从素材库移除”“预览 / 复制 Markdown”“收藏作者/取消收藏作者”。保存与预览只采集当前 URL 对应的权威主 Article，不打开后台临时 X 标签。
   - Capture 只允许展开目标 root 内的折叠内容；不得以整个文档高度为条件调用 `window.scrollTo()` 加载 Timeline、回复或推荐内容。
   - Article 标题以原文页的 `twitter-article-title`（及兼容标题 testid）为权威来源；采集块中与其完全相同的一级标题只保留一次。`Click to Follow/Subscribe` 属于 X 控件文案，不进入正文。
7. 新打开或刷新的 X 页面只通过 Manifest `content_scripts` 声明式注入；Service Worker 启动、扩展安装和浏览器启动时不得扫描全部 X Tab 并主动执行脚本。只有用户点击扩展图标时，后台才可对当前 Tab 做显式补救注入。
8. 再次点击、点击外部、`Escape`、滚动或窗口缩放时关闭菜单。
9. Content Script dispose 时释放定时器、观察器、样式、菜单和入口节点。

## UI 分层诊断

遇到视觉问题时按层级定位，不用同一组 CSS 同时猜测多个原因：

| 现象 | 首先检查 |
|---|---|
| 图形轮廓不正确 | SVG path 与 `viewBox` |
| 图标大小不一致 | SVG class、width、height |
| 与 Grok/More 不对齐 | slot、按钮内部结构、flex 与 line box |
| hover 无反馈 | 按钮自身 hover/focus/expanded 状态 |
| Card 内容发生位移 | 注入节点几何和动作行父容器布局 |
| 图标延迟出现 | Content Script revision、`main` 等待和局部观察阶段 |

## 最小 DOM 取证

页面结构不确定时，只返回支持当前决策的小型 JSON。至少包括：目标数量、直接父节点、最近 Card 和关键祖先属性。禁止先返回整页 DOM 再裁剪。

当前诊断入口：

```js
({
  revision: document.documentElement.dataset.xToMdContentScriptRevision,
  stage: document.documentElement.dataset.xToMdArticleActionsStage,
  grok: document.querySelectorAll('button[aria-label="Grok actions"]').length,
  xToMd: document.querySelectorAll('[data-x-to-md-article-actions-entry]').length,
})
```

## 行为验收矩阵

至少覆盖：Home 普通 Post 无入口、列表 Article 的待读入口、作者 Posts/Articles、Post `/status` 的单项复制菜单、Article `/status` 或 `/article` 的三项菜单；验证入口位置、hover/focus、菜单无 More 闪现、动态文案、当前 Card 上下文、重复注入、虚拟列表追加、关闭方式和 Content Script 重载。

禁止自动启动 Chrome 或浏览器自动化。若现有证据不足以确认 X DOM、SVG 或计算样式，必须要求用户通过 Chrome DevTools 提供支持当前决策的最小源码或属性片段，禁止猜测。

静态测试必须明确阻止原生 More 依赖；真实 X 页面兼容性、剪贴板权限、视觉对齐和扩展加载行为保持未验证，只能由用户人工验收并提供结果。
